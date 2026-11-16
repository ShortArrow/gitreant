/** The server's secret, which every API request carries (ADR 0063). A
 * launcher file posts it and the server writes it into the page, or, where
 * no launcher file can be used, the address hands it over in its fragment
 * (ADR 0076), or a ticket in the fragment is traded for it (ADR 0083). The page keeps it in its own tab's session storage rather
 * than the origin's storage every tab reads, so a page another program
 * left open on the port does not get it from there (ADR 0073). */

const SECRET_KEY = "gitreant-token";
const SECRET_HEADER = "X-Gitreant-Token";

let secret: string | null = null;
const unauthorized = new Set<() => void>();

/** The secret a `#token=` fragment hands over, if any. */
export function secretFrom(hash: string): string | null {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  return params.get("token") || null;
}

/** The ticket a `#ticket=` fragment hands over, if any. */
export function ticketFrom(hash: string): string | null {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  return params.get("ticket") || null;
}

/** The secret the server trades `ticket` for, or null where it refuses. */
async function traded(ticket: string): Promise<string | null> {
  try {
    const response = await fetch("/api/tickets/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticket }),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { secret?: unknown };
    return typeof body.secret === "string" && body.secret ? body.secret : null;
  } catch {
    return null;
  }
}

/** The secret the server wrote into the page it answered a post with,
 * taken out of the page so nothing that reads the page later finds it. */
function secretPosted(): string | null {
  const meta = document.querySelector<HTMLMetaElement>(
    'meta[name="gitreant-secret"]',
  );
  const posted = meta?.content || null;
  meta?.remove();
  return posted;
}

/** Take the secret posted to the page or handed over in its address, or
 * trade the ticket handed over for it, keep it for this tab, and take
 * either out of the address bar and the session's history first; else use
 * the one this tab kept. A secret an earlier version kept for every tab is
 * dropped. */
export async function initSecret(): Promise<void> {
  try {
    localStorage.removeItem(SECRET_KEY);
  } catch {
    // Without storage, nothing was kept there.
  }
  const ticket = ticketFrom(window.location.hash);
  const given = secretPosted() || secretFrom(window.location.hash);
  if (given || ticket) {
    window.history.replaceState(null, "", window.location.pathname);
  }
  const handed = given || (ticket ? await traded(ticket) : null);
  if (handed) {
    try {
      sessionStorage.setItem(SECRET_KEY, handed);
    } catch {
      // Without storage, the secret lasts as long as this page.
    }
    secret = handed;
    return;
  }
  try {
    secret = sessionStorage.getItem(SECRET_KEY);
  } catch {
    secret = null;
  }
}

/** Call `listener` when the server refuses a request for want of the
 * secret; returns a function that stops it. */
export function onUnauthorized(listener: () => void): () => void {
  unauthorized.add(listener);
  return () => unauthorized.delete(listener);
}

/** `fetch` with the secret in its header. */
export async function apiFetch(
  input: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (secret) headers.set(SECRET_HEADER, secret);
  const response = await fetch(input, { ...init, headers });
  if (response.status === 401) unauthorized.forEach((listener) => listener());
  return response;
}
