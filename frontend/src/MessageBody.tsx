import { inlineSpans, messageBlocks } from "./message";

/** A commit message body as paragraphs, bullet lists and code blocks. */
export function MessageBody({ body }: { body: string }) {
  return (
    <>
      {messageBlocks(body).map((block, i) =>
        block.kind === "code" ? (
          <pre key={i} className="detail-code" data-testid="detail-code">
            {block.text}
          </pre>
        ) : block.kind === "list" ? (
          <ul key={i} className="detail-bullets" data-testid="detail-bullets">
            {block.items.map((item, j) => (
              <li key={j}>
                {inlineSpans(item).map((span, k) =>
                  span.code ? <code key={k}>{span.text}</code> : span.text,
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p key={i} className="detail-message">
            {inlineSpans(block.text).map((span, j) =>
              span.code ? <code key={j}>{span.text}</code> : span.text,
            )}
          </p>
        ),
      )}
    </>
  );
}
