import { useEffect, useMemo, useState } from "react";
import type { FileDiff } from "./api";
import { absolutePath } from "./CommitDetailPanel";
import {
  CopyIcon,
  InlineIcon,
  LineMenuIcon,
  ShowAboveIcon,
  ShowBelowIcon,
  SplitIcon,
  WholeFileIcon,
} from "./Icons";
import { LabeledButton } from "./LabeledButton";
import { countKey } from "./i18n";
import { useT } from "./settings";
import { keyboardTaken } from "./keyboard";
import { shortId } from "./graph";
import {
  diffBlocks,
  eolChange,
  inlineCells,
  markdownLink,
  parseUnified,
  permalinkFragment,
  selectedLines,
  typstLink,
  type DiffBlock,
  type GapOpening,
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
  range,
  githubUrl,
  repoPath,
  loadFile,
  onClose,
}: {
  /** null while loading; one entry per shown file. */
  files: FileDiff[] | null;
  error: string | null;
  /** The commit the diffs belong to; new-side permalinks address it.
   * Absent for the working tree, which no permalink can name. */
  commitId?: string;
  /** Its first parent; old-side permalinks address it. */
  parentId?: string;
  /** Two compared commits, named in the header as `base..target`; the
   * permalinks then use `base` for the old side and `target` for the new. */
  range?: { base: string; target: string };
  /** Web URL of the repository on GitHub, when it has such a remote. */
  githubUrl?: string;
  /** The repository's directory, which absolute paths start from. */
  repoPath: string;
  /** A file's text on the side the diffs lead to, for the unchanged lines
   * around them; null when it cannot be read. */
  loadFile?: (path: string) => Promise<string | null>;
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

  // Esc clears a line selection first, then closes the pane (ADR 0035);
  // an open menu or dialog takes it instead.
  useEffect(() => {
    const onEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || keyboardTaken()) return;
      if (selection) setSelection(null);
      else onClose();
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [selection, onClose]);

  return (
    <div className="diff-pane" data-testid="diff-pane">
      <header className="diff-head">
        <span className="diff-title">
          {range && (
            <code className="diff-range" data-testid="diff-range">
              {shortId(range.base)}..{shortId(range.target)}
            </code>
          )}
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
            repoPath={repoPath}
            loadFile={loadFile}
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
  parentId,
  githubUrl,
  repoPath,
  loadFile,
  onSelectLine,
  onClearSelection,
}: {
  diff: FileDiff;
  view: DiffView;
  selection: Selection | null;
  commitId?: string;
  parentId?: string;
  githubUrl?: string;
  repoPath: string;
  loadFile?: (path: string) => Promise<string | null>;
  onSelectLine: (
    path: string,
    side: DiffSide,
    index: number,
    extend: boolean,
  ) => void;
  onClearSelection: () => void;
}) {
  const t = useT();
  const hunks = useMemo(() => parseUnified(diff.text), [diff.text]);
  const conversion = useMemo(() => eolChange(hunks), [hunks]);
  const [opened, setOpened] = useState<GapOpening[]>([]);
  const [content, setContent] = useState<string[] | "unreadable" | null>(
    diff.status === "A" || diff.status === "D" ? [] : null,
  );
  const lines = Array.isArray(content) ? content : null;
  const blocks = useMemo(
    () => diffBlocks(hunks, lines, opened, lines?.length ?? diff.lines ?? null),
    [hunks, lines, opened, diff.lines],
  );
  const rows = useMemo(
    () => blocks.flatMap((b) => (b.kind === "rows" ? b.rows : [])),
    [blocks],
  );
  const readLines = async (): Promise<string[] | null> => {
    if (lines) return lines;
    const text = loadFile ? await loadFile(diff.path).catch(() => null) : null;
    if (text === null) {
      setContent("unreadable");
      return null;
    }
    const read = fileLines(text);
    setContent(read);
    return read;
  };
  const openGaps = async (open: (gaps: GapOpening[]) => GapOpening[]) => {
    if (!(await readLines())) return;
    onClearSelection();
    setOpened(open);
  };
  const openGap = (gap: number, more: Partial<GapOpening>) =>
    openGaps((prev) => {
      const next = [...prev];
      const now = prev[gap] ?? { up: 0, down: 0 };
      next[gap] = {
        up: now.up + (more.up ?? 0),
        down: now.down + (more.down ?? 0),
      };
      return next;
    });
  const openAll = () =>
    openGaps(() =>
      Array.from({ length: hunks.length + 1 }, () => ({
        up: 0,
        down: Infinity,
      })),
    );
  const hasGaps = blocks.some((b) => b.kind === "gap");
  const gapRow = (block: Gap) => (
    <GapRow
      key={`gap-${block.gap}`}
      block={block}
      first={block.gap === 0}
      last={block.gap === hunks.length}
      unreadable={content === "unreadable"}
      onOpen={(more) => void openGap(block.gap, more)}
    />
  );
  // The selected side's display lines; selection indices point into rows
  // (split) or the flattened inline cells.
  const selectedCells: (SplitCell | undefined)[] = useMemo(() => {
    if (!selection) return [];
    if (view === "inline") {
      return inlineCells(rows).slice(selection.from, selection.to + 1);
    }
    return rows
      .slice(selection.from, selection.to + 1)
      .map((r) => (selection.side === "new" ? r.right : r.left));
  }, [rows, view, selection]);

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
      repoPath={repoPath}
    />
  ) : null;
  const anchorIndex = selection?.from ?? -1;
  const anchorSide = selection?.side ?? "new";

  return (
    <section
      className="diff-file-section"
      data-testid="diff-file-section"
      data-diff-path={diff.path}
    >
      <div className="diff-file-head">
        <span className={`file-status file-status-${diff.status}`}>
          {diff.status}
        </span>
        <span className="diff-path">{diff.path}</span>
        <button
          type="button"
          className="icon-btn diff-copy-path"
          data-testid="diff-copy-path"
          title={t("copyRelativePath")}
          aria-label={t("copyRelativePath")}
          onClick={() =>
            navigator.clipboard.writeText(diff.path).catch(() => {})
          }
        >
          <CopyIcon />
        </button>
        {conversion && (
          <span className="diff-eol" data-testid="diff-eol">
            {t("eolConversion", conversion)}
          </span>
        )}
        {!diff.binary && hasGaps && content !== "unreadable" && (
          <LabeledButton
            icon={<WholeFileIcon />}
            label={t("wholeFile")}
            testId="diff-whole-file"
            className="diff-whole-file"
            onClick={() => void openAll()}
          />
        )}
      </div>
      {diff.binary ? (
        <p className="diff-binary">{t("binaryFile")}</p>
      ) : view === "inline" ? (
        <InlineDiff
          blocks={blocks}
          gapRow={gapRow}
          isSelected={(i) => isSelected(i, "new")}
          onSelect={(i, extend) => handleSelect("new", i, extend)}
          anchorIndex={anchorIndex}
          anchor={anchor}
        />
      ) : (
        <SplitDiff
          blocks={blocks}
          gapRow={gapRow}
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

/** A diff's gap of hidden unchanged lines. */
type Gap = Extract<DiffBlock, { kind: "gap" }>;

/** How many unchanged lines one press of a gap's button shows. */
const GAP_STEP = 20;

/** A file's text as its lines, the line endings dropped. */
function fileLines(text: string): string[] {
  return text
    .replace(/\r?\n$/, "")
    .split("\n")
    .map((line) => line.replace(/\r$/, ""));
}

/** Where unchanged lines are hidden (ADR 0061): buttons to show them down
 * from the hunk above, up from the hunk below, or all at once when few
 * remain, beside the next hunk's header. */
function GapRow({
  block,
  first,
  last,
  unreadable,
  onOpen,
}: {
  block: Gap;
  first: boolean;
  last: boolean;
  unreadable: boolean;
  onOpen: (more: Partial<GapOpening>) => void;
}) {
  const t = useT();
  const few = block.hidden !== null && block.hidden <= GAP_STEP;
  return (
    <div className="diff-line diff-line-hunk diff-gap" data-testid="diff-gap">
      {unreadable ? (
        <span className="diff-gap-note">{t("contextUnreadable")}</span>
      ) : few ? (
        <LabeledButton
          icon={<WholeFileIcon />}
          label={t(countKey("showHiddenLines", block.hidden!), {
            n: block.hidden!,
          })}
          testId="gap-all"
          className="diff-gap-btn"
          onClick={() => onOpen({ down: block.hidden! })}
        />
      ) : (
        <>
          {!first && (
            <LabeledButton
              icon={<ShowBelowIcon />}
              label={t("showLinesBelow", { n: GAP_STEP })}
              testId="gap-down"
              className="diff-gap-btn"
              onClick={() => onOpen({ down: GAP_STEP })}
            />
          )}
          {!last && (
            <LabeledButton
              icon={<ShowAboveIcon />}
              label={t("showLinesAbove", { n: GAP_STEP })}
              testId="gap-up"
              className="diff-gap-btn"
              onClick={() => onOpen({ up: GAP_STEP })}
            />
          )}
        </>
      )}
      {!unreadable && !few && block.hidden !== null && (
        <span className="diff-gap-count">
          {t(countKey("hiddenLines", block.hidden), { n: block.hidden })}
        </span>
      )}
      <span className="diff-gap-header">{block.header}</span>
    </div>
  );
}

/** Dropdown on the first selected line: actions on the current selection. */
function LineMenu({
  selectedCells,
  side,
  path,
  commitId,
  githubUrl,
  repoPath,
}: {
  selectedCells: (SplitCell | undefined)[];
  side: DiffSide;
  path: string;
  /** The commit this side's permalink addresses; absent for a root commit's
   * old side. */
  commitId?: string;
  githubUrl?: string;
  repoPath: string;
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
            {t(countKey("linesSelected", selectedCells.length), {
              n: selectedCells.length,
            })}
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
          <button
            type="button"
            data-testid="copy-permalink-markdown"
            disabled={!permalink}
            onClick={() =>
              permalink && copy(markdownLink(permalink, `${path}${fragment}`))
            }
          >
            {t("copyPermalinkMarkdown")}
          </button>
          <button
            type="button"
            data-testid="copy-permalink-typst"
            disabled={!permalink}
            onClick={() =>
              permalink && copy(typstLink(permalink, `${path}${fragment}`))
            }
          >
            {t("copyPermalinkTypst")}
          </button>
          <button
            type="button"
            data-testid="copy-file-path"
            onClick={() => copy(path)}
          >
            {t("copyRelativePath")}
          </button>
          <button
            type="button"
            data-testid="copy-file-absolute-path"
            onClick={() => copy(absolutePath(repoPath, path))}
          >
            {t("copyAbsolutePath")}
          </button>
        </div>
      )}
    </span>
  );
}

const INLINE_PREFIX = { remove: "-", add: "+", context: " " } as const;

function InlineDiff({
  blocks,
  gapRow,
  isSelected,
  onSelect,
  anchorIndex,
  anchor,
}: {
  blocks: DiffBlock[];
  gapRow: (block: Gap) => React.ReactNode;
  isSelected: (index: number) => boolean;
  onSelect: (index: number, extend: boolean) => void;
  /** Display index carrying the selection dropdown (-1 for none). */
  anchorIndex: number;
  anchor: React.ReactNode;
}) {
  let base = 0;
  return (
    <pre className="diff-body">
      {blocks.map((block, b) => {
        if (block.kind === "gap") return gapRow(block);
        const cells = inlineCells(block.rows);
        const offset = base;
        base += cells.length;
        return (
          <div key={`rows-${b}`}>
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

/** Line text with the intra-line changed parts highlighted, when known,
 * and the line ending drawn when it is what changed. */
function CellText({ cell }: { cell: SplitCell }) {
  const t = useT();
  return (
    <>
      {cell.segments
        ? cell.segments.map((s, i) =>
            s.changed ? (
              <mark key={i} className="intra" data-testid="intra">
                {s.text}
              </mark>
            ) : (
              <span key={i}>{s.text}</span>
            ),
          )
        : cell.text}
      {cell.eol && (
        <mark
          className="intra eol-mark"
          data-testid="eol-mark"
          title={t("eolMark", { eol: cell.eol })}
        >
          {cell.eol === "CRLF" ? "␍␊" : "␊"}
        </mark>
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
  blocks,
  gapRow,
  isSelected,
  onSelect,
  anchorIndex,
  anchorSide,
  anchor,
}: {
  blocks: DiffBlock[];
  gapRow: (block: Gap) => React.ReactNode;
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
      {blocks.map((block, b) => {
        if (block.kind === "gap") return gapRow(block);
        const offset = base;
        base += block.rows.length;
        return (
          <div key={`rows-${b}`}>
            {block.rows.map((row, i) => (
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
