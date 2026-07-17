/** Minimal markdown-ish rendering model for commit message bodies:
 * fenced code blocks and inline backtick code. Nothing else — commit
 * messages are not documents. */

export type MessageBlock =
  | { kind: "text" | "code"; text: string }
  | { kind: "list"; items: string[] };

const BULLET = /^\s*[-*]\s+(.*)$/;
const CONTINUATION = /^\s+(\S.*)$/;

/** Split a body into text, bullet-list and fenced-code blocks. The fence
 * language tag is dropped; an unclosed fence runs to the end. Git bodies
 * hard-wrap at ~72 columns, so an indented line right after a bullet is
 * that item's continuation, not a new paragraph. */
export function messageBlocks(body: string): MessageBlock[] {
  const blocks: MessageBlock[] = [];
  let text: string[] = [];
  let items: string[] = [];
  let inCode = false;

  const flushText = () => {
    const joined = text.join("\n").trim();
    if (joined) blocks.push({ kind: inCode ? "code" : "text", text: joined });
    text = [];
  };
  const flushList = () => {
    if (items.length) blocks.push({ kind: "list", items });
    items = [];
  };

  for (const line of body.split("\n")) {
    if (line.trimEnd().startsWith("```")) {
      flushText();
      flushList();
      inCode = !inCode;
      continue;
    }
    const bullet = inCode ? null : BULLET.exec(line);
    const continuation = items.length ? CONTINUATION.exec(line) : null;
    if (bullet) {
      flushText();
      items.push(bullet[1]);
    } else if (continuation) {
      items[items.length - 1] += ` ${continuation[1]}`;
    } else {
      flushList();
      text.push(line);
    }
  }
  flushText();
  flushList();
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
