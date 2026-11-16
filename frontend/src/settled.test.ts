import { expect, test } from "vitest";
import type { CommitView, RepoView } from "./api";
import { Settled } from "./settled";

function commit(id: string, extra: Partial<CommitView> = {}): CommitView {
  return {
    id,
    row: 0,
    lane: 0,
    color: 0,
    parents: [],
    summary: id,
    author: "a",
    time: 0,
    ...extra,
  };
}

function view(repo: string, commits: CommitView[]): RepoView {
  return {
    id: repo,
    name: repo,
    path: repo,
    head: null,
    commits,
  } as unknown as RepoView;
}

test("a counted batch fills in the counts of the commits it names", () => {
  const settled = new Settled();
  settled.counted("r", [
    { id: "a", stat: { added: 3, deleted: 1 } },
    { id: "b" },
  ]);
  const before = view("r", [commit("a"), commit("b"), commit("c")]);
  const after = settled.applyTo(before);
  expect(after.commits.map((c) => c.stat)).toEqual([
    { added: 3, deleted: 1 },
    undefined,
    undefined,
  ]);
  expect(before.commits[0].stat).toBeUndefined();
});

test("a checked batch settles each signature it names", () => {
  const settled = new Settled();
  settled.verified("r", [
    { id: "a", verified: true, signature_key: "ABCD1234" },
    { id: "b", verified: false },
    { id: "c" },
  ]);
  const after = settled.applyTo(
    view("r", [
      commit("a", { verifying: true }),
      commit("b", { verifying: true }),
      commit("c", { verifying: true }),
      commit("d", { verifying: true }),
    ]),
  );
  expect(
    after.commits.map(({ verified, signature_key, verifying }) => ({
      verified,
      signature_key,
      verifying,
    })),
  ).toEqual([
    { verified: true, signature_key: "ABCD1234", verifying: false },
    { verified: false, signature_key: undefined, verifying: false },
    { verified: undefined, signature_key: undefined, verifying: false },
    { verified: undefined, signature_key: undefined, verifying: true },
  ]);
});

test("what a batch settled reaches a view that arrives after it, of its own repository only", () => {
  const settled = new Settled();
  settled.counted("r", [{ id: "a", stat: { added: 1, deleted: 0 } }]);
  expect(settled.applyTo(view("r", [commit("a")])).commits[0].stat).toEqual({
    added: 1,
    deleted: 0,
  });
  expect(
    settled.applyTo(view("other", [commit("a")])).commits[0].stat,
  ).toBeUndefined();
});

test("a view with nothing to settle is kept as it is", () => {
  const settled = new Settled();
  const unchanged = view("r", [commit("a")]);
  expect(settled.applyTo(unchanged)).toBe(unchanged);
  settled.counted("r", [{ id: "z", stat: { added: 1, deleted: 0 } }]);
  expect(settled.applyTo(unchanged)).toBe(unchanged);
});

test("forgetting drops what was settled", () => {
  const settled = new Settled();
  settled.counted("r", [{ id: "a", stat: { added: 1, deleted: 0 } }]);
  settled.forget();
  expect(
    settled.applyTo(view("r", [commit("a")])).commits[0].stat,
  ).toBeUndefined();
});

test("a view already holding what was settled is kept as it is", () => {
  const settled = new Settled();
  settled.counted("r", [{ id: "a", stat: { added: 1, deleted: 0 } }]);
  const filled = settled.applyTo(view("r", [commit("a"), commit("b")]));
  settled.counted("r", [{ id: "z", stat: { added: 2, deleted: 0 } }]);
  expect(settled.applyTo(filled)).toBe(filled);

  settled.counted("r", [{ id: "b", stat: { added: 3, deleted: 0 } }]);
  const again = settled.applyTo(filled);
  expect(again).not.toBe(filled);
  expect(again.commits[0]).toBe(filled.commits[0]);
  expect(again.commits[1].stat).toEqual({ added: 3, deleted: 0 });
});
