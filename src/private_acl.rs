//! On Windows, a directory its owner alone may enter: an access list of its
//! own, inherited from nothing, granting the user, SYSTEM and
//! Administrators, which everything created inside inherits (ADR 0077).
//! A profile's directories may grant others read access, as a sandbox's
//! group can be granted `%LOCALAPPDATA%`.

use std::io;
use std::os::windows::ffi::OsStrExt;
use std::path::Path;

use windows_sys::Win32::Foundation::{CloseHandle, LocalFree, HANDLE};
use windows_sys::Win32::Security::Authorization::{
    ConvertSidToStringSidW, ConvertStringSecurityDescriptorToSecurityDescriptorW,
    SetNamedSecurityInfoW, SDDL_REVISION_1, SE_FILE_OBJECT,
};
use windows_sys::Win32::Security::{
    GetSecurityDescriptorDacl, GetTokenInformation, TokenUser, ACL, DACL_SECURITY_INFORMATION,
    PROTECTED_DACL_SECURITY_INFORMATION, PSECURITY_DESCRIPTOR, TOKEN_QUERY, TOKEN_USER,
};
use windows_sys::Win32::System::Threading::{GetCurrentProcess, OpenProcessToken};

/// Give `dir` an access list inherited from nothing that grants only the
/// current user, SYSTEM and Administrators, for it and what it holds; the
/// files already in it take it too.
pub fn protect(dir: &Path) -> io::Result<()> {
    set_dacl(
        dir,
        &format!(
            "D:P(A;OICI;FA;;;{})(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)",
            user_sid()?
        ),
    )
}

/// Set the access list `sddl` describes on `dir`, the files already in it
/// taking its inheritable entries.
fn set_dacl(dir: &Path, sddl: &str) -> io::Result<()> {
    let sddl = wide(sddl.as_ref());
    let path = wide(dir.as_os_str());
    let mut descriptor: PSECURITY_DESCRIPTOR = std::ptr::null_mut();
    // SAFETY: both strings are NUL-terminated and outlive the calls; the
    // descriptor the first call allocates is freed below, and the access
    // list read from it is used before that.
    unsafe {
        if ConvertStringSecurityDescriptorToSecurityDescriptorW(
            sddl.as_ptr(),
            SDDL_REVISION_1,
            &mut descriptor,
            std::ptr::null_mut(),
        ) == 0
        {
            return Err(io::Error::last_os_error());
        }
        let mut present = 0;
        let mut defaulted = 0;
        let mut dacl: *mut ACL = std::ptr::null_mut();
        let read = GetSecurityDescriptorDacl(descriptor, &mut present, &mut dacl, &mut defaulted);
        let status = if read == 0 {
            Err(io::Error::last_os_error())
        } else {
            match SetNamedSecurityInfoW(
                path.as_ptr(),
                SE_FILE_OBJECT,
                DACL_SECURITY_INFORMATION | PROTECTED_DACL_SECURITY_INFORMATION,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                dacl,
                std::ptr::null(),
            ) {
                0 => Ok(()),
                code => Err(io::Error::from_raw_os_error(code as i32)),
            }
        };
        LocalFree(descriptor);
        status
    }
}

/// The current user's SID in its string form.
fn user_sid() -> io::Result<String> {
    // SAFETY: the token handle is closed on every path; the buffer is sized
    // by the first call and holds a TOKEN_USER the second writes, whose SID
    // points inside it; the string the conversion allocates is freed.
    unsafe {
        let mut token: HANDLE = std::ptr::null_mut();
        if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) == 0 {
            return Err(io::Error::last_os_error());
        }
        let mut size = 0;
        GetTokenInformation(token, TokenUser, std::ptr::null_mut(), 0, &mut size);
        let mut buffer = vec![0u8; size as usize];
        let read = GetTokenInformation(
            token,
            TokenUser,
            buffer.as_mut_ptr().cast(),
            size,
            &mut size,
        );
        let failure = (read == 0).then(io::Error::last_os_error);
        CloseHandle(token);
        if let Some(failure) = failure {
            return Err(failure);
        }
        let user = buffer.as_ptr().cast::<TOKEN_USER>().read_unaligned();
        let mut text: *mut u16 = std::ptr::null_mut();
        if ConvertSidToStringSidW(user.User.Sid, &mut text) == 0 {
            return Err(io::Error::last_os_error());
        }
        let length = (0..).take_while(|&i| *text.add(i) != 0).count();
        let sid = String::from_utf16_lossy(std::slice::from_raw_parts(text, length));
        LocalFree(text.cast());
        Ok(sid)
    }
}

