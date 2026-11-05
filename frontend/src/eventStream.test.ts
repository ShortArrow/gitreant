import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { openEventStream, sseReader } from "./eventStream";
import { onUnauthorized } from "./secret";

/** What `sseReader` reports for `chunks`, in order. */
function read(...chunks: string[]): unknown[] {
  const seen: unknown[] = [];
  const feed = sseReader(
    (event, data) => seen.push([event, data]),
    (ms) => seen.push(ms),
  );
  chunks.forEach(feed);
  return seen;
}

test("sseReader reports each block when its blank line arrives", () => {
  expect(read("event: update\ndata: changed\n\n")).toEqual([
    ["update", "changed"],
  ]);
  expect(read("event: update\ndata: changed\n")).toEqual([]);
  expect(read("event: a\ndata: 1\n\nevent: b\ndata: 2\n\n")).toEqual([
    ["a", "1"],
    ["b", "2"],
  ]);
});

test("sseReader joins a block cut across chunks", () => {
  expect(read("event: up", "date\nda", "ta: changed\n", "\n")).toEqual([
    ["update", "changed"],
  ]);
});

test("sseReader reads the fields as the format defines them", () => {
  expect(read("data: 1\ndata: 2\n\n")).toEqual([["message", "1\n2"]]);
  expect(read("data:no space\n\n")).toEqual([["message", "no space"]]);
  expect(read("data:  two spaces\n\n")).toEqual([["message", " two spaces"]]);
  expect(read("event: a\r\ndata: 1\r\n\r\n")).toEqual([["a", "1"]]);
});

test("sseReader skips keep-alives and blocks without data", () => {
  expect(read(": keep-alive\n\n")).toEqual([]);
  expect(read("event: a\n\ndata: 1\n\n")).toEqual([["message", "1"]]);
  expect(read("unknown: x\n\n")).toEqual([]);
});

test("sseReader reports a retry that is a number", () => {
  expect(read("retry: 100\n\n")).toEqual([100]);
  expect(read("retry: soon\n\n")).toEqual([]);
});

/** A response whose body the test writes; `end` drops the connection. */
function streamed(status = 200) {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start: (c) => {
      controller = c;
    },
  });
  return {
    response: new Response(body, { status }),
    write: (text: string) => controller.enqueue(new TextEncoder().encode(text)),
    end: () => controller.close(),
  };
}

/** Let the stream's pending reads run, without moving its retry timer. */
const settle = () => vi.advanceTimersByTimeAsync(0);

const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>();

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("the stream's address holds nothing but its path", async () => {
  fetchMock.mockResolvedValueOnce(streamed().response);
  const stream = openEventStream();
  await settle();
  expect(fetchMock.mock.calls[0][0]).toBe("/api/events");
  stream.close();
});

test("the stream reports its connection and what the server sends", async () => {
  const server = streamed();
  fetchMock.mockResolvedValueOnce(server.response);
  const stream = openEventStream();
  const seen: string[] = [];
  stream.addEventListener("open", () => seen.push("open"));
  stream.addEventListener("update", (e) =>
    seen.push((e as MessageEvent<string>).data),
  );
  await settle();
  server.write("event: update\ndata: changed\n\n");
  await settle();
  expect(seen).toEqual(["open", "changed"]);
  stream.close();
});

test("a dropped stream connects again after the delay the server set", async () => {
  const first = streamed();
  const second = streamed();
  fetchMock
    .mockResolvedValueOnce(first.response)
    .mockResolvedValueOnce(second.response);
  const stream = openEventStream();
  await settle();
  first.write("retry: 100\n\n");
  first.end();
  await vi.advanceTimersByTimeAsync(99);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  stream.close();
});

test("a stream that cannot connect tries again", async () => {
  fetchMock
    .mockRejectedValueOnce(new TypeError("connection refused"))
    .mockResolvedValueOnce(streamed().response);
  const stream = openEventStream();
  await settle();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(3000);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  stream.close();
});

test("a stream the server refuses says so, and stops", async () => {
  const refused = vi.fn();
  const stop = onUnauthorized(refused);
  fetchMock.mockResolvedValueOnce(new Response("no", { status: 401 }));
  const stream = openEventStream();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(refused).toHaveBeenCalledOnce();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  stream.close();
  stop();
});

test("a closed stream never connects again", async () => {
  const server = streamed();
  fetchMock.mockResolvedValueOnce(server.response);
  const stream = openEventStream();
  await settle();
  stream.close();
  expect(fetchMock.mock.calls[0][1].signal?.aborted).toBe(true);
  server.end();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("closing during the wait to connect again cancels it", async () => {
  const server = streamed();
  fetchMock.mockResolvedValueOnce(server.response);
  const stream = openEventStream();
  await settle();
  server.end();
  await settle();
  stream.close();
  await vi.advanceTimersByTimeAsync(60_000);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
