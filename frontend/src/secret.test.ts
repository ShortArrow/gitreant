import { expect, test, vi } from "vitest";
import { apiFetch, initSecret, secretFrom } from "./secret";

test("secretFrom reads the secret the address hands over", () => {
  expect(secretFrom("#token=5ec2e7")).toBe("5ec2e7");
  expect(secretFrom("#token=5ec2e7&x=1")).toBe("5ec2e7");
  expect(secretFrom("#x=1&token=5ec2e7")).toBe("5ec2e7");
  expect(secretFrom("#other")).toBeNull();
  expect(secretFrom("#token=")).toBeNull();
  expect(secretFrom("")).toBeNull();
});

test("apiFetch never answers from the browser's cache", async () => {
  const fetch = vi.fn(async () => new Response("{}"));
  vi.stubGlobal("fetch", fetch);
  try {
    await apiFetch("/api/repos");
    expect(fetch).toHaveBeenCalledWith(
      "/api/repos",
      expect.objectContaining({ cache: "no-store" }),
    );
  } finally {
    vi.unstubAllGlobals();
  }
});

/** A storage that lives in a map, as `localStorage` and `sessionStorage` do. */
function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, value),
  };
}

/** Open the page at `hash` with the given storages, and return the secret
 * its next API request carries. */
async function secretSent(
  hash: string,
  local: Storage,
  session: Storage,
  posted: string | null = null,
  addresses: string[] = [],
  removed: string[] = [],
) {
  const fetch = vi.fn(
    async (_input: string, _init: RequestInit) => new Response("{}"),
  );
  vi.stubGlobal("fetch", fetch);
  vi.stubGlobal("localStorage", local);
  vi.stubGlobal("sessionStorage", session);
  vi.stubGlobal("document", {
    querySelector: (selector: string) =>
      selector === 'meta[name="gitreant-secret"]' && posted !== null
        ? { content: posted, remove: () => removed.push(posted) }
        : null,
  });
  vi.stubGlobal("window", {
    location: { hash, pathname: "/", search: hash ? "?1a2b" : "" },
    history: {
      replaceState: (_state: unknown, _title: string, url: string) =>
        addresses.push(url),
    },
  });
  try {
    initSecret();
    await apiFetch("/api/repos");
    const init = fetch.mock.calls[0][1];
    return new Headers(init.headers).get("X-Gitreant-Token");
  } finally {
    vi.unstubAllGlobals();
  }
}

test("the secret stays with its tab, out of storage other tabs read", async () => {
  const local = memoryStorage();
  local.setItem("gitreant-token", "old");
  const session = memoryStorage();

  expect(await secretSent("#token=5ec2e7", local, session)).toBe("5ec2e7");
  expect(local.getItem("gitreant-token")).toBeNull();

  expect(await secretSent("", local, session)).toBe("5ec2e7");
  expect(await secretSent("", local, memoryStorage())).toBeNull();
});

test("the page takes the secret posted or handed to it, and keeps it out of the address", async () => {
  const addresses: string[] = [];
  const removed: string[] = [];
  const session = memoryStorage();
  expect(
    await secretSent(
      "",
      memoryStorage(),
      session,
      "5ec2e7",
      addresses,
      removed,
    ),
  ).toBe("5ec2e7");
  expect(session.getItem("gitreant-token")).toBe("5ec2e7");
  expect(addresses).toEqual(["/"]);
  expect(removed).toEqual(["5ec2e7"]);

  expect(
    await secretSent(
      "#token=f00d",
      memoryStorage(),
      memoryStorage(),
      null,
      addresses,
    ),
  ).toBe("f00d");
  expect(addresses).toEqual(["/", "/?1a2b"]);
});
