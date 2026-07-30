//! gitreant CLI: display the commit graphs of local repositories in a browser.
//!
//! Running `gitreant [PATH...]` spawns a detached server and opens a browser,
//! returning control to the shell. If a gitreant server is already running on
//! the port, the given repositories are handed to it instead (mirroring `mo`'s
//! single-instance behaviour). `--app` opens a chromeless window instead of a
//! tab; `--foreground` keeps the server in the current
//! terminal; `--shutdown` stops the running server. `restart` brings the same
//! repositories back up in a fresh process; `refresh` re-verifies signatures
//! in place.

use std::path::PathBuf;
use std::process::ExitCode;

use clap::{Parser, Subcommand};

use gitreant::app::{canonical, Session};
use gitreant::doctor;
#[cfg(not(target_os = "android"))]
use gitreant::launch;
use gitreant::server::{
    bind, get_repo_paths, ping, post_refresh, post_repo, post_shutdown, serve, AppState,
};

#[derive(Parser)]
#[command(
    name = "gitreant",
    version,
    about = "Serve git commit graphs as a web app"
)]
struct Cli {
    #[command(subcommand)]
    command: Option<Command>,

    /// Repository paths to display (defaults to the current directory).
    paths: Vec<PathBuf>,

    /// Port to serve on / connect to.
    #[arg(short, long, default_value_t = 4000, global = true)]
    port: u16,

    /// Do not open a browser window.
    #[arg(long)]
    no_open: bool,

    /// Open in a chromeless app window instead of a browser tab.
    #[arg(long)]
    app: bool,

    /// Run the server in the current terminal instead of detaching.
    #[arg(long)]
    foreground: bool,

    /// Stop the running gitreant server and exit.
    #[arg(long)]
    shutdown: bool,
}

#[derive(Subcommand)]
enum Command {
    /// Check the external tools gitreant relies on (git, gh, gpg).
    Doctor,
    /// Restart the running server, keeping the repositories it shows.
    Restart,
    /// Re-verify commit signatures in place, without restarting.
    Refresh,
}

fn main() -> ExitCode {
    let cli = Cli::parse();
    match cli.command {
        Some(Command::Doctor) => return run_doctor(&cli),
        Some(Command::Restart) => return restart(&cli),
        Some(Command::Refresh) => return refresh(&cli),
        None => {}
    }
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
        start_background(&cli, &paths, true)
    }
}

/// Report whether git, gh and gpg answer on this machine; fail when a
/// required tool is missing so scripts can gate on the exit code.
fn run_doctor(cli: &Cli) -> ExitCode {
    let reports = doctor::run_checks();
    println!("{}", doctor::render(&reports, ping(cli.port), cli.port));
    if doctor::all_required_present(&reports) {
        ExitCode::SUCCESS
    } else {
        ExitCode::FAILURE
    }
}

/// Stop the running server and start a fresh one with the same repositories
/// (plus any given on the command line). A new process starts with an empty
/// signature cache, so restarting re-verifies every commit; it also picks up
/// a rebuilt binary. The browser tab reconnects on the same port, so none is
/// opened.
fn restart(cli: &Cli) -> ExitCode {
    let mut paths: Vec<PathBuf> = cli.paths.clone();
    if ping(cli.port) {
        match get_repo_paths(cli.port) {
            Ok(existing) => paths.extend(existing.into_iter().map(PathBuf::from)),
            Err(e) => {
                eprintln!("could not read the running server's repositories: {e}");
                return ExitCode::FAILURE;
            }
        }
        if let Err(e) = post_shutdown(cli.port) {
            eprintln!("failed to stop the running server: {e}");
            return ExitCode::FAILURE;
        }
        // Wait for the old server to release the port before rebinding it.
        let mut stopped = false;
        for _ in 0..100 {
            if !ping(cli.port) {
                stopped = true;
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(100));
        }
        if !stopped {
            eprintln!("the running server did not stop in time");
            return ExitCode::FAILURE;
        }
        // A moment for the socket to settle before the new server binds it.
        std::thread::sleep(std::time::Duration::from_millis(200));
    }

    // Dedupe (canonicalized) while preserving order.
    let mut seen = std::collections::HashSet::new();
    let mut unique = Vec::new();
    for path in paths {
        if seen.insert(canonical(&path)) {
            unique.push(path);
        }
    }
    if unique.is_empty() {
        unique.push(PathBuf::from("."));
    }
    start_background(cli, &unique, false)
}

/// Ask the running server to re-verify signatures in place (drop the cached
/// verdicts). Cheaper than a restart when only the verification is stale.
fn refresh(cli: &Cli) -> ExitCode {
    if !ping(cli.port) {
        eprintln!("no gitreant running on port {}", cli.port);
        return ExitCode::FAILURE;
    }
    match post_refresh(cli.port) {
        Ok(()) => {
            println!("re-verifying signatures on port {}", cli.port);
            ExitCode::SUCCESS
        }
        Err(e) => {
            eprintln!("refresh failed: {e}");
            ExitCode::FAILURE
        }
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
/// then (when `open`) open the browser and return control to the shell
/// (mirroring `mo`).
fn start_background(cli: &Cli, paths: &[PathBuf], open: bool) -> ExitCode {
    let exe = match std::env::current_exe() {
        Ok(exe) => exe,
        Err(e) => {
            eprintln!("cannot locate own executable: {e}");
            return ExitCode::FAILURE;
        }
    };
    let mut command = std::process::Command::new(exe);
    for path in paths {
        command.arg(canonical(path));
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
            if open {
                open_browser(cli);
            }
            return ExitCode::SUCCESS;
        }
        if let Ok(Some(status)) = child.try_wait() {
            eprintln!(
                "server exited during startup ({status}); run with --foreground to see its output"
            );
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

/// Hand the repositories to an already-running gitreant and exit. The running
/// instance already has a browser tab, so none is opened here.
fn forward_to_running(cli: &Cli, paths: &[PathBuf]) -> ExitCode {
    for path in paths {
        let absolute = canonical(path);
        match post_repo(cli.port, &absolute.to_string_lossy()) {
            Ok(()) => println!("added {} to running gitreant", absolute.display()),
            Err(e) => eprintln!("failed to add {}: {e}", absolute.display()),
        }
    }
    println!("already serving on http://127.0.0.1:{}", cli.port);
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

#[cfg(not(target_os = "android"))]
fn open_browser(cli: &Cli) {
    if cli.no_open {
        return;
    }
    let url = format!("http://127.0.0.1:{}", cli.port);
    if cli.app && open_app_window(&url) {
        return;
    }
    let _ = open::that(&url);
}

/// Try to open `url` as a chromeless window, reporting whether it worked so
/// the caller can fall back to the ordinary browser. The window is detached:
/// it must outlive the launcher process, which exits immediately.
#[cfg(not(target_os = "android"))]
fn open_app_window(url: &str) -> bool {
    let Some((browser, args)) = launch::app_window_command(url) else {
        return false;
    };
    let mut command = std::process::Command::new(browser);
    command
        .args(args)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());
    detach(&mut command);
    command.spawn().is_ok()
}

/// Termux has no desktop opener; try its own URL handler and always print
/// the address so the user can tap or paste it.
#[cfg(target_os = "android")]
fn open_browser(cli: &Cli) {
    let url = format!("http://127.0.0.1:{}", cli.port);
    if !cli.no_open {
        let _ = std::process::Command::new("termux-open-url")
            .arg(&url)
            .spawn();
    }
    println!("gitreant is serving on {url}");
}
