import { CopyText } from "./CopyText";
import { shortId } from "./graph";

/**
 * The abbreviated commit id shown at the right edge of a graph row.
 * Clicking it copies the full id to the clipboard.
 */
export function CommitHash({ id }: { id: string }) {
  return (
    <CopyText
      value={id}
      display={shortId(id)}
      className="commit-hash"
      testId="commit-hash"
      title="Copy the full commit id"
    />
  );
}
