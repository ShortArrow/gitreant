//! gitreant CLI: display the commit graphs of local repositories in a browser.
//!
//! Running `gitreant [PATH...]` spawns a detached server and opens a browser,
//! returning control to the shell. If a gitreant server is already running on
//! the port, the given repositories are handed to it instead (mirroring `mo`'s
//! single-instance behaviour). `--foreground` keeps the server in the current
//! terminal; `--shutdown` stops the running server.

use std::path::PathBuf;
use std::process::ExitCode;

use clap::Parser;

use gitreant::app::Session;
use gitreant::server::{bind, ping, post_repo, post_shutdown, serve, AppState};

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

    /// Run the server in the current terminal instead of detaching.
    #[arg(long)]
    foreground: bool,

    /// Stop the running gitreant server and exit.
    #[arg(long)]
    shutdown: bool,
}

fn main() -> ExitCode {
    let cli = Cli::parse();
    if cli.shutdown {
        return shutdown_running(&cli);
    }
    let paths = if cli.paths.is_empty() {
        vec![PathBuf::from(".")]
    } else {
        cli.paths.clone()
    };

    if ping(cli.port) {
        forward_to_running(&cli, &paths)
    } else if cli.foreground {
        run_server(&cli, &paths)
    } else {
        start_background(&cli, &paths)
    }
}

/// Ask the running server to stop, mirroring `mo --shutdown`.
fn shutdown_running(cli: &Cli) -> ExitCode {
    match post_shutdown(cli.port) {
        Ok(()) => {
            println!("gitreant on port {} shut down", cli.port);
            ExitCode::SUCCESS
        }
        Err(e) => {
            eprintln!("no gitreant to shut down on port {}: {e}", cli.port);
            ExitCode::FAILURE
        }
    }
}

/// Spawn a detached copy of ourselves as the server, wait until it answers,
/// then open the browser and return control to the shell (mirroring `mo`).
fn start_background(cli: &Cli, paths: &[PathBuf]) -> ExitCode {
    let exe = match std::env::current_exe() {
        Ok(exe) => exe,
        Err(e) => {
            eprintln!("cannot locate own executable: {e}");
            return ExitCode::FAILURE;
        }
    };
    let mut command = std::process::Command::new(exe);
    for path in paths {
        command.arg(std::fs::canonicalize(path).unwrap_or_else(|_| path.clone()));
    }
    command
        .arg("--foreground")
        .arg("--no-open")
        .args(["--port", &cli.port.to_string()])
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());
    detach(&mut command);

    let mut child = match command.spawn() {
        Ok(child) => child,
        Err(e) => {
            eprintln!("failed to start server process: {e}");
            return ExitCode::FAILURE;
        }
    };
    for _ in 0..100 {
        if ping(cli.port) {
            println!(
                "gitreant serving on http://127.0.0.1:{} (pid {}, stop with `gitreant --shutdown`)",
                cli.port,
                child.id()
            );
            open_browser(cli);
            return ExitCode::SUCCESS;
        }
        if let Ok(Some(status)) = child.try_wait() {
            eprintln!("server exited during startup ({status}); run with --foreground to see its output");
            return ExitCode::FAILURE;
        }
        std::thread::sleep(std::time::Duration::from_millis(150));
    }
    eprintln!("server did not come up on port {} in time", cli.port);
    ExitCode::FAILURE
}

#[cfg(windows)]
fn detach(command: &mut std::process::Command) {
    use std::os::windows::process::CommandExt;
    const DETACHED_PROCESS: u32 = 0x0000_0008;
    const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
    command.creation_flags(DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP);
}

#[cfg(unix)]
fn detach(command: &mut std::process::Command) {
    use std::os::unix::process::CommandExt;
    command.process_group(0);
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
