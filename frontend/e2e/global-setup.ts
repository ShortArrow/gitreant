import { execFileSync, type ChildProcess } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { FullConfig } from "@playwright/test";
import { atTime, commit, git, initRepo as initRepoAt } from "./git";
import { buildAndServe } from "./server";

const PORT = 4599;

const frontendDir = process.cwd();
const tmpDir = path.join(frontendDir, "e2e", ".tmp");

function initRepo(name: string): string {
  return initRepoAt(path.join(tmpDir, name));
}

/** repoA: a branch that is merged back -> two lanes and a merge node.
 * Carries real file changes and a message body for the detail-pane test.
 * Commit times are pinned: on fast machines several commits land in the same
 * second otherwise, and timestamp ties reorder the walk (and thus lanes and
 * colors) differently per platform. */
function makeRepoA(): string {
  const dir = initRepo("repoA");
  const t = 1_700_000_000;
  writeFileSync(path.join(dir, "README.md"), "one\n");
  git(dir, ["add", "."]);
  commit(dir, "root", t);
  writeFileSync(path.join(dir, "README.md"), "one\ntwo\n");
  git(dir, ["add", "."]);
  commit(
    dir,
    "main-1\n\nSecond line of the description\nwraps in the source.\n- first item\n- second item that wraps\n  onto a continuation line\n\n    make loady\n```\ncargo test\n```",
    t + 10,
  );
  git(dir, ["switch", "-c", "feature", "-q"]);
  commit(dir, "feature-1", t + 20);
  git(dir, ["switch", "main", "-q"]);
  mkdirSync(path.join(dir, "src", "lib"), { recursive: true });
  writeFileSync(path.join(dir, "src", "lib", "one.ts"), "1\n");
  writeFileSync(path.join(dir, "src", "lib", "two.ts"), "2\n");
  git(dir, ["add", "."]);
  commit(dir, "main-2", t + 30);
  git(
    dir,
    ["merge", "--no-ff", "feature", "-q", "-m", "merge feature"],
    atTime(t + 40),
  );
  git(dir, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
  return dir; // 5 commits
}

/** repoB: a branch that never merges -> two lanes, no merge node.
 * Times pinned for the same determinism reason as repoA. */
function makeRepoB(): string {
  const dir = initRepo("repoB");
  const t = 1_700_000_000;
  commit(dir, "init", t);
  git(dir, ["switch", "-c", "topic", "-q"]);
  commit(dir, "topic-1", t + 10);
  git(dir, ["switch", "main", "-q"]);
  commit(dir, "main-1", t + 20);
  return dir; // 3 commits
}

/** repoC: linear, used by the add/remove test (not served initially). */
function makeRepoC(): string {
  const dir = initRepo("repoC");
  commit(dir, "one");
  commit(dir, "two");
  return dir; // 2 commits
}

/**
 * repoD: a feature merged back only after many commits on main, so the
 * merge-to-parent edge spans many rows (not served initially).
 */
function makeRepoD(): string {
  const dir = initRepo("repoD");
  const t = 1_700_000_000;
  commit(dir, "root", t);
  git(dir, ["switch", "-c", "feature", "-q"]);
  commit(dir, "feature-1", t + 10);
  git(dir, ["switch", "main", "-q"]);
  for (let i = 1; i <= 10; i++) {
    commit(dir, `main-${i}`, t + 10 + i * 10);
  }
  git(
    dir,
    ["merge", "--no-ff", "feature", "-q", "-m", "merge feature"],
    atTime(t + 200),
  );
  return dir; // 13 commits
}

/** repoE: linear with one commit; the reload test commits into it live. */
function makeRepoE(): string {
  const dir = initRepo("repoE");
  commit(dir, "e-1");
  return dir; // 1 commit
}

/** repoF: a clone with a file-transport origin; the fetch test commits into
 * the origin live. Returns both paths. */
function makeRepoF(): { origin: string; clone: string } {
  const origin = initRepo("repoF-origin");
  commit(origin, "f-1");
  // One tag on the origin, one only in the clone: after a fetch the badges
  // must tell them apart.
  git(origin, ["tag", "vremote"]);
  git(tmpDir, ["clone", "-q", "repoF-origin", "repoF"]);
  const clone = path.join(tmpDir, "repoF");
  git(clone, ["config", "commit.gpgsign", "false"]);
  git(clone, ["tag", "vlocal"]);
  return { origin, clone }; // 1 commit
}

/** repoG: its only remote is unreachable, so fetching it always fails. */
function makeRepoG(): string {
  const dir = initRepo("repoG");
  commit(dir, "g-1");
  git(dir, ["remote", "add", "origin", "gitreant-missing/remote"]);
  return dir; // 1 commit
}

/** repoH: an unsigned root with a (fake-)signed tip commit. Only the gpgsig
 * header's presence matters — nothing verifies it. */
function makeRepoH(): string {
  const dir = initRepo("repoH");
  commit(dir, "unsigned base");
  const out = (args: string[], input?: string) =>
    execFileSync("git", args, { cwd: dir, input, encoding: "utf8" }).trim();
  const tree = out(["rev-parse", "HEAD^{tree}"]);
  const parent = out(["rev-parse", "HEAD"]);
  const raw =
    `tree ${tree}\nparent ${parent}\n` +
    "author Tester <tester@example.com> 1700000100 +0000\n" +
    "committer Tester <tester@example.com> 1700000100 +0000\n" +
    "gpgsig -----BEGIN PGP SIGNATURE-----\n fake\n -----END PGP SIGNATURE-----\n" +
    "\nsigned tip\n";
  const id = out(
    ["hash-object", "-w", "-t", "commit", "--literally", "--stdin"],
    raw,
  );
  git(dir, ["update-ref", "refs/heads/main", id]);
  return dir; // 2 commits
}

/** repoI: a commit signed with a real throwaway gpg key, so the server's
 * verification marks it Verified. Skipped (null) when gpg is unavailable.
 * The GNUPGHOME set here stays in process.env so the spawned server inherits
 * it and verifies against the same keyring. */
function makeRepoI(): string | null {
  try {
    // Windows can have two gpg flavors on the PATH (native and Git's MSYS
    // build) that disagree about path syntax. Resolve one binary and pin it
    // everywhere: key generation, the signing commit (gpg.program), and the
    // server's later verification (repo-local gpg.program config).
    const gpg = resolveGpg();
    if (process.platform === "win32") {
      gpgconfBin = path.join(path.dirname(gpg), "gpgconf.exe");
    }
    const home = path.join(tmpDir, "gnupg");
    mkdirSync(home, { recursive: true, mode: 0o700 });
    process.env.GNUPGHOME = gpgHomePath(gpg, home);
    execFileSync(
      gpg,
      [
        "--batch",
        "--pinentry-mode",
        "loopback",
        "--passphrase",
        "",
        "--quick-gen-key",
        "Tester <tester@example.com>",
        "ed25519",
        "sign",
        "never",
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );

    const dir = initRepo("repoI");
    git(dir, ["config", "gpg.program", gpg]);
    const t = 1_700_000_000;
    commit(dir, "unsigned base", t);
    git(
      dir,
      [
        "-c",
        "user.signingkey=tester@example.com",
        "-c",
        "commit.gpgsign=true",
        "commit",
        "--allow-empty",
        "-q",
        "-m",
        "verified tip",
      ],
      atTime(t + 10),
    );
    return dir; // 2 commits
  } catch (e) {
    // No gpg, or a broken gpg setup: the Verified-badge test just skips.
    const stderr = (e as { stderr?: Buffer }).stderr?.toString() ?? String(e);
    console.warn(`repoI skipped (gpg unavailable?): ${stderr.trim()}`);
    if (process.env.GNUPGHOME) {
      // A half-done setup may have started an agent holding files in .tmp.
      try {
        execFileSync(
          gpgconfBin,
          ["--homedir", process.env.GNUPGHOME, "--kill", "all"],
          { stdio: "ignore" },
        );
      } catch {
        // Best effort.
      }
      delete process.env.GNUPGHOME;
    }
    return null;
  }
}

/** The absolute path of the gpg the PATH resolves to (throws when absent). */
function resolveGpg(): string {
  if (process.platform !== "win32") {
    execFileSync("gpg", ["--version"], { stdio: "ignore" });
    return "gpg";
  }
  return execFileSync("where.exe", ["gpg"], { encoding: "utf8" })
    .split(/\r?\n/)[0]
    .trim();
}

/** GNUPGHOME in the form the resolved gpg understands. Git for Windows ships
 * an MSYS gpg that only takes POSIX paths (/v/...), while a native gpg wants
 * the Windows form. */
function gpgHomePath(gpg: string, home: string): string {
  if (process.platform !== "win32") return home;
  if (/\\usr\\bin\\gpg\.exe$/i.test(gpg)) {
    return `/${home[0].toLowerCase()}${home.slice(2).replaceAll("\\", "/")}`;
  }
  return home.replaceAll("\\", "/");
}

/** repoJ: two diverged branches for the branch-menu (checkout/merge) test,
 * which mutates it — no other test may depend on its state. */
function makeRepoJ(): string {
  const dir = initRepo("repoJ");
  const t = 1_700_000_000;
  commit(dir, "j-1", t);
  git(dir, ["switch", "-c", "topic", "-q"]);
  commit(dir, "t-1", t + 10);
  git(dir, ["switch", "main", "-q"]);
  commit(dir, "j-2", t + 20);
  return dir; // 3 commits
}

/** repoK: a multi-line file change plus a github.com origin URL (never
 * fetched), for the diff line-selection and permalink test. */
function makeRepoK(): string {
  const dir = initRepo("repoK");
  const t = 1_700_000_000;
  writeFileSync(path.join(dir, "list.txt"), "alpha\nbeta\ngamma\n");
  git(dir, ["add", "."]);
  commit(dir, "k-1", t);
  writeFileSync(
    path.join(dir, "list.txt"),
    "alpha\nbeta\ndelta\nepsilon\ngamma\n",
  );
  git(dir, ["add", "."]);
  commit(dir, "k-2", t + 10);
  git(dir, ["remote", "add", "origin", "https://github.com/example/repoK.git"]);
  return dir; // 2 commits
}

/** repoL: a tag and a stash next to a branch, for the badge-kind test. */
function makeRepoL(): string {
  const dir = initRepo("repoL");
  const t = 1_700_000_000;
  writeFileSync(path.join(dir, "note.txt"), "one\n");
  git(dir, ["add", "."]);
  commit(dir, "l-1", t);
  git(dir, ["tag", "v1.0"]);
  writeFileSync(path.join(dir, "note.txt"), "two\n");
  git(dir, ["stash", "push", "-q"], atTime(t + 10));
  return dir;
}

/** Set by makeRepoI; the teardown must talk to the same gpg installation. */
let gpgconfBin = "gpgconf";

let server: ChildProcess | undefined;

export default async function globalSetup(_config: FullConfig) {
  // Fresh fixtures every run.
  rmSync(tmpDir, { recursive: true, force: true });
  mkdirSync(tmpDir, { recursive: true });

  const repoA = makeRepoA();
  const repoB = makeRepoB();
  const repoC = makeRepoC();
  const repoD = makeRepoD();
  const repoE = makeRepoE();
  const repoF = makeRepoF();
  const repoG = makeRepoG();
  const repoH = makeRepoH();
  const repoI = makeRepoI();
  const repoJ = makeRepoJ();
  const repoK = makeRepoK();
  const repoL = makeRepoL();

  // Serve repoA and repoB; repoC..H are added by tests.
  server = await buildAndServe(PORT, [repoA, repoB]);

  // Expose the extra fixture paths to the specs.
  writeFileSync(
    path.join(tmpDir, "fixtures.json"),
    JSON.stringify(
      {
        repoC,
        repoD,
        repoE,
        repoF: repoF.clone,
        repoFOrigin: repoF.origin,
        repoG,
        repoH,
        repoI,
        repoJ,
        repoK,
        repoL,
      },
      null,
      2,
    ),
  );

  // Returned function runs as global teardown.
  return async () => {
    server?.kill();
    // Stop the throwaway keyring's gpg-agent: it holds socket files inside
    // GNUPGHOME, which would make the next run's cleanup of .tmp fail.
    // Even a failed repoI setup can have started an agent (gen-key succeeds,
    // signing fails), so key off GNUPGHOME alone.
    if (process.env.GNUPGHOME) {
      try {
        execFileSync(
          gpgconfBin,
          ["--homedir", process.env.GNUPGHOME, "--kill", "all"],
          { stdio: "ignore" },
        );
      } catch {
        // Best effort; a lingering agent times out on its own eventually.
      }
    }
  };
}
