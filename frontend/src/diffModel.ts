/** Parse unified-diff text into rows a side-by-side (split) view can render.
 *
 * The hunk headers carry both sides' line numbers, so the split layout can be
 * derived entirely from the text `POST /api/diff` already returns: inside a
 * hunk, a run of removals is paired row-by-row with the following run of
 * additions; the unpaired remainder gets an empty opposite cell.
 */

export type CellKind = "context" | "add" | "remove";

/** A piece of a line; `changed` marks the part that differs from the pair. */
export interface Segment {
  text: string;
  changed: boolean;
}

/** A line ending, named the way editors name them. */
export type LineEnding = "LF" | "CRLF";

export interface SplitCell {
  /** 1-based line number on this side. Never includes a line ending. */
  no: number;
  text: string;
  kind: CellKind;
  /** Intra-line diff against the paired line, when one exists. */
  segments?: Segment[];
  /** This line's ending, set only when it differs from the paired line's:
   * the change a line-ending conversion makes, invisible in the text. */
  eol?: LineEnding;
}

/** A removed or added line before pairing: its text without the CR git
 * leaves on a CRLF line, and whether that CR was there. */
type RunCell = SplitCell & { cr: boolean };

/** Split a removed/added line pair around their common prefix and suffix.
 *
 * Returns null when the lines share nothing at either end — a whole-line
 * change carries no intra-line information worth highlighting.
 */
export function intralineSegments(
  oldLine: string,
  newLine: string,
): { old: Segment[]; new: Segment[] } | null {
  let prefix = 0;
  const maxPrefix = Math.min(oldLine.length, newLine.length);
  while (prefix < maxPrefix && oldLine[prefix] === newLine[prefix]) prefix++;

  let suffix = 0;
  const maxSuffix = maxPrefix - prefix;
  while (
    suffix < maxSuffix &&
    oldLine[oldLine.length - 1 - suffix] === newLine[newLine.length - 1 - suffix]
  ) {
    suffix++;
  }

  if (prefix === 0 && suffix === 0) return null;

  const segments = (line: string): Segment[] => {
    const parts: Segment[] = [];
    if (prefix > 0) parts.push({ text: line.slice(0, prefix), changed: false });
    const middle = line.slice(prefix, line.length - suffix);
    if (middle) parts.push({ text: middle, changed: true });
    if (suffix > 0) parts.push({ text: line.slice(line.length - suffix), changed: false });
    return parts;
  };

  return { old: segments(oldLine), new: segments(newLine) };
}

export interface SplitRow {
  left?: SplitCell;
  right?: SplitCell;
}

export interface DiffHunk {
  header: string;
  rows: SplitRow[];
  /** The `@@ -start,count +start,count @@` numbers of the header; a count
   * of 0 places the hunk after its start line. */
  old: { start: number; count: number };
  new: { start: number; count: number };
}

/** Flatten split rows back into unified order (removals, additions, context).
 *
 * `parseUnified` emits each remove/add run as contiguous rows, so grouping
 * consecutive non-context rows reconstructs the original line order while
 * keeping the intra-line segments computed during pairing.
 */
export function inlineCells(rows: SplitRow[]): SplitCell[] {
  const cells: SplitCell[] = [];
  let removes: SplitCell[] = [];
  let adds: SplitCell[] = [];

  const flush = () => {
    cells.push(...removes, ...adds);
    removes = [];
    adds = [];
  };

  for (const row of rows) {
    if (row.right?.kind === "context") {
      // Context lines exist on both sides; show the new-side number so
      // selections and permalinks address the file at this commit.
      flush();
      cells.push(row.right);
    } else {
      if (row.left) removes.push(row.left);
      if (row.right) adds.push(row.right);
    }
  }
  flush();
  return cells;
}

/** Which version of the file a split-view selection addresses. */
export type DiffSide = "old" | "new";

/** The text of a selected run of lines, ready for the clipboard. Rows that
 * do not exist on the chosen side are skipped. */
