/** Parse unified-diff text into rows a side-by-side (split) view can render.
 *
 * The hunk headers carry both sides' line numbers, so the split layout can be
 * derived entirely from the text `POST /api/diff` already returns: inside a
 * hunk, a run of removals is paired row-by-row with the following run of
 * additions; the unpaired remainder gets an empty opposite cell.
 */

export type CellKind = "context" | "add" | "remove";

export interface SplitCell {
  /** 1-based line number on this side. */
  no: number;
  text: string;
  kind: CellKind;
}

export interface SplitRow {
  left?: SplitCell;
  right?: SplitCell;
}

export interface DiffHunk {
  header: string;
  rows: SplitRow[];
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
      current?.rows.push({ left: removes[i], right: adds[i] });
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
