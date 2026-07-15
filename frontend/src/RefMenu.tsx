import { useEffect, useState } from "react";
import { useT } from "./settings";

/** Where and for which reference the context menu is open. */
export interface RefMenuTarget {
  x: number;
  y: number;
  /** Qualified reference: "feature", or "origin/main" for remote refs. */
  reference: string;
  /** What the badge is; tags get delete instead of checkout/merge. */
  kind: "branch" | "tag";
}

/**
 * Context menu for a branch or tag badge: copy the name, then check out /
 * merge (branches) or delete (tags). Mutating actions ask for an inline
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

  useEffect(() => {
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      onClose();
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", close);
    };
  }, [onClose]);

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
          {target.kind === "branch" ? (
            <>
              <button
                type="button"
                data-testid="ref-menu-checkout"
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
