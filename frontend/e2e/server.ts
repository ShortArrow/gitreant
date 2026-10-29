import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const frontendDir = process.cwd();
const projectRoot = path.resolve(frontendDir, "..");
const binary = path.join(
  projectRoot,
  "target",
  "debug",
  process.platform === "win32" ? "gitreant.exe" : "gitreant",
);

async function waitForServer(port: number, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/ping`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("gitreant server did not start in time");
}

/** The secret the server on `port` wrote in its record (ADR 0063), which
 * the page is opened with and the tests' own API requests carry. */
export function serverSecret(port: number): string {
  const dir = path.join(frontendDir, "e2e", ".tmp", "servers");
  const record = path.join(dir, `${port}.json`);
  return (JSON.parse(readFileSync(record, "utf8")) as { token: string }).token;
}

/**
 * Build the frontend and the debug binary, then serve `repoPaths` on `port`.
 * --foreground keeps the server a direct child so a teardown kill() reaches it.
 */
export async function buildAndServe(
  port: number,
  repoPaths: string[],
): Promise<ChildProcess> {
  execFileSync("pnpm", ["run", "build"], {
    cwd: frontendDir,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  execFileSync("cargo", ["build", "-q"], {
    cwd: projectRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (!existsSync(binary)) {
    throw new Error(`gitreant binary not found at ${binary}`);
  }

  const server = spawn(
    binary,
    ["--foreground", "--no-open", "--port", String(port), ...repoPaths],
    // Keep its record (ADR 0039) and its configuration (ADR 0062) out of
    // the user's own directories.
    {
      stdio: "ignore",
      env: {
        ...process.env,
        GITREANT_STATE_DIR: path.join(frontendDir, "e2e", ".tmp", "servers"),
        GITREANT_CONFIG_DIR: path.join(frontendDir, "e2e", ".tmp", "config"),
      },
    },
  );
  await waitForServer(port, 15_000);
  return server;
}
