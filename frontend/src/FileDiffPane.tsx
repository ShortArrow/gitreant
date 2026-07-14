import { useMemo, useState } from "react";
import type { FileDiff } from "./api";
import {
  inlineCells,
  parseUnified,
  permalinkFragment,
  selectedLines,
  type DiffHunk,
  type SplitCell,
} from "./diffModel";

type DiffView = "inline" | "split";

const DIFF_VIEW_KEY = "gitreant-diff-view";

function storedDiffView(): DiffView {
  try {
    return localStorage.getItem(DIFF_VIEW_KEY) === "split" ? "split" : "inline";
  } catch {
    return "inline";
  }
}

/** A run of display lines selected via the line-number gutter of one file. */
interface Selection {
  path: string;
  from: number;
  to: number;
}

/** Unified diffs of one or all changed files, shown in place of the graph. */
export function FileDiffPane({
  files,
  error,
  commitId,
  githubUrl,
  onClose,
}: {
  /** null while loading; one entry per shown file. */
  files: FileDiff[] | null;
  error: string | null;
  /** The commit the diffs belong to; permalinks address the file at it. */
  commitId: string;
  /** Web URL of the repository on GitHub, when it has such a remote. */
  githubUrl?: string;
  onClose: () => void;
}) {
  const [view, setView] = useState<DiffView>(storedDiffView);
  const [selection, setSelection] = useState<Selection | null>(null);
  const changeView = (next: DiffView) => {
    setView(next);
    // Indices are view-specific, so a stale selection cannot survive.
    setSelection(null);
    try {
      localStorage.setItem(DIFF_VIEW_KEY, next);
    } catch {
      // localStorage may be unavailable; the state change alone is enough.
    }
  };

  const selectLine = (path: string, index: number, extend: boolean) => {
    setSelection((prev) =>
      extend && prev && prev.path === path
        ? {
            path,
            from: Math.min(prev.from, index),
            to: Math.max(prev.to, index),
          }
        : { path, from: index, to: index },
    );
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
          <FileSection
            key={diff.path}
            diff={diff}
            view={view}
            selection={selection?.path === diff.path ? selection : null}
            commitId={commitId}
            githubUrl={githubUrl}
            onSelectLine={selectLine}
            onClearSelection={() => setSelection(null)}
          />
        ))}
      </div>
    </div>
  );
}

function FileSection({
  diff,
  view,
  selection,
  commitId,
  githubUrl,
  onSelectLine,
  onClearSelection,
}: {
  diff: FileDiff;
  view: DiffView;
  selection: Selection | null;
  commitId: string;
  githubUrl?: string;
  onSelectLine: (path: string, index: number, extend: boolean) => void;
  onClearSelection: () => void;
}) {
  const hunks = useMemo(() => parseUnified(diff.text), [diff.text]);
  // The display lines in order; selection indices point into this list.
  const cells = useMemo(
    () =>
      view === "inline"
        ? hunks.flatMap((h) => inlineCells(h.rows))
        : hunks.flatMap((h) => h.rows.map((r) => (r.right ?? r.left)!)),
    [hunks, view],
  );
  const selectedCells = selection
    ? cells.slice(selection.from, selection.to + 1)
    : [];
  const isSelected = (index: number) =>
    selection !== null && index >= selection.from && index <= selection.to;
  const handleSelect = (index: number, extend: boolean) =>
    onSelectLine(diff.path, index, extend);

  return (
    <section className="diff-file-section" data-testid="diff-file-section">
      <div className="diff-file-head">
        <span className={`file-status file-status-${diff.status}`}>
          {diff.status}
        </span>
        <span className="diff-path">{diff.path}</span>
        {selection && (
          <SelectionActions
            selectedCells={selectedCells}
            path={diff.path}
            commitId={commitId}
            githubUrl={githubUrl}
            onClear={onClearSelection}
          />
        )}
      </div>
      {diff.binary ? (
        <p className="diff-binary">Binary file — no text diff.</p>
      ) : view === "inline" ? (
        <InlineDiff hunks={hunks} isSelected={isSelected} onSelect={handleSelect} />
      ) : (
        <SplitDiff hunks={hunks} isSelected={isSelected} onSelect={handleSelect} />
      )}
    </section>
  );
}

