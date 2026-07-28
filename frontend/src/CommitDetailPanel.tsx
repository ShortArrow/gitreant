import { useState } from "react";
import type { CommitDetail, FileChange } from "./api";
import { ContextMenu } from "./ContextMenu";
import { CopyText } from "./CopyText";
import { BodyToggleIcon, DiffAllIcon, FlatIcon, TreeIcon } from "./Icons";
import { LabeledButton } from "./LabeledButton";
import { inlineSpans, messageBlocks } from "./message";
import { useT, useTime } from "./settings";
import { buildFileTree, type FileTreeNode } from "./fileTree";
import { shortId } from "./graph";
import { absoluteTime } from "./time";
import { ResizeHandle, useStoredWidth } from "./Resizer";

/** Split a full commit message into its summary line and body. */
export function splitMessage(message: string): { summary: string; body: string } {
  const [summary = "", ...rest] = message.split("\n");
  return { summary, body: rest.join("\n").trim() };
}

/** Join a repository root with a repository-relative path, in whichever
 * separator the root itself is written in — the server may run on Windows
 * while the paths git reports always use forward slashes. */
export function absolutePath(root: string, relative: string): string {
  const windows = /^[A-Za-z]:[\\/]/.test(root) || root.startsWith("\\\\");
  const base = root.replace(/[\\/]+$/, "");
  const separator = windows ? "\\" : "/";
  const tail = windows ? relative.replace(/\//g, "\\") : relative;
  return `${base}${separator}${tail}`;
}

const NOREPLY_SUFFIX = "@users.noreply.github.com";

/** The GitHub login a commit email names, if it encodes one. Mirrors the
 * server's avatar resolution: `<id>+<login>@` and the older bare `<login>@`
 * noreply forms, with logins limited to ASCII alphanumerics and hyphens. */
function noreplyLogin(email: string): string | null {
  const local = email.trim().toLowerCase();
  if (!local.endsWith(NOREPLY_SUFFIX)) return null;
  const account = local.slice(0, -NOREPLY_SUFFIX.length);
  const login = account.includes("+") ? account.split("+")[1] : account;
  if (!login || login === "noreply") return null;
  return /^[a-z0-9-]+$/.test(login) ? login : null;
}

/** Where clicking an author goes: their GitHub profile when the commit email
 * names an account, otherwise a GitHub user search for the address. */
export function githubAuthorUrl(email: string): {
  url: string;
  profile: boolean;
} {
  const login = noreplyLogin(email);
  return login
    ? { url: `https://github.com/${login}`, profile: true }
    : {
        url: `https://github.com/search?q=${encodeURIComponent(email.trim())}&type=users`,
        profile: false,
      };
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

const BODY_OPEN_KEY = "gitreant-body-open";

/** The body expander only moves on explicit toggles: the choice survives
 * switching commits, closing the panel and reloads. */
function storedBodyOpen(): boolean {
  try {
    return localStorage.getItem(BODY_OPEN_KEY) === "on";
  } catch {
    return false;
  }
}

export function CommitDetailPanel({
  detail,
  error,
  repoPath,
  verified,
  signatureKey,
  onSelectFile,
  onOpenFile,
  onShowAllDiffs,
  onClose,
}: {
  /** null while loading. */
  detail: CommitDetail | null;
  error: string | null;
  /** Absolute repository root, for the file menu's absolute-path copy. */
  repoPath: string;
  /** Verification verdict from the graph view, when gpg checked it. */
  verified?: boolean;
  /** Signing key id from the graph view, when gpg attributed one. */
  signatureKey?: string;
  /** Called with the repository-relative path of a clicked file. */
  onSelectFile: (path: string) => void;
  /** Open a changed file with the OS default handler. */
  onOpenFile: (path: string) => void;
  /** Called when every changed file's diff should open at once. */
  onShowAllDiffs: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const [view, setView] = useState<FilesView>(storedFilesView);
  const [bodyOpen, setBodyOpen] = useState<boolean>(storedBodyOpen);
  const [fileMenu, setFileMenu] = useState<{
    x: number;
    y: number;
    path: string;
  } | null>(null);
  const toggleBody = () => {
    setBodyOpen((open) => {
      try {
        localStorage.setItem(BODY_OPEN_KEY, open ? "off" : "on");
      } catch {
        // localStorage may be unavailable; the state change alone is enough.
      }
      return !open;
    });
  };
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
            title={t("closeDetails")}
            data-testid="detail-close"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </header>

        {error && <p className="detail-error">{error}</p>}
        {!error && !detail && <p className="detail-loading">{t("loading")}</p>}
        {detail && (
          <DetailBody
            key={detail.id}
            detail={detail}
            verified={verified}
            signatureKey={signatureKey}
            view={view}
            bodyOpen={bodyOpen}
            onToggleBody={toggleBody}
            onChangeView={changeView}
            onSelectFile={onSelectFile}
            onFileMenu={(e, path) => {
              e.preventDefault();
              setFileMenu({ x: e.clientX, y: e.clientY, path });
            }}
            onShowAllDiffs={onShowAllDiffs}
          />
        )}
      </div>
      {fileMenu && (
        <ContextMenu
          x={fileMenu.x}
          y={fileMenu.y}
          items={[
            {
              id: "file-open",
              label: t("openInEditor"),
              run: () => onOpenFile(fileMenu.path),
            },
            {
              id: "file-copy-relative-path",
              label: t("copyRelativePath"),
              run: () => navigator.clipboard?.writeText(fileMenu.path),
            },
            {
              id: "file-copy-absolute-path",
              label: t("copyAbsolutePath"),
              run: () =>
                navigator.clipboard?.writeText(
                  absolutePath(repoPath, fileMenu.path),
                ),
            },
          ]}
          onClose={() => setFileMenu(null)}
        />
      )}
    </aside>
  );
}

function DetailBody({
  detail,
  verified,
  signatureKey,
  view,
  bodyOpen,
  onToggleBody,
  onChangeView,
  onSelectFile,
  onFileMenu,
  onShowAllDiffs,
}: {
  detail: CommitDetail;
  verified?: boolean;
  signatureKey?: string;
  view: FilesView;
  bodyOpen: boolean;
  onToggleBody: () => void;
  onChangeView: (view: FilesView) => void;
  onSelectFile: (path: string) => void;
  onFileMenu: (e: React.MouseEvent, path: string) => void;
  onShowAllDiffs: () => void;
}) {
  const t = useT();
  const time = useTime();
  const { summary, body } = splitMessage(detail.message);
  const author = githubAuthorUrl(detail.email);
  return (
    <>
      {/* The title is one line and the expander rides on it: neither a long
       * summary nor a commit without a body may move what follows. The full
       * summary and the expander's action live in their tooltips. */}
      <div className="detail-title">
        <h3 className="detail-summary" title={summary}>
          {summary}
        </h3>
        {body && (
          <button
            className="body-toggle"
            data-testid="body-toggle"
            type="button"
            title={bodyOpen ? t("collapseBody") : t("expandBody")}
            aria-label={bodyOpen ? t("collapseBody") : t("expandBody")}
            aria-expanded={bodyOpen}
            onClick={onToggleBody}
          >
            <BodyToggleIcon open={bodyOpen} />
          </button>
        )}
      </div>
      {body &&
        bodyOpen &&
        messageBlocks(body).map((block, i) =>
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

      <dl className="detail-meta">
        <dt>{t("author")}</dt>
        <dd className="detail-author-line">
          <a
            className="detail-author"
            data-testid="detail-author"
            href={author.url}
            target="_blank"
            rel="noreferrer"
            title={t(author.profile ? "openGithubProfile" : "searchGithubUser")}
          >
            {detail.author}
          </a>
          <CopyText
            value={detail.email}
            display={`<${detail.email}>`}
            className="detail-email"
            testId="detail-email"
            title={t("copyEmail")}
          />
        </dd>
        <dt>{t("date")}</dt>
        <dd title={absoluteTime(new Date(detail.time * 1000))}>
          {time(detail.time)}
        </dd>
        <dt>{t("signature")}</dt>
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
                title={t("copyKeyId")}
              />
            </>
          )}
        </dd>
        {detail.parents.length > 0 && (
          <>
            <dt>{t("parents")}</dt>
            <dd className="detail-parents">
              {detail.parents.map((parent) => (
                <CopyText
                  key={parent}
                  value={parent}
                  display={shortId(parent)}
                  className="detail-parent"
                  testId="detail-parent"
                  title={t("copyParentId")}
                />
              ))}
            </dd>
          </>
        )}
      </dl>

      <div className="files-head">
        <span className="files-count">
          {t(detail.files.length === 1 ? "fileCount" : "filesCount", {
            n: detail.files.length,
          })}
        </span>
        {detail.files.length > 0 && (
          <LabeledButton
            icon={<DiffAllIcon />}
            label={t("diffAll")}
            testId="diff-all"
            className="diff-all-btn"
            onClick={onShowAllDiffs}
          />
        )}
        <div className="files-view">
          <LabeledButton
            icon={<FlatIcon />}
            label={t("flat")}
            testId="files-view-flat"
            active={view === "flat"}
            onClick={() => onChangeView("flat")}
          />
          <LabeledButton
            icon={<TreeIcon />}
            label={t("tree")}
            testId="files-view-tree"
            active={view === "tree"}
            onClick={() => onChangeView("tree")}
          />
        </div>
      </div>

      <ul className="detail-files">
        {detail.files.length === 0 && (
          <li className="detail-no-files">{t("noFileChanges")}</li>
        )}
        {view === "flat" &&
          detail.files.map((file) => (
            <FileRow
              key={file.path}
              change={file}
              label={file.path}
              depth={0}
              onSelect={onSelectFile}
              onFileMenu={onFileMenu}
            />
          ))}
        {view === "tree" && (
          <TreeRows
            nodes={buildFileTree(detail.files)}
            depth={0}
            onSelect={onSelectFile}
            onFileMenu={onFileMenu}
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
  onFileMenu,
}: {
  nodes: FileTreeNode[];
  depth: number;
  onSelect: (path: string) => void;
  onFileMenu: (e: React.MouseEvent, path: string) => void;
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
              <TreeRows
                nodes={node.children}
                depth={depth + 1}
                onSelect={onSelect}
                onFileMenu={onFileMenu}
              />
            </ul>
          </li>
        ) : (
          <FileRow
            key={node.change.path}
            change={node.change}
            label={node.name}
            depth={depth}
            onSelect={onSelect}
            onFileMenu={onFileMenu}
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
  onFileMenu,
}: {
  change: FileChange;
  label: string;
  depth: number;
  onSelect: (path: string) => void;
  onFileMenu: (e: React.MouseEvent, path: string) => void;
}) {
  return (
    <li
      className="detail-file"
      data-testid="detail-file"
      style={{ paddingLeft: depth * 14 }}
      onClick={() => onSelect(change.path)}
      onContextMenu={(e) => onFileMenu(e, change.path)}
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
