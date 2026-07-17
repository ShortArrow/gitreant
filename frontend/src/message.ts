/** Minimal markdown-ish rendering model for commit message bodies:
 * paragraphs, bullet lists, code blocks (fenced or indented) and inline
 * backtick code. Nothing else — commit messages are not documents. */

export type MessageBlock =
  | { kind: "text" | "code"; text: string }
  | { kind: "list"; items: string[] };

const BULLET = /^\s*[-*]\s+(.*)$/;
const CONTINUATION = /^\s+(\S.*)$/;
const INDENTED = /^(?: {4}|\t)(.*\S.*)$/;

/** Split a body into paragraph, bullet-list and code blocks. Git bodies
 * hard-wrap at ~72 columns, so wrapped lines rejoin: an indented line
 * right after a bullet is that item's continuation, and consecutive
 * prose lines are one paragraph. Code is a ``` fence (language tag
 * dropped; unclosed runs to the end) or, per the older git convention,
 * a 4-space/tab-indented run. */
export function messageBlocks(body: string): MessageBlock[] {
  const blocks: MessageBlock[] = [];
  let text: string[] = [];
  let items: string[] = [];
  let code: string[] = [];
  let inFence = false;

  const flushText = () => {
    for (const paragraph of text.join("\n").split(/\n\s*\n/)) {
      const joined = paragraph
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .join(" ");
      if (joined) blocks.push({ kind: "text", text: joined });
    }
    text = [];
  };
  const flushList = () => {
    if (items.length) blocks.push({ kind: "list", items });
    items = [];
  };
  const flushCode = () => {
    const joined = code.join("\n").trim();
    if (joined) blocks.push({ kind: "code", text: joined });
    code = [];
  };

  for (const line of body.split("\n")) {
    if (line.trimEnd().startsWith("```")) {
      flushText();
      flushList();
      flushCode();
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      code.push(line);
      continue;
    }
    const bullet = BULLET.exec(line);
    if (bullet) {
      flushText();
      flushCode();
      items.push(bullet[1]);
      continue;
    }
    const continuation = items.length ? CONTINUATION.exec(line) : null;
    if (continuation) {
      items[items.length - 1] += ` ${continuation[1]}`;
      continue;
    }
    const indented = INDENTED.exec(line);
    if (indented) {
      flushText();
      flushList();
      code.push(indented[1]);
      continue;
    }
    flushList();
    flushCode();
    text.push(line);
  }
  flushText();
  flushList();
  flushCode();
  return blocks;
}

export interface InlineSpan {
  code: boolean;
  text: string;
}

/** Mark `backtick` runs inside one text block; unpaired backticks stay
 * literal. */
export function inlineSpans(text: string): InlineSpan[] {
  const spans: InlineSpan[] = [];
  let rest = text;
  while (rest.length > 0) {
    const match = /`([^`]+)`/.exec(rest);
    if (!match) {
      spans.push({ code: false, text: rest });
      break;
    }
    if (match.index > 0) {
      spans.push({ code: false, text: rest.slice(0, match.index) });
    }
    spans.push({ code: true, text: match[1] });
    rest = rest.slice(match.index + match[0].length);
  }
  return spans;
}