/// `text` as a NUL-terminated UTF-16 string.
fn wide(text: &std::ffi::OsStr) -> Vec<u16> {
    text.encode_wide().chain(std::iter::once(0)).collect()
}

/// The access list of `path` in SDDL, as the system reads it back.
#[cfg(test)]
pub(crate) fn dacl_sddl(path: &Path) -> String {
    use windows_sys::Win32::Security::Authorization::{
        ConvertSecurityDescriptorToStringSecurityDescriptorW, GetNamedSecurityInfoW,
    };
    let path = wide(path.as_os_str());
    let mut descriptor: PSECURITY_DESCRIPTOR = std::ptr::null_mut();
    let mut text: *mut u16 = std::ptr::null_mut();
    // SAFETY: the path is NUL-terminated; both buffers the system
    // allocates are freed after the text is copied out.
    unsafe {
        let read = GetNamedSecurityInfoW(
            path.as_ptr(),
            SE_FILE_OBJECT,
            DACL_SECURITY_INFORMATION,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            &mut descriptor,
        );
        assert_eq!(read, 0, "reading the access list failed");
        let converted = ConvertSecurityDescriptorToStringSecurityDescriptorW(
            descriptor,
            SDDL_REVISION_1,
            DACL_SECURITY_INFORMATION,
            &mut text,
            std::ptr::null_mut(),
        );
        assert_ne!(converted, 0, "{}", io::Error::last_os_error());
        let length = (0..).take_while(|&i| *text.add(i) != 0).count();
        let sddl = String::from_utf16_lossy(std::slice::from_raw_parts(text, length));
        LocalFree(text.cast());
        LocalFree(descriptor);
        sddl
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn user_sid() -> String {
        super::user_sid().unwrap()
    }

    /// How SDDL names the user `sid`: the built-in Administrator account,
    /// RID 500, by its alias, as a CI runner's account may be.
    fn sddl_name(sid: &str) -> String {
        if sid.ends_with("-500") {
            "LA".to_string()
        } else {
            sid.to_string()
        }
    }

    /// The trustees an SDDL access list grants anything to.
    fn trustees(sddl: &str) -> Vec<String> {
        let dacl = sddl.split("D:").nth(1).unwrap_or_default();
        dacl.split('(')
            .skip(1)
            .filter_map(|ace| ace.trim_end_matches(')').rsplit(';').next())
            .map(|trustee| trustee.trim_end_matches(')').to_string())
            .collect()
    }

    #[test]
    fn a_protected_directory_and_what_it_holds_grant_only_the_user_system_and_administrators() {
        let tmp = tempfile::tempdir().unwrap();
        let user = user_sid();
        // A parent that also lets every user read, as a profile may let a
        // sandbox's group, so what is already inside inherits that.
        set_dacl(
            tmp.path(),
            &format!("D:P(A;OICI;FA;;;{user})(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)(A;OICI;FR;;;BU)"),
        )
        .unwrap();
        let dir = tmp.path().join("servers");
        std::fs::create_dir(&dir).unwrap();
        let held = dir.join("4000.json");
        std::fs::write(&held, "{}").unwrap();
        assert!(trustees(&dacl_sddl(&held)).contains(&"BU".to_string()));

        protect(&dir).unwrap();

        for path in [&dir, &held] {
            let sddl = dacl_sddl(path);
            let dacl = sddl.split("D:").nth(1).unwrap_or_default();
            if path == &dir {
                assert!(dacl.starts_with('P'), "{} inherits: {sddl}", path.display());
            }
            let mut granted = trustees(&sddl);
            granted.sort();
            granted.dedup();
            let mut expected = vec!["BA".to_string(), "SY".to_string(), sddl_name(&user)];
            expected.sort();
            assert_eq!(granted, expected, "{}: {sddl}", path.display());
        }
    }
}
