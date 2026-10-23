//! Count the lines each commit adds and deletes against its first parent
//! (ADR 0041), by delegating to `git diff-tree`.

use std::collections::HashMap;
use std::io::Write;
use std::path::Path;
use std::process::{Command, Stdio};

use super::fetch::hide_console;

/// Lines added and deleted.
pub type LineCount = (u64, u64);

const COUNT_ARGS: [&str; 7] = [
    "diff-tree",
    "--stdin",
    "--always",
    "-r",
    "--numstat",
    "-M",
    "--root",
];

/// The command line [`count_lines`] executes, for the command log.
pub fn count_command(path: &Path, commits: usize) -> String {
    format!(
        "git -C {} {} ({commits} commits on stdin)",
        path.display(),
        COUNT_ARGS.join(" ")
    )
}

/// Count each of `commits` — a commit id with its first parent, or none for
/// a root commit — against that parent, keyed by commit id.
pub fn count_lines(
    path: &Path,
    commits: &[(String, Option<String>)],
) -> Result<HashMap<String, LineCount>, String> {
    let input: String = commits
        .iter()
        .map(|(id, parent)| match parent {
            Some(parent) => format!("{id} {parent}\n"),
            None => format!("{id}\n"),
        })
        .collect();
    let mut command = Command::new("git");
    command
        .arg("-C")
        .arg(path)
        .args(COUNT_ARGS)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    hide_console(&mut command);
    let mut child = command
        .spawn()
        .map_err(|e| format!("run git diff-tree: {e} (is git installed?)"))?;
    // Fed from its own thread: git answers while it reads, and a full
    // stdout pipe would otherwise stall both sides.
    let mut stdin = child.stdin.take().expect("piped stdin");
    let feeder = std::thread::spawn(move || stdin.write_all(input.as_bytes()));
    let output = child
        .wait_with_output()
        .map_err(|e| format!("run git diff-tree: {e}"))?;
    let _ = feeder.join();
    if output.status.success() {
        Ok(parse_counts(&String::from_utf8_lossy(&output.stdout)))
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

/// Read `diff-tree --numstat` output: a bare commit id opens that commit,
/// and each `added<TAB>deleted<TAB>path` line after it adds to it; a binary
/// file's `-` counts as nothing.
fn parse_counts(stdout: &str) -> HashMap<String, LineCount> {
    let mut counts = HashMap::new();
    let mut current: Option<&str> = None;
    for line in stdout.lines() {
        let mut fields = line.splitn(3, '\t');
        match (fields.next(), fields.next(), fields.next()) {
            (Some(added), Some(deleted), Some(_)) => {
                if let Some(id) = current {
                    let count: &mut LineCount = counts.entry(id.to_string()).or_default();
                    count.0 += added.parse::<u64>().unwrap_or(0);
                    count.1 += deleted.parse::<u64>().unwrap_or(0);
                }
            }
            (Some(id), None, None) if is_commit_id(id) => {
                current = Some(id);
                counts.entry(id.to_string()).or_default();
            }
            _ => {}
        }
    }
    counts
}

fn is_commit_id(text: &str) -> bool {
    text.len() >= 7 && text.chars().all(|c| c.is_ascii_hexdigit())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn sums_each_commit_and_counts_binary_files_as_nothing() {
        let counts = parse_counts(
            "1111aaaa\n3\t1\tsrc/a.rs\n-\t-\timage.png\n2\t0\tdocs/b.md\n2222bbbb\n3333cccc\n0\t4\told => new\n",
        );
        assert_eq!(counts.get("1111aaaa"), Some(&(5, 1)));
        assert_eq!(counts.get("2222bbbb"), Some(&(0, 0)));
        assert_eq!(counts.get("3333cccc"), Some(&(0, 4)));
        assert_eq!(counts.len(), 3);
        assert!(parse_counts("").is_empty());
    }

    #[test]
    fn the_command_names_what_it_runs() {
        let command = count_command(&PathBuf::from("/repos/demo"), 3);
        assert!(command.starts_with("git -C /repos/demo diff-tree --stdin"));
        assert!(command.contains("--numstat -M --root"));
        assert!(command.ends_with("(3 commits on stdin)"));
    }

    fn git(dir: &Path, args: &[&str]) -> String {
        let output = Command::new("git")
            .current_dir(dir)
            .args(args)
            .env("GIT_AUTHOR_NAME", "T")
            .env("GIT_AUTHOR_EMAIL", "t@e.com")
            .env("GIT_COMMITTER_NAME", "T")
            .env("GIT_COMMITTER_EMAIL", "t@e.com")
            .output()
            .unwrap();
        assert!(output.status.success(), "git {args:?} failed");
        String::from_utf8_lossy(&output.stdout).trim().to_string()
    }

    fn commit_all(dir: &Path, message: &str) -> String {
        git(dir, &["add", "-A"]);
        git(dir, &["commit", "-q", "--allow-empty", "-m", message]);
        git(dir, &["rev-parse", "HEAD"])
    }

    #[test]
    fn counts_roots_edits_and_merges_against_their_first_parent() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path();
        git(dir, &["init", "-q", "-b", "main"]);
        git(dir, &["config", "commit.gpgsign", "false"]);
        std::fs::write(dir.join("a.txt"), "1\n2\n3\n").unwrap();
        let root = commit_all(dir, "root");
        std::fs::write(dir.join("a.txt"), "1\nTWO\n3\n4\n").unwrap();
        let edit = commit_all(dir, "edit");
        git(dir, &["switch", "-q", "-c", "topic", &root]);
        std::fs::write(dir.join("b.txt"), "x\ny\n").unwrap();
        let topic = commit_all(dir, "topic");
        git(dir, &["switch", "-q", "main"]);
        git(dir, &["merge", "-q", "--no-ff", "-m", "merge", &topic]);
        let merge = git(dir, &["rev-parse", "HEAD"]);
        let empty = commit_all(dir, "empty");

        let counts = count_lines(
            dir,
            &[
                (empty.clone(), Some(merge.clone())),
                (merge.clone(), Some(edit.clone())),
                (edit.clone(), Some(root.clone())),
                (root.clone(), None),
            ],
        )
        .unwrap();
        assert_eq!(counts.get(&root), Some(&(3, 0)));
        assert_eq!(counts.get(&edit), Some(&(2, 1)));
        assert_eq!(
            counts.get(&merge),
            Some(&(2, 0)),
            "what the merge brought in"
        );
        assert_eq!(counts.get(&empty), Some(&(0, 0)));
    }
}
