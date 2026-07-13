import { useState } from "react";
import type { FileDiff } from "./api";
import { inlineCells, parseUnified, type SplitCell } from "./diffModel";

type DiffView = "inline" | "split";

const DIFF_VIEW_KEY = "gitreant-diff-view";

function storedDiffView(): DiffView {
  try {
    return localStorage.getItem(DIFF_VIEW_KEY) === "split" ? "split" : "inline";
  } catch {
    return "inline";
  }
}

/** Unified diffs of one or all changed files, shown in place of the graph. */
export function FileDiffPane({
  files,
  error,
  onClose,
}: {
  /** null while loading; one entry per shown file. */
  files: FileDiff[] | null;
  error: string | null;
  onClose: () => void;
}) {
  const [view, setView] = useState<DiffView>(storedDiffView);
  const changeView = (next: DiffView) => {
    setView(next);
    try {
      localStorage.setItem(DIFF_VIEW_KEY, next);
    } catch {
      // localStorage may be unavailable; the state change alone is enough.
    }
  };

  return (
    <div className="diff-pane" data-testid="diff-pane">
      <header className="diff-head">
        <span className="diff-title">
          {files && files.length === 1 && files[0].path}
          {files && files.length > 1 && `${files.length} files`}
        </span>
        <div className="files-view">
          <button
            className={view === "inline" ? "active" : ""}
            data-testid="diff-view-inline"
            onClick={() => changeView("inline")}
            type="button"
          >
            Inline
          </button>
          <button
            className={view === "split" ? "active" : ""}
            data-testid="diff-view-split"
            onClick={() => changeView("split")}
            type="button"
          >
            Split
          </button>
        </div>
        <button
          className="icon-btn"
          title="Close diff"
          data-testid="diff-close"
          onClick={onClose}
          type="button"
        >
          ×
        </button>
      </header>

      <div className="diff-scroll">
        {error && <p className="detail-error">{error}</p>}
        {!error && !files && <p className="detail-loading">Loading…</p>}
        {files?.map((diff) => (
          <section
            key={diff.path}
            className="diff-file-section"
            data-testid="diff-file-section"
          >
            <div className="diff-file-head">
              <span className={`file-status file-status-${diff.status}`}>
                {diff.status}
              </span>
              <span className="diff-path">{diff.path}</span>
            </div>
            {diff.binary ? (
              <p className="diff-binary">Binary file — no text diff.</p>
            ) : view === "inline" ? (
              <InlineDiff text={diff.text} />
            ) : (
              <SplitDiff text={diff.text} />
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

const INLINE_PREFIX = { remove: "-", add: "+", context: " " } as const;

function InlineDiff({ text }: { text: string }) {
  return (
    <pre className="diff-body">
      {parseUnified(text).map((hunk) => (
        <div key={hunk.header}>
          <div className="diff-line diff-line-hunk">{hunk.header}</div>
          {inlineCells(hunk.rows).map((cell, i) => (
            <div key={i} className={`diff-line diff-line-${cell.kind}`}>
              {INLINE_PREFIX[cell.kind]}
              <CellText cell={cell} />
            </div>
          ))}
        </div>
      ))}
    </pre>
  );
}

/** Line text with the intra-line changed parts highlighted, when known. */
function CellText({ cell }: { cell: SplitCell }) {
  if (!cell.segments) return <>{cell.text}</>;
  return (
    <>
      {cell.segments.map((s, i) =>
        s.changed ? (
          <mark key={i} className="intra" data-testid="intra">
            {s.text}
          </mark>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </>
  );
}

function SplitDiff({ text }: { text: string }) {
  return (
    <div className="diff-body diff-split">
      {parseUnified(text).map((hunk) => (
        <div key={hunk.header}>
          <div className="diff-line diff-line-hunk">{hunk.header}</div>
          {hunk.rows.map((row, i) => (
            <div key={i} className="split-row">
              <SplitSide cell={row.left} />
              <SplitSide cell={row.right} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function SplitSide({ cell }: { cell: SplitCell | undefined }) {
  if (!cell) {
    return <div className="split-cell split-cell-empty" />;
  }
  return (
    <div className={`split-cell split-cell-${cell.kind}`}>
      <span className="split-no">{cell.no}</span>
      <span className="split-text">
        <CellText cell={cell} />
      </span>
    </div>
  );
}
