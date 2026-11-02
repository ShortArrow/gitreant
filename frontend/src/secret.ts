/** The server's secret, which every API request carries (ADR 0063). A
 * launcher file posts it and the server writes it into the page, or, where
 * no launcher file can be used, the address hands it over in its fragment
 * (ADR 0076). The page keeps it in its own tab's session storage rather
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

/** The secret the server wrote into the page it answered a post with. */
function secretPosted(): string | null {
  const meta = document.querySelector<HTMLMetaElement>(
    'meta[name="gitreant-secret"]',
  );
  return meta?.content || null;
}

/** Take the secret posted to the page or handed over in its address, keep
 * it for this tab, and leave the address at the page's own, with no secret
 * and no value of this start; else use the one this tab kept. A secret an
 * earlier version kept for every tab is dropped. */
export function initSecret() {
  try {
    localStorage.removeItem(SECRET_KEY);
  } catch {
    // Without storage, nothing was kept there.
  }
  const handed = secretPosted() || secretFrom(window.location.hash);
  if (handed) {
    try {
      sessionStorage.setItem(SECRET_KEY, handed);
    } catch {
      // Without storage, the secret lasts as long as this page.
    }
    window.history.replaceState(null, "", window.location.pathname);
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
