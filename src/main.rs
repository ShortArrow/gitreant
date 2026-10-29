//! gitreant CLI: display the commit graphs of local repositories in a browser.
//!
//! Running `gitreant [PATH...]` spawns a detached server and opens a browser,
//! returning control to the shell. If a gitreant server is already running on
//! the port, the given repositories are handed to it instead (mirroring `mo`'s
//! single-instance behaviour). `--app` opens a chromeless window instead of a
//! tab; `--foreground` keeps the server in the current
//! terminal; `--shutdown` stops the running server. `restart` brings the same
//! repositories back up in a fresh process; `refresh` re-verifies signatures
//! in place. A bare `gitreant` outside any repository prints the usage and
//! succeeds, while a named path that is not a repository is an error.

use std::path::{Path, PathBuf};
use std::process::ExitCode;

use clap::{CommandFactory, Parser, Subcommand};
use gitreant::launch::detach;

use gitreant::app::{canonical, Session};
use gitreant::doctor;
use gitreant::git::discover_repo;
#[cfg(not(target_os = "android"))]
use gitreant::launch;
use gitreant::records::{self, Record, Target};
use gitreant::server::{
    bind, get_repo_list, get_repo_paths, ping, post_refresh, post_repo, post_shutdown, serve,
    AppState,
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

    /// Port to serve on / connect to (default 4000). Commands that talk to
    /// a running server find it when this is left out.
    #[arg(short, long, global = true)]
    port: Option<u16>,

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

    /// With --shutdown, stop every running gitreant server.
    #[arg(long, requires = "shutdown")]
    all: bool,
}

/// The port a server starts on when none is given.
const DEFAULT_PORT: u16 = 4000;

impl Cli {
    /// The port to start a server on or hand repositories to.
    fn port(&self) -> u16 {
        self.port.unwrap_or(DEFAULT_PORT)
    }

    /// The port of the running server a command acts on: the one given,
    /// else the only one running (ADR 0039). Several running and none
    /// given is an error that lists them.
    fn running_port(&self) -> Result<u16, String> {
        let running = running_servers();
        match records::target(self.port, &running, DEFAULT_PORT) {
            Target::Port(port) => Ok(port),
            Target::Many(many) => Err(format!(
                "several gitreant servers are running; pick one with --port:\n{}",
                describe(&many)
            )),
        }
    }
}

#[derive(Subcommand)]
enum Command {
    /// Check the external tools gitreant relies on (git, gh, gpg).
    Doctor,
    /// Restart the running server, keeping the repositories it shows.
    Restart,
    /// Re-verify commit signatures in place, without restarting.
    Refresh,
    /// List the running gitreant servers, one line each.
    List {
        /// Also list each server's repositories, with how and when each came.
        #[arg(long)]
        verbose: bool,
        /// Print everything as JSON, for programs.
        #[arg(long, conflicts_with = "verbose")]
        json: bool,
    },
    /// Keep the editors the page opens files with, in config.toml.
    Editor {
        #[command(subcommand)]
        action: EditorAction,
    },
}

#[derive(Subcommand)]
enum EditorAction {
    /// List the editors and where their file is.
    List,
    /// Add an editor, or replace the one of the same name. `{path}` and
    /// `{line}` in its arguments are filled in; without `{path}`, the file
    /// goes last.
    Add {
        name: String,
        /// The program to run, as found on the PATH or by its path (on
        /// Windows, name a `.cmd` or `.bat` with its extension).
        program: String,
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<String>,
    },
    /// Remove the editor of this name.
    Remove { name: String },
}

