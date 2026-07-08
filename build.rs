//! Ensure `frontend/dist` exists so `rust-embed` can compile even before the SPA
//! has been built. A real `make build` overwrites this placeholder.

use std::fs;
use std::path::Path;

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
}
