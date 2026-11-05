import { apiFetch } from "./secret";

/** The wait before connecting again, until the server sets another. */
const DEFAULT_RETRY_MS = 3000;

/** A function fed the stream's text in chunks of any size, which reports
 * each message whose block is complete and each `retry` the server sets.
 * Lines end in `\n` or `\r\n`, as the server writes them; a lone `\r` is not
 * read as an ending. */
export function sseReader(
  onMessage: (event: string, data: string) => void,
  onRetry: (ms: number) => void,
): (chunk: string) => void {
  let partial = "";
  let event = "";
  let data: string[] = [];
  return (chunk) => {
    const lines = (partial + chunk).split("\n");
    partial = lines.pop() ?? "";
    for (const line of lines.map((text) => text.replace(/\r$/, ""))) {
      if (line === "") {
        if (data.length > 0) onMessage(event || "message", data.join("\n"));
        event = "";
        data = [];
        continue;
      }
      const colon = line.indexOf(":");
      const field = colon < 0 ? line : line.slice(0, colon);
      const value = colon < 0 ? "" : line.slice(colon + 1).replace(/^ /, "");
      if (field === "event") event = value;
      else if (field === "data") data.push(value);
      else if (field === "retry" && /^\d+$/.test(value)) onRetry(Number(value));
    }
  };
}

export type EventStream = EventTarget & { close(): void };

/** The server's event stream, read with `fetch` so the secret rides in the
 * header rather than the address (ADR 0082). As an `EventSource` does, it
 * dispatches `open` on each connection and a `MessageEvent` named after each
 * message's event, connects again after a drop, and stops for good when the
 * server answers with an error. */
export function openEventStream(): EventStream {
  const target = new EventTarget();
  const abort = new AbortController();
  let retryMs = DEFAULT_RETRY_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;

  async function connect() {
    try {
      const response = await apiFetch("/api/events", { signal: abort.signal });
      if (!response.ok || !response.body) return;
      target.dispatchEvent(new Event("open"));
      const feed = sseReader(
        (event, data) =>
          target.dispatchEvent(new MessageEvent(event, { data })),
        (ms) => {
          retryMs = ms;
        },
      );
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        feed(decoder.decode(value, { stream: true }));
      }
    } catch {
      // A dropped connection, or a close: the check below tells them apart.
    }
    if (!abort.signal.aborted) timer = setTimeout(connect, retryMs);
  }

  void connect();
  return Object.assign(target, {
    close() {
      abort.abort();
      clearTimeout(timer);
    },
  });
}
