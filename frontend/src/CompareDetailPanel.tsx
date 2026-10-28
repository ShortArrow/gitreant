import type { CommitView, FileDiff } from "./api";
import { FileCounts } from "./CommitDetailPanel";
import { diffCounts } from "./diffModel";
import { shortId } from "./graph";
import { ResizeHandle, useStoredWidth } from "./Resizer";
import { useT, useTime } from "./settings";
import { absoluteTime } from "./time";

/**
 * The detail pane while two commits are compared (ADR 0035): both commits,
 * the base above the target, then every file that differs between them with
 * its line counts. Picking a file brings its diff into view.
 */
export function CompareDetailPanel({
  base,
  target,
  files,
  error,
  onSelectFile,
  onClose,
}: {
  base: CommitView;
  target: CommitView;
  /** null while loading. */
  files: FileDiff[] | null;
  error: string | null;
  onSelectFile: (path: string) => void;
  /** Ends the comparison. */
  onClose: () => void;
}) {
  const t = useT();
  const [width, setWidth] = useStoredWidth("gitreant-detail-width", 340, 240, 640);
  return (
    <aside
      className="commit-detail"
      data-testid="compare-detail"
      style={{ width }}
    >
      <ResizeHandle
        width={width}
        onWidth={setWidth}
        direction={-1}
        label="Resize commit details"
        testId="detail-resize"
      />
      <div className="detail-scroll">
        <header className="detail-head">
          <span className="detail-id">
            {shortId(base.id)}..{shortId(target.id)}
          </span>
          <button
            className="icon-btn"
            title={t("closeComparison")}
            data-testid="compare-close"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </header>
        <CompareCommit label={t("compareBase")} commit={base} testId="compare-base" />
        <CompareCommit
          label={t("compareTarget")}
          commit={target}
          testId="compare-target"
        />
        {error && <p className="detail-error">{error}</p>}
        {!error && !files && <p className="detail-loading">{t("loading")}</p>}
        {files && (
          <ul className="detail-files">
            {files.length === 0 && (
              <li className="detail-no-files">{t("noFileChanges")}</li>
            )}
            {files.map((file) => {
              const counts = diffCounts(file.text);
              return (
                <li
                  key={file.path}
                  className="detail-file"
                  data-testid="compare-file"
                  onClick={() => onSelectFile(file.path)}
                >
                  <span className={`file-status file-status-${file.status}`}>
                    {file.status}
                  </span>
                  <span className="file-path">{file.path}</span>
                  <FileCounts
                    binary={file.binary}
                    additions={counts.additions}
                    deletions={counts.deletions}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}

function CompareCommit({
  label,
  commit,
  testId,
}: {
  label: string;
  commit: CommitView;
  testId: string;
}) {
  const time = useTime();
  return (
    <dl className="detail-meta compare-commit" data-testid={testId}>
      <dt>{label}</dt>
      <dd>
        <code>{shortId(commit.id)}</code> {commit.summary}
      </dd>
      <dd title={absoluteTime(new Date(commit.time * 1000))}>
        {commit.author} · {time(commit.time)}
      </dd>
    </dl>
  );
}
