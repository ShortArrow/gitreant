import { expect, test, vi } from "vitest";
import { apiFetch, initSecret, secretFrom, ticketFrom } from "./secret";

test("secretFrom reads the secret the address hands over", () => {
  expect(secretFrom("#token=5ec2e7")).toBe("5ec2e7");
  expect(secretFrom("#token=5ec2e7&x=1")).toBe("5ec2e7");
  expect(secretFrom("#x=1&token=5ec2e7")).toBe("5ec2e7");
  expect(secretFrom("#other")).toBeNull();
  expect(secretFrom("#token=")).toBeNull();
  expect(secretFrom("")).toBeNull();
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
    location: { hash, pathname: "/" },
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
  expect(addresses).toEqual(["/", "/"]);
});

test("ticketFrom reads the ticket the address hands over", () => {
  expect(ticketFrom("#ticket=7ic4e7")).toBe("7ic4e7");
  expect(ticketFrom("#token=5ec2e7")).toBeNull();
  expect(ticketFrom("#ticket=")).toBeNull();
  expect(ticketFrom("")).toBeNull();
});

/** Open the page at `hash` while the server answers a trade with
 * `answer`, and return the addresses the page set, the requests it made,
 * and the secret its next API request carries. */
async function tradedAt(hash: string, answer: Response) {
  const addresses: string[] = [];
  const requests: [string, RequestInit][] = [];
  const fetch = vi.fn(async (input: string, init: RequestInit = {}) => {
    requests.push([input, init]);
    expect(addresses).toEqual(["/"]);
    return input === "/api/tickets/redeem" ? answer : new Response("{}");
  });
  vi.stubGlobal("fetch", fetch);
  vi.stubGlobal("localStorage", memoryStorage());
  vi.stubGlobal("sessionStorage", memoryStorage());
  vi.stubGlobal("document", { querySelector: () => null });
  vi.stubGlobal("window", {
    location: { hash, pathname: "/" },
    history: {
      replaceState: (_state: unknown, _title: string, url: string) =>
        addresses.push(url),
    },
  });
  try {
    await initSecret();
    await apiFetch("/api/repos");
    const sent = new Headers(requests.at(-1)![1].headers).get(
      "X-Gitreant-Token",
    );
    return { addresses, requests, sent };
  } finally {
    vi.unstubAllGlobals();
  }
}

test("the page trades a ticket for the secret, taking it out of the address first", async () => {
  const { addresses, requests, sent } = await tradedAt(
    "#ticket=7ic4e7",
    new Response(JSON.stringify({ secret: "5ec2e7" })),
  );
  expect(addresses).toEqual(["/"]);
  expect(requests[0][0]).toBe("/api/tickets/redeem");
  expect(requests[0][1].method).toBe("POST");
  expect(JSON.parse(String(requests[0][1].body))).toEqual({
    ticket: "7ic4e7",
  });
  expect(sent).toBe("5ec2e7");
});

test("a ticket the server refuses leaves the page without a secret", async () => {
  const { sent } = await tradedAt(
    "#ticket=7ic4e7",
    new Response("refused", { status: 403 }),
  );
  expect(sent).toBeNull();
});
