import { useEffect, useState } from "react";
import { shortId } from "./graph";
import { useT } from "./settings";

/**
 * Context menu on a commit row or node: a list of actions first (copy the
 * id, copy or open the commit's web page, create tag, create branch), and a
 * name input once a ref is to be created — so further commands can slot in
 * without fighting an always-open input.
 */
export function CommitMenu({
  x,
  y,
  commit,
  webUrl,
  onCreateTag,
  onCreateBranch,
  onClose,
}: {
  x: number;
  y: number;
  /** The full commit id the actions apply to. */
  commit: string;
  /** The commit's page on the origin's host; absent when it has none. */
  webUrl?: string;
  /** Absent when tags cannot be created here (a submodule's commit). */
  onCreateTag?: (name: string) => void;
  /** Absent when branches cannot be created here. */
  onCreateBranch?: (name: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [stage, setStage] = useState<"tag" | "branch" | null>(null);
  const [name, setName] = useState("");
  const copyAndClose = (text: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
    onClose();
  };

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

  return (
    <div
      className="ctx-menu commit-menu"
      data-testid="commit-menu"
      style={{ left: x, top: y }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <span className="ctx-menu-note">{shortId(commit)}</span>
      {stage === null ? (
        <>
          <button
            type="button"
            data-testid="commit-menu-copy-hash"
            onClick={() => copyAndClose(commit)}
          >
            {t("copyCommitId")}
          </button>
          {webUrl && (
            <>
              <button
                type="button"
                data-testid="commit-menu-copy-url"
                onClick={() => copyAndClose(webUrl)}
              >
                {t("copyCommitUrl")}
              </button>
              <a
                data-testid="commit-menu-open-url"
                href={webUrl}
                target="_blank"
                rel="noreferrer"
                onClick={onClose}
                onAuxClick={onClose}
              >
                {t("openCommitUrl")}
              </a>
            </>
          )}
          {onCreateTag && (
            <button
              type="button"
              data-testid="commit-menu-tag"
              onClick={() => setStage("tag")}
            >
              {t("createTag")}…
            </button>
          )}
          {onCreateBranch && (
            <button
              type="button"
              data-testid="commit-menu-branch"
              onClick={() => setStage("branch")}
            >
              {t("createBranch")}…
            </button>
          )}
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const trimmed = name.trim();
            if (!trimmed) return;
            (stage === "tag" ? onCreateTag : onCreateBranch)?.(trimmed);
            onClose();
          }}
        >
          <input
            data-testid="ref-name-input"
            placeholder={t(
              stage === "tag" ? "tagNamePlaceholder" : "branchNamePlaceholder",
            )}
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
          />
          <button type="submit" data-testid="ref-create">
            {t(stage === "tag" ? "createTag" : "createBranch")}
          </button>
        </form>
      )}
    </div>
  );
}