/** Actions on the current gutter selection, shown next to the file name. */
function SelectionActions({
  selectedCells,
  path,
  commitId,
  githubUrl,
  onClear,
}: {
  selectedCells: SplitCell[];
  path: string;
  commitId: string;
  githubUrl?: string;
  onClear: () => void;
}) {
  const fragment = permalinkFragment(selectedCells);
  const permalink =
    githubUrl && fragment
      ? `${githubUrl}/blob/${commitId}/${path}${fragment}`
      : null;
  const copy = (text: string) =>
    navigator.clipboard.writeText(text).catch(() => {});

  return (
    <span className="diff-select-bar" data-testid="diff-select-bar">
      <span className="diff-select-count">
        {selectedCells.length} line{selectedCells.length === 1 ? "" : "s"}
      </span>
      <button
        type="button"
        data-testid="copy-lines"
        onClick={() => copy(selectedLines(selectedCells))}
      >
        Copy lines
      </button>
      <button
        type="button"
        data-testid="copy-permalink"
        disabled={!permalink}
        title={
          permalink ??
          (githubUrl
            ? "Removed lines have no permalink on the new side"
            : "No GitHub remote")
        }
        onClick={() => permalink && copy(permalink)}
      >
        Copy permalink
      </button>
      <button
        type="button"
        data-testid="clear-selection"
        title="Clear selection"
        onClick={onClear}
      >
        ×
      </button>
    </span>
  );
}

const INLINE_PREFIX = { remove: "-", add: "+", context: " " } as const;

function InlineDiff({
  hunks,
  isSelected,
  onSelect,
}: {
  hunks: DiffHunk[];
  isSelected: (index: number) => boolean;
  onSelect: (index: number, extend: boolean) => void;
}) {
  let base = 0;
  return (
    <pre className="diff-body">
      {hunks.map((hunk) => {
        const cells = inlineCells(hunk.rows);
        const offset = base;
        base += cells.length;
        return (
          <div key={hunk.header}>
            <div className="diff-line diff-line-hunk">{hunk.header}</div>
            {cells.map((cell, i) => (
              <div
                key={i}
                className={`diff-line diff-line-${cell.kind}${
                  isSelected(offset + i) ? " line-selected" : ""
                }`}
              >
                <LineNo
                  no={cell.no}
                  onClick={(extend) => onSelect(offset + i, extend)}
                />
                {INLINE_PREFIX[cell.kind]}
                <CellText cell={cell} />
              </div>
            ))}
          </div>
        );
      })}
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

/** Clickable line number; click selects, shift+click extends the selection. */
function LineNo({
  no,
  onClick,
}: {
  no: number;
  onClick: (extend: boolean) => void;
}) {
  return (
    <button
      className="line-no"
      data-testid="line-no"
      type="button"
      onClick={(e) => onClick(e.shiftKey)}
    >
      {no}
    </button>
  );
}

function SplitDiff({
  hunks,
  isSelected,
  onSelect,
}: {
  hunks: DiffHunk[];
  isSelected: (index: number) => boolean;
  onSelect: (index: number, extend: boolean) => void;
}) {
  let base = 0;
  return (
    <div className="diff-body diff-split">
      {hunks.map((hunk) => {
        const offset = base;
        base += hunk.rows.length;
        return (
          <div key={hunk.header}>
            <div className="diff-line diff-line-hunk">{hunk.header}</div>
            {hunk.rows.map((row, i) => (
              <div
                key={i}
                className={`split-row${
                  isSelected(offset + i) ? " line-selected" : ""
                }`}
              >
                <SplitSide
                  cell={row.left}
                  onSelect={(extend) => onSelect(offset + i, extend)}
                />
                <SplitSide
                  cell={row.right}
                  onSelect={(extend) => onSelect(offset + i, extend)}
                />
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function SplitSide({
  cell,
  onSelect,
}: {
  cell: SplitCell | undefined;
  onSelect: (extend: boolean) => void;
}) {
  if (!cell) {
    return <div className="split-cell split-cell-empty" />;
  }
  return (
    <div className={`split-cell split-cell-${cell.kind}`}>
      <LineNo no={cell.no} onClick={onSelect} />
      <span className="split-text">
        <CellText cell={cell} />
      </span>
    </div>
  );
}
