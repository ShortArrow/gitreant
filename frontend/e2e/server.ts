import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
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
    { stdio: "ignore" },
  );
  await waitForServer(port, 15_000);
  return server;
}
