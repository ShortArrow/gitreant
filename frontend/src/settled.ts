import type { CommitView, RepoView } from "./api";

/** What a background batch settled for one commit (ADR 0083): a count,
 * or a signature's verdict. */
export interface CountedCommit {
  id: string;
  stat?: { added: number; deleted: number };
}

export interface VerifiedCommit {
  id: string;
  verified?: boolean;
  signature_key?: string;
}

/** The `counted` and `verified` events' payload. */
export interface SettledBatch<T> {
  repo: string;
  commits: T[];
}

type Patch = Partial<
  Pick<CommitView, "stat" | "verified" | "signature_key" | "verifying">
>;

/** What the background batches settled, by repository and commit, laid
 * over every view of that repository, including one read before a batch
 * settled and answered after it. */
export class Settled {
  private patches = new Map<string, Map<string, Patch>>();

  counted(repo: string, commits: CountedCommit[]): void {
    for (const { id, stat } of commits) this.patch(repo, id, { stat });
  }

  verified(repo: string, commits: VerifiedCommit[]): void {
    for (const { id, verified, signature_key } of commits) {
      this.patch(repo, id, { verified, signature_key, verifying: false });
    }
  }

  /** Drop everything settled, for when the server's own results may have
   * changed under it. */
  forget(): void {
    this.patches.clear();
  }

  /** `view` with what was settled for its commits; `view` itself when
   * nothing was. */
  applyTo(view: RepoView): RepoView {
    const patches = this.patches.get(view.id);
    if (!patches || !view.commits.some((c) => patches.has(c.id))) return view;
    return {
      ...view,
      commits: view.commits.map((c) => {
        const patch = patches.get(c.id);
        return patch ? { ...c, ...patch } : c;
      }),
    };
  }

  private patch(repo: string, id: string, patch: Patch): void {
    let patches = this.patches.get(repo);
    if (!patches) {
      patches = new Map();
      this.patches.set(repo, patches);
    }
    patches.set(id, { ...patches.get(id), ...patch });
  }
}
