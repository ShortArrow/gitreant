//! `gitreant editor` keeps the editors a page opens files with, in the
//! configuration file only the CLI writes (ADR 0062).

use std::path::Path;
use std::process::{Command, Output};

fn gitreant(config: &Path, args: &[&str]) -> Output {
    Command::new(env!("CARGO_BIN_EXE_gitreant"))
        .env("GITREANT_CONFIG_DIR", config)
        .args(args)
        .output()
        .expect("run gitreant")
}

fn stdout(output: &Output) -> String {
    String::from_utf8_lossy(&output.stdout).into_owned()
}

#[test]
fn the_cli_adds_lists_and_removes_editors() {
    let tmp = tempfile::tempdir().unwrap();
    let config = tmp.path();

    let empty = gitreant(config, &["editor", "list"]);
    assert!(empty.status.success());
    assert!(stdout(&empty).contains("no editors"), "{}", stdout(&empty));

    let added = gitreant(
        config,
        &[
            "editor",
            "add",
            "Code",
            "code.cmd",
            "--goto",
            "{path}:{line}",
        ],
    );
    assert!(added.status.success(), "{added:?}");
    let listed = stdout(&gitreant(config, &["editor", "list"]));
    assert!(listed.contains("Code"), "{listed}");
    assert!(listed.contains("code.cmd --goto {path}:{line}"), "{listed}");
    let file = std::fs::read_to_string(config.join("config.toml")).unwrap();
    assert!(file.contains("[[editors]]"), "{file}");

    // Adding a name again replaces that editor.
    gitreant(config, &["editor", "add", "Code", "code"]);
    let listed = stdout(&gitreant(config, &["editor", "list"]));
    assert_eq!(listed.matches("Code").count(), 1, "{listed}");

    let removed = gitreant(config, &["editor", "remove", "Code"]);
    assert!(removed.status.success());
    assert!(stdout(&gitreant(config, &["editor", "list"])).contains("no editors"));
    assert!(!gitreant(config, &["editor", "remove", "Code"])
        .status
        .success());
}
