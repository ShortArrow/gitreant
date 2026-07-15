import { CopyText } from "./CopyText";
import { shortId } from "./graph";
import { useT } from "./settings";

/**
 * The abbreviated commit id shown at the right edge of a graph row.
 * Clicking it copies the full id to the clipboard.
 */
export function CommitHash({ id }: { id: string }) {
  const t = useT();
  return (
    <CopyText
      value={id}
      display={shortId(id)}
      className="commit-hash"
      testId="commit-hash"
      title={t("copyFullId")}
    />
  );
}
