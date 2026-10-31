import { expect, test } from "vitest";
import { bodyCache } from "./bodyCache";

test("bodyCache asks once per commit, even while the first ask is in flight", async () => {
  const asked: string[] = [];
  let resolve: (body: string) => void = () => undefined;
  const get = bodyCache((id) => {
    asked.push(id);
    return new Promise((r) => (resolve = r));
  });
  const first = get("a");
  const second = get("a");
  resolve("Why.");
  expect(await first).toBe("Why.");
  expect(await second).toBe("Why.");
  expect(await get("a")).toBe("Why.");
  expect(asked).toEqual(["a"]);
});

test("bodyCache forgets a failed ask, so the next one asks again", async () => {
  let calls = 0;
  const get = bodyCache(async () => {
    calls += 1;
    if (calls === 1) throw new Error("offline");
    return "Why.";
  });
  await expect(get("a")).rejects.toThrow("offline");
  expect(await get("a")).toBe("Why.");
  expect(calls).toBe(2);
});
