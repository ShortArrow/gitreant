import { expect, test, vi } from "vitest";
import { apiFetch, secretFrom } from "./secret";

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
