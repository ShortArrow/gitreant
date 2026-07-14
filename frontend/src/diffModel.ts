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

export interface SplitCell {
  /** 1-based line number on this side. */
  no: number;
  text: string;
  kind: CellKind;
  /** Intra-line diff against the paired line, when one exists. */
  segments?: Segment[];
}

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

/** The text of a selected run of lines, ready for the clipboard. */
export function selectedLines(cells: SplitCell[]): string {
  return cells.map((c) => c.text).join("\n");
}

/** GitHub-style line fragment ("#L3" / "#L3-L5") for a selected run.
 *
 * Permalinks address the file at the commit, so every selected line must
 * exist on the new side — a selection containing removals has no fragment.
 */
export function permalinkFragment(cells: SplitCell[]): string | null {
  if (cells.length === 0 || cells.some((c) => c.kind === "remove")) {
    return null;
  }
  const start = cells[0].no;
  const end = cells[cells.length - 1].no;
  return end > start ? `#L${start}-L${end}` : `#L${start}`;
}

export function parseUnified(text: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  let current: DiffHunk | null = null;
  let oldNo = 0;
  let newNo = 0;
  let removes: SplitCell[] = [];
  let adds: SplitCell[] = [];

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
      }
      current?.rows.push({ left, right });
    }
    removes = [];
    adds = [];
  };

  for (const line of text.replace(/\n$/, "").split("\n")) {
    const header = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (header) {
      flushRun();
      oldNo = Number(header[1]);
      newNo = Number(header[2]);
      current = { header: line, rows: [] };
      hunks.push(current);
      continue;
    }
    if (!current) continue;
    if (line.startsWith("-")) {
      removes.push({ no: oldNo++, text: line.slice(1), kind: "remove" });
    } else if (line.startsWith("+")) {
      adds.push({ no: newNo++, text: line.slice(1), kind: "add" });
    } else {
      flushRun();
      const text = line.slice(1);
      current.rows.push({
        left: { no: oldNo++, text, kind: "context" },
        right: { no: newNo++, text, kind: "context" },
      });
    }
  }
  flushRun();
  return hunks;
}
