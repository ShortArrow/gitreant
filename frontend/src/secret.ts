/** The server's secret, which every API request carries (ADR 0063). The
 * address gitreant opens hands it over in its fragment; the page keeps it
 * in its own tab's session storage rather than the origin's storage every
 * tab reads, so a page another program left open on the port does not get
 * it from there (ADR 0073). */

const SECRET_KEY = "gitreant-token";
const SECRET_HEADER = "X-Gitreant-Token";

let secret: string | null = null;
const unauthorized = new Set<() => void>();

/** The secret a `#token=` fragment hands over, if any. */
export function secretFrom(hash: string): string | null {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  return params.get("token") || null;
}

/** Take the secret from the address, keep it for this tab, and take it out
 * of the address bar and the session's history; else use the one this tab
 * kept. A secret an earlier version kept for every tab is dropped. */
export function initSecret() {
  try {
    localStorage.removeItem(SECRET_KEY);
  } catch {
    // Without storage, nothing was kept there.
  }
  const handed = secretFrom(window.location.hash);
  if (handed) {
    try {
      sessionStorage.setItem(SECRET_KEY, handed);
    } catch {
      // Without storage, the secret lasts as long as this page.
    }
    window.history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search,
    );
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

/** `fetch` with the secret in its header, never answered from the
 * browser's cache, which another program on the port may have filled. */
export async function apiFetch(
  input: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (secret) headers.set(SECRET_HEADER, secret);
  const response = await fetch(input, { ...init, headers, cache: "no-store" });
  if (response.status === 401) unauthorized.forEach((listener) => listener());
  return response;
}

/** The event stream's address: a browser opens it without headers, so the
 * secret rides in its query. */
export function eventsUrl(): string {
  return secret
    ? `/api/events?token=${encodeURIComponent(secret)}`
    : "/api/events";
}