fn main() -> ExitCode {
    let cli = Cli::parse();
    match cli.command {
        Some(Command::Doctor) => return run_doctor(&cli),
        Some(Command::Restart) => return restart(&cli),
        Some(Command::Refresh) => return refresh(&cli),
        Some(Command::List { verbose, json }) => return list(verbose, json),
        Some(Command::Editor { ref action }) => return editor(action),
        None => {}
    }
    if cli.shutdown {
        return if cli.all {
            shutdown_all()
        } else {
            shutdown_running(&cli)
        };
    }
    if cli.paths.is_empty() && discover_repo(Path::new(".")).is_err() {
        return print_usage();
    }
    let paths = if cli.paths.is_empty() {
        vec![PathBuf::from(".")]
    } else {
        cli.paths.clone()
    };

    if ping(cli.port()) {
        forward_to_running(&cli, &paths)
    } else if cli.foreground {
        run_server(&cli, &paths)
    } else {
        start_background(&cli, cli.port(), &paths, true)
    }
}

/// Print the same usage as `--help` and succeed: a bare `gitreant` outside
/// any repository has nothing to show, which is not an error.
fn print_usage() -> ExitCode {
    match Cli::command().print_help() {
        Ok(()) => ExitCode::SUCCESS,
        Err(_) => ExitCode::FAILURE,
    }
}

