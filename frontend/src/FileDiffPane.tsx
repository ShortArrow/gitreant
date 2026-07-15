import { useEffect, useMemo, useState } from "react";
import type { FileDiff } from "./api";
import { InlineIcon, LineMenuIcon, SplitIcon } from "./Icons";
import { LabeledButton } from "./LabeledButton";
import { useT } from "./settings";
import {
  inlineCells,
  parseUnified,
  permalinkFragment,
  selectedLines,
  type DiffHunk,
  type DiffSide,
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

/** A run of display lines selected via the line-number gutter of one file.
 * In the split view the selection belongs to one side: the old side is the
 * parent commit's file, the new side this commit's. */
interface Selection {
  path: string;
  side: DiffSide;
  from: number;
  to: number;
}

/** Unified diffs of one or all changed files, shown in place of the graph. */
export function FileDiffPane({
  files,
  error,
  commitId,
  parentId,
  githubUrl,
  onClose,
}: {
  /** null while loading; one entry per shown file. */
  files: FileDiff[] | null;
  error: string | null;
  /** The commit the diffs belong to; new-side permalinks address it. */
  commitId: string;
  /** Its first parent; old-side permalinks address it. */
  parentId?: string;
  /** Web URL of the repository on GitHub, when it has such a remote. */
  githubUrl?: string;
  onClose: () => void;
}) {
  const t = useT();
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

  const selectLine = (
    path: string,
    side: DiffSide,
    index: number,
    extend: boolean,
  ) => {
    setSelection((prev) =>
      extend && prev && prev.path === path && prev.side === side
        ? {
            path,
            side,
            from: Math.min(prev.from, index),
            to: Math.max(prev.to, index),
          }
        : { path, side, from: index, to: index },
    );
  };

  useEffect(() => {
    const clear = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelection(null);
    };
    window.addEventListener("keydown", clear);
    return () => window.removeEventListener("keydown", clear);
  }, []);

  return (
    <div className="diff-pane" data-testid="diff-pane">
      <header className="diff-head">
        <span className="diff-title">
          {files && files.length === 1 && files[0].path}
          {files && files.length > 1 && `${files.length} files`}
        </span>
        <div className="files-view">
          <LabeledButton
            icon={<InlineIcon />}
            label={t("inline")}
            testId="diff-view-inline"
            active={view === "inline"}
            onClick={() => changeView("inline")}
          />
          <LabeledButton
            icon={<SplitIcon />}
            label={t("split")}
            testId="diff-view-split"
            active={view === "split"}
            onClick={() => changeView("split")}
          />
        </div>
        <button
          className="icon-btn"
          title={t("closeDiff")}
          data-testid="diff-close"
          onClick={onClose}
          type="button"
        >
          ×
        </button>
      </header>

      <div className="diff-scroll">
        {error && <p className="detail-error">{error}</p>}
        {!error && !files && <p className="detail-loading">{t("loading")}</p>}
        {files?.map((diff) => (
          <FileSection
            key={diff.path}
            diff={diff}
            view={view}
            selection={selection?.path === diff.path ? selection : null}
            commitId={commitId}
            parentId={parentId}
            githubUrl={githubUrl}
            onSelectLine={selectLine}
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
  parentId,
  githubUrl,
  onSelectLine,
}: {
  diff: FileDiff;
  view: DiffView;
  selection: Selection | null;
  commitId: string;
  parentId?: string;
  githubUrl?: string;
  onSelectLine: (
    path: string,
    side: DiffSide,
    index: number,
    extend: boolean,
  ) => void;
}) {
  const t = useT();
  const hunks = useMemo(() => parseUnified(diff.text), [diff.text]);
  // The selected side's display lines; selection indices point into rows
  // (split) or the flattened inline cells.
  const selectedCells: (SplitCell | undefined)[] = useMemo(() => {
    if (!selection) return [];
    if (view === "inline") {
      return hunks
        .flatMap((h) => inlineCells(h.rows))
        .slice(selection.from, selection.to + 1);
    }
    return hunks
      .flatMap((h) => h.rows)
      .slice(selection.from, selection.to + 1)
      .map((r) => (selection.side === "new" ? r.right : r.left));
  }, [hunks, view, selection]);

  const isSelected = (index: number, side: DiffSide) =>
    selection !== null &&
    selection.side === side &&
    index >= selection.from &&
    index <= selection.to;
  const handleSelect = (side: DiffSide, index: number, extend: boolean) =>
    onSelectLine(diff.path, side, index, extend);

  // GitHub-style: the dropdown trigger replaces the first selected line's
  // number on the selected side. Keying by the range remounts (and closes)
  // the menu on any change.
  const anchor = selection ? (
    <LineMenu
      key={`${selection.side}-${selection.from}-${selection.to}`}
      selectedCells={selectedCells}
      side={selection.side}
      path={diff.path}
      commitId={selection.side === "new" ? commitId : parentId}
      githubUrl={githubUrl}
    />
  ) : null;
  const anchorIndex = selection?.from ?? -1;
  const anchorSide = selection?.side ?? "new";

  return (
    <section className="diff-file-section" data-testid="diff-file-section">
      <div className="diff-file-head">
        <span className={`file-status file-status-${diff.status}`}>
          {diff.status}
        </span>
        <span className="diff-path">{diff.path}</span>
      </div>
      {diff.binary ? (
        <p className="diff-binary">{t("binaryFile")}</p>
      ) : view === "inline" ? (
        <InlineDiff
          hunks={hunks}
          isSelected={(i) => isSelected(i, "new")}
          onSelect={(i, extend) => handleSelect("new", i, extend)}
          anchorIndex={anchorIndex}
          anchor={anchor}
        />
      ) : (
        <SplitDiff
          hunks={hunks}
          isSelected={isSelected}
          onSelect={handleSelect}
          anchorIndex={anchorIndex}
          anchorSide={anchorSide}
          anchor={anchor}
        />
      )}
    </section>
  );
}

/** Dropdown on the first selected line: actions on the current selection. */
function LineMenu({
  selectedCells,
  side,
  path,
  commitId,
  githubUrl,
}: {
  selectedCells: (SplitCell | undefined)[];
  side: DiffSide;
  path: string;
  /** The commit this side's permalink addresses; absent for a root commit's
   * old side. */
  commitId?: string;
  githubUrl?: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  const fragment = permalinkFragment(selectedCells, side);
  const permalink =
    githubUrl && commitId && fragment
      ? `${githubUrl}/blob/${commitId}/${path}${fragment}`
      : null;
  const copy = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setOpen(false);
  };

  return (
    <span className="line-menu-wrap" onMouseDown={(e) => e.stopPropagation()}>
      <button
        className="line-menu-trigger"
        data-testid="line-menu-trigger"
        title={t("selectionActions")}
        type="button"
        onClick={() => setOpen((o) => !o)}
      >
        <LineMenuIcon />
      </button>
      {open && (
        <div className="ctx-menu line-menu" data-testid="line-menu">
          <span className="ctx-menu-note">
            {t(
              selectedCells.length === 1 ? "lineSelected" : "linesSelected",
              { n: selectedCells.length },
            )}
          </span>
          <button
            type="button"
            data-testid="copy-lines"
            onClick={() => copy(selectedLines(selectedCells))}
          >
            {t("copyLines")}
          </button>
          <button
            type="button"
            data-testid="copy-permalink"
            disabled={!permalink}
            title={
              permalink ??
              (githubUrl ? t("noPermalinkSide") : t("noGithubRemote"))
            }
            onClick={() => permalink && copy(permalink)}
          >
            {t("copyPermalink")}
          </button>
        </div>
      )}
    </span>
  );
}

const INLINE_PREFIX = { remove: "-", add: "+", context: " " } as const;

function InlineDiff({
  hunks,
  isSelected,
  onSelect,
  anchorIndex,
  anchor,
}: {
  hunks: DiffHunk[];
  isSelected: (index: number) => boolean;
  onSelect: (index: number, extend: boolean) => void;
  /** Display index carrying the selection dropdown (-1 for none). */
  anchorIndex: number;
  anchor: React.ReactNode;
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
                {offset + i === anchorIndex ? (
                  anchor
                ) : (
                  <LineNo
                    no={cell.no}
                    onClick={(extend) => onSelect(offset + i, extend)}
                  />
                )}
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
  anchorIndex,
  anchorSide,
  anchor,
}: {
  hunks: DiffHunk[];
  isSelected: (index: number, side: DiffSide) => boolean;
  onSelect: (side: DiffSide, index: number, extend: boolean) => void;
  /** Display index and side carrying the selection dropdown (-1 for none). */
  anchorIndex: number;
  anchorSide: DiffSide;
  anchor: React.ReactNode;
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
              <div key={i} className="split-row">
                <SplitSide
                  cell={row.left}
                  selected={isSelected(offset + i, "old")}
                  anchor={
                    offset + i === anchorIndex && anchorSide === "old"
                      ? anchor
                      : null
                  }
                  onSelect={(extend) => onSelect("old", offset + i, extend)}
                />
                <SplitSide
                  cell={row.right}
                  selected={isSelected(offset + i, "new")}
                  anchor={
                    offset + i === anchorIndex && anchorSide === "new"
                      ? anchor
                      : null
                  }
                  onSelect={(extend) => onSelect("new", offset + i, extend)}
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
  selected,
  anchor,
  onSelect,
}: {
  cell: SplitCell | undefined;
  selected: boolean;
  anchor: React.ReactNode;
  onSelect: (extend: boolean) => void;
}) {
  if (!cell) {
    return <div className="split-cell split-cell-empty" />;
  }
  return (
    <div
      className={`split-cell split-cell-${cell.kind}${
        selected ? " line-selected" : ""
      }`}
    >
      {anchor ?? <LineNo no={cell.no} onClick={onSelect} />}
      <span className="split-text">
        <CellText cell={cell} />
      </span>
    </div>
  );
}
