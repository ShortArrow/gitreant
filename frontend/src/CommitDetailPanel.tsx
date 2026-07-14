import { useState } from "react";
import type { CommitDetail, FileChange } from "./api";
import { CopyText } from "./CopyText";
import { DiffAllIcon, FlatIcon, TreeIcon } from "./Icons";
import { LabeledButton } from "./LabeledButton";
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
  verified,
  signatureKey,
  onSelectFile,
  onShowAllDiffs,
  onClose,
}: {
  /** null while loading. */
  detail: CommitDetail | null;
  error: string | null;
  /** Verification verdict from the graph view, when gpg checked it. */
  verified?: boolean;
  /** Signing key id from the graph view, when gpg attributed one. */
  signatureKey?: string;
  /** Called with the repository-relative path of a clicked file. */
  onSelectFile: (path: string) => void;
  /** Called when every changed file's diff should open at once. */
  onShowAllDiffs: () => void;
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
          <DetailBody
            detail={detail}
            verified={verified}
            signatureKey={signatureKey}
            view={view}
            onChangeView={changeView}
            onSelectFile={onSelectFile}
            onShowAllDiffs={onShowAllDiffs}
          />
        )}
      </div>
    </aside>
  );
}

function DetailBody({
  detail,
  verified,
  signatureKey,
  view,
  onChangeView,
  onSelectFile,
  onShowAllDiffs,
}: {
  detail: CommitDetail;
  verified?: boolean;
  signatureKey?: string;
  view: FilesView;
  onChangeView: (view: FilesView) => void;
  onSelectFile: (path: string) => void;
  onShowAllDiffs: () => void;
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
          {verified === true && " — Verified"}
          {verified === false && " — Unverified"}
          {signatureKey && (
            <>
              {" "}
              <CopyText
                value={signatureKey}
                display={signatureKey}
                className="detail-key"
                testId="detail-signature-key"
                title="Copy the signing key id"
              />
            </>
          )}
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
        {detail.files.length > 0 && (
          <LabeledButton
            icon={<DiffAllIcon />}
            label="Diff all"
            testId="diff-all"
            className="diff-all-btn"
            onClick={onShowAllDiffs}
          />
        )}
        <div className="files-view">
          <LabeledButton
            icon={<FlatIcon />}
            label="Flat"
            testId="files-view-flat"
            active={view === "flat"}
            onClick={() => onChangeView("flat")}
          />
          <LabeledButton
            icon={<TreeIcon />}
            label="Tree"
            testId="files-view-tree"
            active={view === "tree"}
            onClick={() => onChangeView("tree")}
          />
        </div>
      </div>

      <ul className="detail-files">
        {detail.files.length === 0 && (
          <li className="detail-no-files">No file changes</li>
        )}
        {view === "flat" &&
          detail.files.map((file) => (
            <FileRow
              key={file.path}
              change={file}
              label={file.path}
              depth={0}
              onSelect={onSelectFile}
            />
          ))}
        {view === "tree" && (
          <TreeRows
            nodes={buildFileTree(detail.files)}
            depth={0}
            onSelect={onSelectFile}
          />
        )}
      </ul>
    </>
  );
}

function TreeRows({
  nodes,
  depth,
  onSelect,
}: {
  nodes: FileTreeNode[];
  depth: number;
  onSelect: (path: string) => void;
}) {
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
              <TreeRows nodes={node.children} depth={depth + 1} onSelect={onSelect} />
            </ul>
          </li>
        ) : (
          <FileRow
            key={node.change.path}
            change={node.change}
            label={node.name}
            depth={depth}
            onSelect={onSelect}
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
  onSelect,
}: {
  change: FileChange;
  label: string;
  depth: number;
  onSelect: (path: string) => void;
}) {
  return (
    <li
      className="detail-file"
      data-testid="detail-file"
      style={{ paddingLeft: depth * 14 }}
      onClick={() => onSelect(change.path)}
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
