/** Minimal markdown-ish rendering model for commit message bodies:
 * fenced code blocks and inline backtick code. Nothing else — commit
 * messages are not documents. */

export interface MessageBlock {
  kind: "text" | "code";
  text: string;
}

/** Split a body into text and fenced-code blocks. The fence language tag is
 * dropped; an unclosed fence runs to the end. */
export function messageBlocks(body: string): MessageBlock[] {
  const blocks: MessageBlock[] = [];
  let current: string[] = [];
  let inCode = false;

  const flush = () => {
    const text = current.join("\n").trim();
    if (text) blocks.push({ kind: inCode ? "code" : "text", text });
    current = [];
  };

  for (const line of body.split("\n")) {
    if (line.trimEnd().startsWith("```")) {
      flush();
      inCode = !inCode;
    } else {
      current.push(line);
    }
  }
  flush();
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
