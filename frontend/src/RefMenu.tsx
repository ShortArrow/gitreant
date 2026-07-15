import { useEffect, useState } from "react";
import { useT } from "./settings";

/** Where and for which reference the context menu is open. */
export interface RefMenuTarget {
  x: number;
  y: number;
  /** Qualified reference: "feature", or "origin/main" for remote refs. */
  reference: string;
}

/**
 * Context menu for a branch badge: copy the name, check the branch out, or
 * merge it into the checked-out branch. Mutating actions ask for an inline
 * confirmation first.
 */
export function RefMenu({
  target,
  headBranch,
  onCheckout,
  onMerge,
  onClose,
}: {
  target: RefMenuTarget;
  /** The checked-out branch, if any; the merge item needs a target. */
  headBranch?: string;
  onCheckout: (reference: string) => void;
  onMerge: (reference: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [confirm, setConfirm] = useState<"checkout" | "merge" | null>(null);

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
            {t("refCopyName")}
          </button>
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
        <>
          <span className="ref-menu-question">
            {confirm === "checkout"
              ? t("refCheckoutQuestion", { reference: target.reference })
              : t("refMergeQuestion", {
                  reference: target.reference,
                  branch: headBranch ?? "…",
                })}
          </span>
          <button
            type="button"
            data-testid="ref-menu-confirm"
            onClick={() => {
              (confirm === "checkout" ? onCheckout : onMerge)(target.reference);
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
