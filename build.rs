//! Ensure `frontend/dist` exists so `rust-embed` can compile even before the SPA
//! has been built (a real `make build` overwrites this placeholder), and bake
//! the commit hash into the binary for the info dialog.

use std::fs;
use std::path::Path;
use std::process::Command;

fn main() {
    let dist = Path::new("frontend/dist");
    let index = dist.join("index.html");
    if !index.exists() {
        let _ = fs::create_dir_all(dist);
        let _ = fs::write(
            &index,
            "<!doctype html><html lang=\"ja\"><head><meta charset=\"utf-8\">\
             <title>gitreant</title></head><body>\
             <p>Frontend not built. Run <code>make frontend</code>.</p>\
             </body></html>",
        );
    }
    println!("cargo:rerun-if-changed=frontend/dist");

    // The commit this binary was built from, surfaced by GET /api/about.
    // Best effort: a source tarball without git still builds.
    let commit = Command::new("git")
        .args(["rev-parse", "--short=12", "HEAD"])
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_else(|| "unknown".to_string());
    println!("cargo:rustc-env=GITREANT_COMMIT={commit}");
    println!("cargo:rerun-if-changed=.git/HEAD");
}
