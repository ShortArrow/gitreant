//! gitreant CLI: display the commit graphs of local repositories in a browser.
//!
//! Running `gitreant [PATH...]` starts a local server and opens a browser. If a
//! gitreant server is already running on the port, the given repositories are
//! handed to it instead (mirroring `mo`'s single-instance behaviour).

use std::path::PathBuf;
use std::process::ExitCode;

use clap::Parser;

use gitreant::app::Session;
use gitreant::server::{bind, ping, post_repo, serve, AppState};

#[derive(Parser)]
#[command(name = "gitreant", version, about = "Serve git commit graphs as a web app")]
struct Cli {
    /// Repository paths to display (defaults to the current directory).
    paths: Vec<PathBuf>,

    /// Port to serve on / connect to.
    #[arg(short, long, default_value_t = 4000)]
    port: u16,

    /// Do not open a browser window.
    #[arg(long)]
    no_open: bool,
}

fn main() -> ExitCode {
    let cli = Cli::parse();
    let paths = if cli.paths.is_empty() {
        vec![PathBuf::from(".")]
    } else {
        cli.paths.clone()
    };

    if ping(cli.port) {
        forward_to_running(&cli, &paths)
    } else {
        run_server(&cli, &paths)
    }
}

/// Hand the repositories to an already-running gitreant and exit.
fn forward_to_running(cli: &Cli, paths: &[PathBuf]) -> ExitCode {
    for path in paths {
        let absolute = std::fs::canonicalize(path).unwrap_or_else(|_| path.clone());
        match post_repo(cli.port, &absolute.to_string_lossy()) {
            Ok(()) => println!("added {} to running gitreant", absolute.display()),
            Err(e) => eprintln!("failed to add {}: {e}", absolute.display()),
        }
    }
    open_browser(cli);
    ExitCode::SUCCESS
}

/// Become the server: load the repositories and serve until stopped.
fn run_server(cli: &Cli, paths: &[PathBuf]) -> ExitCode {
    let mut session = Session::new();
    for path in paths {
        if let Err(e) = session.add(path) {
            eprintln!("skip {}: {e}", path.display());
        }
    }
    if session.is_empty() {
        eprintln!("no git repositories to display");
        return ExitCode::FAILURE;
    }

    let runtime = match tokio::runtime::Runtime::new() {
        Ok(rt) => rt,
        Err(e) => {
            eprintln!("failed to start runtime: {e}");
            return ExitCode::FAILURE;
        }
    };

    runtime.block_on(async move {
        let (listener, addr) = match bind(cli.port).await {
            Ok(v) => v,
            Err(e) => {
                eprintln!("{e}");
                return ExitCode::FAILURE;
            }
        };
        let url = format!("http://127.0.0.1:{}", addr.port());
        println!("gitreant serving on {url}");
        open_browser(cli);
        if let Err(e) = serve(listener, AppState::new(session)).await {
            eprintln!("server error: {e}");
            return ExitCode::FAILURE;
        }
        ExitCode::SUCCESS
    })
}

fn open_browser(cli: &Cli) {
    if !cli.no_open {
        let _ = open::that(format!("http://127.0.0.1:{}", cli.port));
    }
}