export function selectedLines(cells: (SplitCell | undefined)[]): string {
  return cells
    .filter((c): c is SplitCell => c !== undefined)
    .map((c) => c.text)
    .join("\n");
}

/** GitHub-style line fragment ("#L3" / "#L3-L5") for a selected run.
 *
 * A permalink addresses the file at one commit, so every selected line must
 * exist on that side: removals are absent from the new side, additions from
 * the old one, and side-less rows from both.
 */
export function permalinkFragment(
  cells: (SplitCell | undefined)[],
  side: DiffSide = "new",
): string | null {
  const absent = side === "new" ? "remove" : "add";
  if (cells.length === 0 || cells.some((c) => !c || c.kind === absent)) {
    return null;
  }
  const start = cells[0]!.no;
  const end = cells[cells.length - 1]!.no;
  return end > start ? `#L${start}-L${end}` : `#L${start}`;
}

/** `url` as a Markdown link reading `label`, its brackets escaped. */
export function markdownLink(url: string, label: string): string {
  return `[${label.replace(/[\\[\]]/g, "\\$&")}](${url})`;
}

/** `url` as a Typst link reading `label`: the label escaped where Typst
 * markup would read it, the URL where a string would end. */
export function typstLink(url: string, label: string): string {
  const content = label.replace(/[\\#*_`$<>@[\]~]/g, "\\$&");
  return `#link("${url.replace(/["\\]/g, "\\$&")}")[${content}]`;
}

/** How many lines a unified diff adds and removes, counting only lines
 * inside its hunks. */
export function diffCounts(text: string): {
  additions: number;
  deletions: number;
} {
  let additions = 0;
  let deletions = 0;
  let inHunk = false;
  for (const line of text.split("\n")) {
    if (line.startsWith("@@")) inHunk = true;
    else if (!inHunk) continue;
    else if (line.startsWith("+")) additions++;
    else if (line.startsWith("-")) deletions++;
  }
  return { additions, deletions };
}

export function parseUnified(text: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  let current: DiffHunk | null = null;
  let oldNo = 0;
  let newNo = 0;
  let removes: RunCell[] = [];
  let adds: RunCell[] = [];

  const settle = ({ cr: _cr, ...cell }: RunCell): SplitCell => cell;
  const flushRun = () => {
    const count = Math.max(removes.length, adds.length);
    for (let i = 0; i < count; i++) {
      const left = removes[i];
      const right = adds[i];
      if (left && right) {
        const pair = intralineSegments(left.text, right.text);
        if (pair) {
          left.segments = pair.old;
          right.segments = pair.new;
        }
        if (left.cr !== right.cr) {
          left.eol = left.cr ? "CRLF" : "LF";
          right.eol = right.cr ? "CRLF" : "LF";
        }
      }
      current?.rows.push({
        left: left && settle(left),
        right: right && settle(right),
      });
    }
    removes = [];
    adds = [];
  };
  const clean = (line: string) => {
    const text = line.slice(1);
    const cr = text.endsWith("\r");
    return { text: cr ? text.slice(0, -1) : text, cr };
  };

  for (const line of text.replace(/\n$/, "").split("\n")) {
    const header = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (header) {
      flushRun();
      oldNo = Number(header[1]);
      newNo = Number(header[3]);
      current = {
        header: line,
        rows: [],
        old: { start: oldNo, count: Number(header[2] ?? 1) },
        new: { start: newNo, count: Number(header[4] ?? 1) },
      };
      hunks.push(current);
      continue;
    }
    if (!current) continue;
    if (line.startsWith("-")) {
      removes.push({ no: oldNo++, kind: "remove", ...clean(line) });
    } else if (line.startsWith("+")) {
      adds.push({ no: newNo++, kind: "add", ...clean(line) });
    } else {
      flushRun();
      const { text } = clean(line);
      current.rows.push({
        left: { no: oldNo++, text, kind: "context" },
        right: { no: newNo++, text, kind: "context" },
      });
    }
  }
  flushRun();
  return hunks;
}

/** How far a gap of unchanged lines is open: `down` lines below the hunk
 * above it, `up` lines above the hunk below it. */
export interface GapOpening {
  up: number;
  down: number;
}

/** A diff's display, top to bottom: rows of lines, and the gaps of
 * unchanged lines still hidden between them. A gap is numbered by the hunk
 * after it, the gap after the last hunk by their count; its `hidden` is null
 * while the file's length is unknown, and `header` is the hunk's after it. */
export type DiffBlock =
  | { kind: "rows"; rows: SplitRow[] }
  | { kind: "gap"; gap: number; hidden: number | null; header?: string };

/** The first line of a side a hunk covers, and the first after it. */
function span({ start, count }: { start: number; count: number }) {
  return count === 0
    ? { first: start + 1, next: start + 1 }
    : { first: start, next: start + count };
}

/** `hunks` with the unchanged lines of the new side's `lines` shown where
 * `opened` opens their gaps (ADR 0061). The lines shown read the same on
 * both sides, numbered on the old side by the hunk next to them. Without
 * `lines`, every gap stays closed, the last one's size known from the new
 * side's `length` when given. */
export function diffBlocks(
  hunks: DiffHunk[],
  lines: string[] | null,
  opened: GapOpening[],
  length: number | null = lines?.length ?? null,
): DiffBlock[] {
  if (hunks.length === 0) return [];
  const blocks: DiffBlock[] = [];
  const pushRows = (rows: SplitRow[]) => {
    if (rows.length === 0) return;
    const last = blocks.at(-1);
    if (last?.kind === "rows") last.rows.push(...rows);
    else blocks.push({ kind: "rows", rows: [...rows] });
  };
  const context = (from: number, to: number, shift: number): SplitRow[] =>
    lines === null
      ? []
      : Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => {
          const no = from + i;
          const text = lines[no - 1];
          return {
            left: { no: no + shift, text, kind: "context" as const },
            right: { no, text, kind: "context" as const },
          };
        });
  for (let gap = 0; gap <= hunks.length; gap++) {
    const before = hunks[gap - 1];
    const after = hunks[gap];
    const from = before ? span(before.new).next : 1;
    const to = after ? span(after.new).first - 1 : length;
    const reference = after ?? before;
    const shift = after
      ? span(after.old).first - span(after.new).first
      : span(reference.old).next - span(reference.new).next;
    if (to === null) {
      blocks.push({ kind: "gap", gap, hidden: null });
    } else {
      const size = Math.max(0, to - from + 1);
      const open = lines === null ? { up: 0, down: 0 } : opened[gap];
      const down = Math.min(open?.down ?? 0, size);
      const up = Math.min(open?.up ?? 0, size - down);
      pushRows(context(from, from + down - 1, shift));
      if (size - down - up > 0) {
        blocks.push({
          kind: "gap",
          gap,
          hidden: size - down - up,
          header: after?.header,
        });
      }
      pushRows(context(to - up + 1, to, shift));
    }
    if (after) pushRows(after.rows);
  }
  return blocks;
}

/** The conversion a diff makes when it changes nothing but line endings:
 * every changed line is paired with its own text under the other ending,
 * all in the same direction. Null for any other diff, or an empty one. */
export function eolChange(
  hunks: DiffHunk[],
): { from: LineEnding; to: LineEnding } | null {
  let change: { from: LineEnding; to: LineEnding } | null = null;
  for (const { left, right } of hunks.flatMap((h) => h.rows)) {
    if (left?.kind === "context") continue;
    if (!left?.eol || !right?.eol || left.text !== right.text) return null;
    if (change && (change.from !== left.eol || change.to !== right.eol)) {
      return null;
    }
    change = { from: left.eol, to: right.eol };
  }
  return change;
}