/// Report whether git, gh and gpg answer on this machine; fail when a
/// required tool is missing so scripts can gate on the exit code.
fn run_doctor(cli: &Cli) -> ExitCode {
    let reports = doctor::run_checks();
    println!("{}", doctor::render(&reports, ping(cli.port()), cli.port()));
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
    let port = match cli.running_port() {
        Ok(port) => port,
        Err(e) => {
            eprintln!("{e}");
            return ExitCode::FAILURE;
        }
    };
    let mut paths: Vec<PathBuf> = cli.paths.clone();
    if ping(port) {
        match get_repo_paths(port, token_of(port).as_deref()) {
            Ok(existing) => paths.extend(existing.into_iter().map(PathBuf::from)),
            Err(e) => {
                eprintln!("could not read the running server's repositories: {e}");
                return ExitCode::FAILURE;
            }
        }
        if let Err(e) = post_shutdown(port, token_of(port).as_deref()) {
            eprintln!("failed to stop the running server: {e}");
            return ExitCode::FAILURE;
        }
        // Wait for the old server to release the port before rebinding it.
        let mut stopped = false;
        for _ in 0..100 {
            if !ping(port) {
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
    start_background(cli, port, &unique, false)
}

/// Ask the running server to re-verify signatures in place (drop the cached
/// verdicts). Cheaper than a restart when only the verification is stale.
fn refresh(cli: &Cli) -> ExitCode {
    let port = match cli.running_port() {
        Ok(port) => port,
        Err(e) => {
            eprintln!("{e}");
            return ExitCode::FAILURE;
        }
    };
    if !ping(port) {
        eprintln!("no gitreant running on port {port}");
        return ExitCode::FAILURE;
    }
    match post_refresh(port, token_of(port).as_deref()) {
        Ok(()) => {
            println!("re-verifying signatures on port {port}");
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
    match cli.running_port() {
        Ok(port) => shutdown_port(port),
        Err(e) => {
            eprintln!("{e}");
            ExitCode::FAILURE
        }
    }
}

fn shutdown_port(port: u16) -> ExitCode {
    match post_shutdown(port, token_of(port).as_deref()) {
        Ok(()) => {
            println!("gitreant on port {port} shut down");
            ExitCode::SUCCESS
        }
        Err(e) => {
            eprintln!("no gitreant to shut down on port {port}: {e}");
            ExitCode::FAILURE
        }
    }
}

/// Stop every running server that left a record (ADR 0039).
fn shutdown_all() -> ExitCode {
    let running = running_servers();
    if running.is_empty() {
        println!("no gitreant server is running");
    }
    let mut code = ExitCode::SUCCESS;
    for record in running {
        if shutdown_port(record.port) == ExitCode::FAILURE {
            code = ExitCode::FAILURE;
        }
    }
    code
}

/// `gitreant editor`: the only writer of the editors list, so the page that
/// runs them can never choose what runs (ADR 0062).
fn editor(action: &EditorAction) -> ExitCode {
    let Some(dir) = gitreant::config::dir() else {
        eprintln!("no configuration directory: set XDG_CONFIG_HOME or HOME");
        return ExitCode::FAILURE;
    };
    let mut list = gitreant::config::editors(&dir);
    match action {
        EditorAction::List => {
            println!("{}", dir.join("config.toml").display());
            if list.is_empty() {
                println!("no editors");
            }
            for editor in &list {
                let command = std::iter::once(editor.program.as_str())
                    .chain(editor.args.iter().map(String::as_str))
                    .collect::<Vec<_>>()
                    .join(" ");
                println!("{}: {command}", editor.name);
            }
            return ExitCode::SUCCESS;
        }
        EditorAction::Add {
            name,
            program,
            args,
        } => {
            let added = gitreant::config::Editor {
                name: name.clone(),
                program: program.clone(),
                args: args.clone(),
            };
            match list.iter_mut().find(|editor| editor.name == *name) {
                Some(existing) => *existing = added,
                None => list.push(added),
            }
        }
        EditorAction::Remove { name } => {
            let before = list.len();
            list.retain(|editor| editor.name != *name);
            if list.len() == before {
                eprintln!("no editor named {name}");
                return ExitCode::FAILURE;
            }
        }
    }
    match gitreant::config::save_editors(&dir, &list) {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("write {}: {e}", dir.join("config.toml").display());
            ExitCode::FAILURE
        }
    }
}

/// Print the running servers, or that none runs (ADR 0039): a line each,
/// with their repositories when `verbose`, or everything as JSON.
fn list(verbose: bool, json: bool) -> ExitCode {
    let running = running_servers();
    if json {
        let servers: Vec<serde_json::Value> = running.iter().map(server_json).collect();
        println!("{}", serde_json::Value::Array(servers));
    } else if running.is_empty() {
        println!("no gitreant server is running");
    } else if verbose {
        let blocks: Vec<String> = running.iter().map(describe_verbose).collect();
        println!("{}", blocks.join("\n"));
    } else {
        println!("{}", describe(&running));
    }
    ExitCode::SUCCESS
}

fn server_json(record: &Record) -> serde_json::Value {
    let repos: Vec<serde_json::Value> = get_repo_list(record.port, Some(&record.token))
        .unwrap_or_default()
        .into_iter()
        .map(|entry| serde_json::json!({ "path": entry["path"], "added": entry["added"] }))
        .collect();
    serde_json::json!({
        "url": launch::page_url(record.port, Some(&record.token)),
        "port": record.port,
        "pid": record.pid,
        "started": record.started,
        "version": record.version,
        "repos": repos,
    })
}

/// A server's line, then each repository with how and when it came.
fn describe_verbose(record: &Record) -> String {
    let mut block = server_line(record, None);
    for entry in get_repo_list(record.port, Some(&record.token)).unwrap_or_default() {
        let path = entry["path"].as_str().unwrap_or_default();
        block.push_str(&format!("\n  {path}  ({})", how_added(&entry["added"])));
    }
    block
}

/// How a repository came, as `GET /api/list` records it.
fn how_added(added: &serde_json::Value) -> String {
    let at = added["at"].as_i64().map(started_at).unwrap_or_default();
    let how = match (added["via"].as_str(), added["reason"].as_str()) {
        (Some("startup"), _) => "given at startup".to_string(),
        (Some("cli"), _) => "added by the CLI".to_string(),
        (Some("browser"), Some(reason)) => format!("added from the browser: {reason}"),
        (Some("browser"), None) => "added from the browser".to_string(),
        _ => return "how it came is unknown".to_string(),
    };
    format!("{how}, {at}")
}

/// The servers whose records still answer as a gitreant.
fn running_servers() -> Vec<Record> {
    records::dir().map_or_else(Vec::new, |dir| records::running(&dir, ping))
}

/// One line per server: its URL, pid, start time, version and how many
/// repositories it shows, asked of it.
fn describe(servers: &[Record]) -> String {
    servers
        .iter()
        .map(|record| {
            let count =
                get_repo_paths(record.port, Some(&record.token)).map_or(0, |repos| repos.len());
            server_line(record, Some(count))
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn server_line(record: &Record, repos: Option<usize>) -> String {
    let mut line = format!(
        "{}  pid {}  started {}  v{}",
        launch::page_url(record.port, Some(&record.token)),
        record.pid,
        started_at(record.started),
        record.version
    );
    match repos {
        Some(1) => line.push_str("  1 repository"),
        Some(n) => line.push_str(&format!("  {n} repositories")),
        None => {}
    }
    line
}

/// Spawn a detached copy of ourselves as the server, wait until it answers,
/// then (when `open`) open the browser and return control to the shell
/// (mirroring `mo`).
fn start_background(cli: &Cli, port: u16, paths: &[PathBuf], open: bool) -> ExitCode {
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
        .args(["--port", &port.to_string()])
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
        if ping(port) {
            let url = launch::page_url(port, token_of(port).as_deref());
            println!(
                "gitreant serving on {url} (pid {}, stop with `gitreant --shutdown`)",
                child.id()
            );
            if open {
                open_browser(cli, &url);
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
    eprintln!("server did not come up on port {port} in time");
    ExitCode::FAILURE
}

/// Hand the repositories to an already-running gitreant and exit. The running
/// instance already has a browser tab, so none is opened here.
fn forward_to_running(cli: &Cli, paths: &[PathBuf]) -> ExitCode {
    for path in paths {
        let absolute = canonical(path);
        match post_repo(
            cli.port(),
            token_of(cli.port()).as_deref(),
            &absolute.to_string_lossy(),
        ) {
            Ok(()) => println!("added {} to running gitreant", absolute.display()),
            Err(e) => eprintln!("failed to add {}: {e}", absolute.display()),
        }
    }
    println!(
        "already serving on {}",
        launch::page_url(cli.port(), token_of(cli.port()).as_deref())
    );
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
        let (listener, addr) = match bind(cli.port()).await {
            Ok(v) => v,
            Err(e) => {
                eprintln!("{e}");
                return ExitCode::FAILURE;
            }
        };
        let state = AppState::new(session);
        let url = launch::page_url(addr.port(), Some(state.secret().as_str()));
        println!("gitreant serving on {url}");
        let record_dir = records::dir();
        if let Some(dir) = &record_dir {
            let record = Record {
                port: addr.port(),
                pid: std::process::id(),
                started: unix_now(),
                version: env!("CARGO_PKG_VERSION").to_string(),
                token: state.secret().as_str().to_string(),
            };
            if let Err(e) = records::write(dir, &record) {
                eprintln!("could not record this server in {}: {e}", dir.display());
            }
        }
        open_browser(cli, &url);
        let served = serve(listener, state).await;
        if let Some(dir) = &record_dir {
            records::remove(dir, addr.port());
        }
        if let Err(e) = served {
            eprintln!("server error: {e}");
            return ExitCode::FAILURE;
        }
        ExitCode::SUCCESS
    })
}

/// The secret the server on `port` keeps in its record (ADR 0063).
fn token_of(port: u16) -> Option<String> {
    records::dir().and_then(|dir| records::token(&dir, port))
}

#[cfg(not(target_os = "android"))]
fn open_browser(cli: &Cli, url: &str) {
    if cli.no_open {
        return;
    }
    if cli.app && open_app_window(url) {
        return;
    }
    let _ = open::that(url);
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
fn open_browser(cli: &Cli, url: &str) {
    if !cli.no_open {
        let _ = std::process::Command::new("termux-open-url")
            .arg(url)
            .spawn();
    }
    println!("gitreant is serving on {url}");
}

fn unix_now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |elapsed| elapsed.as_secs() as i64)
}

/// A record's start time in UTC, `YYYY-MM-DD HH:MM UTC`.
fn started_at(unix: i64) -> String {
    let days = unix.div_euclid(86_400);
    let seconds = unix.rem_euclid(86_400);
    // The civil date of a day count since 1970-01-01, after Howard Hinnant.
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    format!(
        "{year:04}-{month:02}-{day:02} {:02}:{:02} UTC",
        seconds / 3_600,
        seconds % 3_600 / 60
    )
}
