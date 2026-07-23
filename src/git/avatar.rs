//! Resolve a commit author's GitHub avatar.
//!
//! Two tiers, cheapest first: GitHub's `noreply` commit emails already encode
//! the account (a numeric id, or the login), so an avatar URL comes straight
//! from the string with no network call. Anything else falls back to a `gh`
//! user search — authenticated, rate-limited, and skipped when `gh` is absent.

use std::process::Command;

use super::fetch::hide_console;

const NOREPLY_SUFFIX: &str = "@users.noreply.github.com";

/// The avatar URL a GitHub `noreply` email encodes, if any.
///
/// `<id>+<login>@users.noreply.github.com` → the id's avatar; the older
/// `<login>@users.noreply.github.com` → the login's `.png`. The account-less
/// `noreply@github.com`/`noreply@users.noreply.github.com` name no user.
pub fn noreply_avatar_url(email: &str) -> Option<String> {
    let local = email.trim().to_ascii_lowercase();
    let local = local.strip_suffix(NOREPLY_SUFFIX)?;
    if local.is_empty() || local == "noreply" {
        return None;
    }
    if let Some((id, _login)) = local.split_once('+') {
        if !id.is_empty() && id.bytes().all(|b| b.is_ascii_digit()) {
            return Some(format!("https://avatars.githubusercontent.com/u/{id}?v=4"));
        }
        return None;
    }
    if local.bytes().all(is_login_byte) {
        return Some(format!("https://github.com/{local}.png"));
    }
    None
}

/// GitHub logins are ASCII alphanumerics and single hyphens.
fn is_login_byte(b: u8) -> bool {
    b.is_ascii_alphanumeric() || b == b'-'
}

/// The `gh` search that maps an email to an avatar, for the command log.
pub fn avatar_search_command(email: &str) -> String {
    format!("gh api -X GET search/users -f q=\"{email} in:email\"")
}

/// Look up `email`'s GitHub avatar with an authenticated `gh` user search.
/// Returns `None` on any failure — no `gh`, no match, offline, rate-limited —
/// so a missing avatar never surfaces as an error.
pub fn gh_search_avatar(email: &str) -> Option<String> {
    let mut command = Command::new("gh");
    command.args([
        "api",
        "-X",
        "GET",
        "search/users",
        "-f",
        &format!("q={email} in:email"),
        "--jq",
        ".items[0].avatar_url // empty",
    ]);
    hide_console(&mut command);
    let output = command.output().ok().filter(|o| o.status.success())?;
    parse_avatar_output(&String::from_utf8_lossy(&output.stdout))
}

/// The single avatar URL a `--jq '.items[0].avatar_url'` run prints, if the
/// search matched a user (empty output means no match).
fn parse_avatar_output(stdout: &str) -> Option<String> {
    let url = stdout.trim();
    if url.starts_with("https://") {
        Some(url.to_string())
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn numeric_noreply_email_maps_to_the_account_avatar() {
        assert_eq!(
            noreply_avatar_url("49699333+dependabot[bot]@users.noreply.github.com"),
            Some("https://avatars.githubusercontent.com/u/49699333?v=4".to_string())
        );
        // Case-insensitive and whitespace-tolerant.
        assert_eq!(
            noreply_avatar_url("  1234+Octocat@Users.NoReply.GitHub.com  "),
            Some("https://avatars.githubusercontent.com/u/1234?v=4".to_string())
        );
    }

    #[test]
    fn login_only_noreply_email_maps_to_the_login_png() {
        assert_eq!(
            noreply_avatar_url("octocat@users.noreply.github.com"),
            Some("https://github.com/octocat.png".to_string())
        );
    }

    #[test]
    fn non_github_and_accountless_emails_have_no_direct_avatar() {
        assert_eq!(noreply_avatar_url("dev@example.com"), None);
        assert_eq!(noreply_avatar_url("noreply@users.noreply.github.com"), None);
        assert_eq!(noreply_avatar_url("@users.noreply.github.com"), None);
        // A non-numeric id before '+' is not a valid encoding.
        assert_eq!(noreply_avatar_url("bad+id@users.noreply.github.com"), None);
    }

    #[test]
    fn parses_a_gh_search_avatar_url_and_rejects_empty() {
        assert_eq!(
            parse_avatar_output("https://avatars.githubusercontent.com/u/9?v=4\n"),
            Some("https://avatars.githubusercontent.com/u/9?v=4".to_string())
        );
        assert_eq!(parse_avatar_output(""), None);
        assert_eq!(parse_avatar_output("not-a-url"), None);
    }
}
