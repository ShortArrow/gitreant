import { useEffect, useState } from "react";

/**
 * A click-to-copy chip: shows `display`, copies `value` to the clipboard and
 * briefly swaps to "Copied" as feedback.
 */
export function CopyText({
  value,
  display,
  className,
  testId,
  title,
}: {
  value: string;
  display: string;
  className: string;
  testId: string;
  title: string;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <button
      className={className}
      data-testid={testId}
      title={title}
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard
          .writeText(value)
          .then(() => setCopied(true))
          .catch(() => {});
      }}
    >
      {copied ? "Copied" : display}
    </button>
  );
}
