import { useEffect, useState } from "react";
import { shortId } from "./graph";

/**
 * The abbreviated commit id shown at the right edge of a graph row.
 * Clicking it copies the full id to the clipboard and briefly shows
 * "Copied" in place of the hash.
 */
export function CommitHash({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <button
      className="commit-hash"
      data-testid="commit-hash"
      title="Copy the full commit id"
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard
          .writeText(id)
          .then(() => setCopied(true))
          .catch(() => {});
      }}
    >
      {copied ? "Copied" : shortId(id)}
    </button>
  );
}
