//! The Windows binary carries its own C runtime, so it starts on a machine
//! without the Visual C++ Redistributable (ADR 0032).

#![cfg(all(windows, target_env = "msvc"))]

/// Whether `haystack` contains `needle`, ignoring ASCII case: the PE import
/// table spells DLL names in whatever case the import library chose.
fn contains_ignore_case(haystack: &[u8], needle: &[u8]) -> bool {
    haystack
        .windows(needle.len())
        .any(|window| window.eq_ignore_ascii_case(needle))
}

#[test]
fn the_executable_does_not_import_the_visual_cpp_runtime() {
    let exe = std::fs::read(env!("CARGO_BIN_EXE_gitreant")).unwrap();

    for dll in ["vcruntime140.dll", "msvcp140.dll", "api-ms-win-crt-"] {
        assert!(
            !contains_ignore_case(&exe, dll.as_bytes()),
            "gitreant.exe imports {dll}"
        );
    }
}
