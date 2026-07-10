import { useState } from "react";
import type { CommitDetail, FileChange } from "./api";
import { buildFileTree, type FileTreeNode } from "./fileTree";
import { shortId } from "./graph";
import { ResizeHandle, useStoredWidth } from "./Resizer";

/** Split a full commit message into its summary line and body. */
export function splitMessage(message: string): { summary: string; body: string } {
  const [summary = "", ...rest] = message.split("\n");
  return { summary, body: rest.join("\n").trim() };
}

/** Human label for the embedded-signature kind reported by the server. */
export function signatureLabel(signature: string | undefined): string {
  switch (signature) {
    case undefined:
      return "Not signed";
    case "openpgp":
      return "Signed (OpenPGP)";
    case "ssh":
      return "Signed (SSH)";
    case "x509":
      return "Signed (X.509)";
    default:
      return "Signed";
  }
}

type FilesView = "flat" | "tree";

const FILES_VIEW_KEY = "gitreant-files-view";

function storedFilesView(): FilesView {
  try {
    return localStorage.getItem(FILES_VIEW_KEY) === "tree" ? "tree" : "flat";
  } catch {
    return "flat";
  }
}

export function CommitDetailPanel({
  detail,
  error,
  onClose,
}: {
  /** null while loading. */
  detail: CommitDetail | null;
  error: string | null;
  onClose: () => void;
}) {
  const [view, setView] = useState<FilesView>(storedFilesView);
  const [width, setWidth] = useStoredWidth("gitreant-detail-width", 340, 240, 640);
  const changeView = (next: FilesView) => {
    setView(next);
    try {
      localStorage.setItem(FILES_VIEW_KEY, next);
    } catch {
      // localStorage may be unavailable; the state change alone is enough.
    }
  };

  return (
    <aside className="commit-detail" data-testid="commit-detail" style={{ width }}>
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
            {detail ? shortId(detail.id) : "…"}
          </span>
          <button
            className="icon-btn"
            title="Close details"
            data-testid="detail-close"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </header>

        {error && <p className="detail-error">{error}</p>}
        {!error && !detail && <p className="detail-loading">Loading…</p>}
        {detail && (
          <DetailBody detail={detail} view={view} onChangeView={changeView} />
        )}
      </div>
    </aside>
  );
}

function DetailBody({
  detail,
  view,
  onChangeView,
}: {
  detail: CommitDetail;
  view: FilesView;
  onChangeView: (view: FilesView) => void;
}) {
  const { summary, body } = splitMessage(detail.message);
  return (
    <>
      <h3 className="detail-summary">{summary}</h3>
      {body && <pre className="detail-message">{body}</pre>}

      <dl className="detail-meta">
        <dt>Author</dt>
        <dd>
          {detail.author} &lt;{detail.email}&gt;
        </dd>
        <dt>Date</dt>
        <dd>{new Date(detail.time * 1000).toLocaleString()}</dd>
        <dt>Signature</dt>
        <dd data-testid="detail-signature">
          {signatureLabel(detail.signature)}
        </dd>
        {detail.parents.length > 0 && (
          <>
            <dt>Parents</dt>
            <dd>{detail.parents.map(shortId).join(", ")}</dd>
          </>
        )}
      </dl>

      <div className="files-head">
        <span className="files-count">
          {detail.files.length} file{detail.files.length === 1 ? "" : "s"}
        </span>
        <div className="files-view">
          <button
            className={view === "flat" ? "active" : ""}
            data-testid="files-view-flat"
            onClick={() => onChangeView("flat")}
            type="button"
          >
            Flat
          </button>
          <button
            className={view === "tree" ? "active" : ""}
            data-testid="files-view-tree"
            onClick={() => onChangeView("tree")}
            type="button"
          >
            Tree
          </button>
        </div>
      </div>

      <ul className="detail-files">
        {detail.files.length === 0 && (
          <li className="detail-no-files">No file changes</li>
        )}
        {view === "flat" &&
          detail.files.map((file) => (
            <FileRow key={file.path} change={file} label={file.path} depth={0} />
          ))}
        {view === "tree" && (
          <TreeRows nodes={buildFileTree(detail.files)} depth={0} />
        )}
      </ul>
    </>
  );
}

function TreeRows({ nodes, depth }: { nodes: FileTreeNode[]; depth: number }) {
  return (
    <>
      {nodes.map((node) =>
        node.kind === "dir" ? (
          <li key={`${depth}:${node.name}`}>
            <div
              className="detail-dir"
              data-testid="detail-dir"
              style={{ paddingLeft: depth * 14 }}
            >
              {node.name}/
            </div>
            <ul className="detail-files">
              <TreeRows nodes={node.children} depth={depth + 1} />
            </ul>
          </li>
        ) : (
          <FileRow
            key={node.change.path}
            change={node.change}
            label={node.name}
            depth={depth}
          />
        ),
      )}
    </>
  );
}

function FileRow({
  change,
  label,
  depth,
}: {
  change: FileChange;
  label: string;
  depth: number;
}) {
  return (
    <li
      className="detail-file"
      data-testid="detail-file"
      style={{ paddingLeft: depth * 14 }}
    >
      <span className={`file-status file-status-${change.status}`}>
        {change.status}
      </span>
      <span className="file-path">{label}</span>
      <span className="file-counts">
        <span className="file-additions">+{change.additions}</span>{" "}
        <span className="file-deletions">−{change.deletions}</span>
      </span>
    </li>
  );
}
