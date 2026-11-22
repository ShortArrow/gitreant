import { useState } from "react";
import { useT } from "./settings";
import { useDismiss } from "./dismiss";

/** Where and for which reference the context menu is open. */
export interface RefMenuTarget {
  x: number;
  y: number;
  /** Qualified reference: "feature", or "origin/main" for remote refs. */
  reference: string;
  /** What the badge is; tags get delete instead of checkout/merge. */
  kind: "branch" | "tag";
  /** The other worktree this branch is checked out in, if any: git refuses
   * to switch to it here, so the menu says so instead of trying. */
  worktreePath?: string;
  /** The branch's open pull request, if it has one. */
  pr?: { number: number; url: string };
}

/**
 * Context menu for a branch or tag badge: copy the name, open the branch's
 * pull request where it has one, then check out / merge (branches) or
 * delete (tags). Mutating actions ask for an inline
 * confirmation first.
 */
export function RefMenu({
  target,
  headBranch,
  onCheckout,
  onMerge,
  onDeleteTag,
  onClose,
}: {
  target: RefMenuTarget;
  /** The checked-out branch, if any; the merge item needs a target. */
  headBranch?: string;
  onCheckout: (reference: string) => void;
  onMerge: (reference: string) => void;
  onDeleteTag: (name: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [confirm, setConfirm] = useState<
    "checkout" | "merge" | "delete-tag" | null
  >(null);

  useDismiss(onClose);

  const canMerge = headBranch !== undefined && headBranch !== target.reference;

  return (
    <div
      className="ref-menu"
      data-testid="ref-menu"
      style={{ left: target.x, top: target.y }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {confirm === null ? (
        <>
          <button
            type="button"
            data-testid="ref-menu-copy"
            onClick={() => {
              navigator.clipboard.writeText(target.reference).catch(() => {});
              onClose();
            }}
          >
            {t(target.kind === "tag" ? "copyTagName" : "refCopyName")}
          </button>
          {target.pr && (
            <button
              type="button"
              data-testid="ref-menu-pr"
              onClick={() => {
                window.open(target.pr!.url, "_blank", "noreferrer");
                onClose();
              }}
            >
              {t("openPr", { number: target.pr.number })}
            </button>
          )}
          {target.kind === "branch" ? (
            <>
              <button
                type="button"
                data-testid="ref-menu-checkout"
                disabled={target.worktreePath !== undefined}
                title={
                  target.worktreePath === undefined
                    ? undefined
                    : t("checkedOutIn", { path: target.worktreePath })
                }
                onClick={() => setConfirm("checkout")}
              >
                {t("refCheckout", { reference: target.reference })}
              </button>
              <button
                type="button"
                data-testid="ref-menu-merge"
                disabled={!canMerge}
                title={canMerge ? undefined : t("noBranchCheckedOut")}
                onClick={() => setConfirm("merge")}
              >
                {t("refMergeInto", { branch: headBranch ?? "…" })}
              </button>
            </>
          ) : (
            <button
              type="button"
              data-testid="ref-menu-delete-tag"
              onClick={() => setConfirm("delete-tag")}
            >
              {t("deleteTag")}
            </button>
          )}
        </>
      ) : (
        <>
          <span className="ref-menu-question">
            {confirm === "checkout" &&
              t("refCheckoutQuestion", { reference: target.reference })}
            {confirm === "merge" &&
              t("refMergeQuestion", {
                reference: target.reference,
                branch: headBranch ?? "…",
              })}
            {confirm === "delete-tag" &&
              t("deleteTagQuestion", { name: target.reference })}
          </span>
          <button
            type="button"
            data-testid="ref-menu-confirm"
            onClick={() => {
              if (confirm === "checkout") onCheckout(target.reference);
              else if (confirm === "merge") onMerge(target.reference);
              else onDeleteTag(target.reference);
              onClose();
            }}
          >
            {t("yes")}
          </button>
          <button type="button" data-testid="ref-menu-cancel" onClick={onClose}>
            {t("cancel")}
          </button>
        </>
      )}
    </div>
  );
}
