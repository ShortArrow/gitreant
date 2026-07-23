/** The app's icon vocabulary, backed by GitHub's Octicons (ADR 0016).
 * Naming stays domain-side so swapping the set touches only this file. */

import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  CopyIcon as OcticonCopyIcon,
  MarkGithubIcon,
  StackIcon,
  TagIcon,
  ColumnsIcon,
  DiffIcon,
  DotFillIcon,
  DownloadIcon,
  FileDirectoryIcon,
  FileDirectoryOpenFillIcon,
  GearIcon,
  GitBranchIcon,
  ArrowUpIcon,
  ListUnorderedIcon,
  MoonIcon,
  PlusIcon,
  RowsIcon,
  SunIcon,
  SyncIcon,
  TerminalIcon,
  TriangleDownIcon,
} from "@primer/octicons-react";

const SIZE = 14;

/** One column of full-width lines: the inline diff view. */
export function InlineIcon() {
  return <RowsIcon className="btn-icon" size={SIZE} />;
}

/** Two columns side by side: the split diff view. */
export function SplitIcon() {
  return <ColumnsIcon className="btn-icon" size={SIZE} />;
}

/** A plain list: the flat files view. */
export function FlatIcon() {
  return <ListUnorderedIcon className="btn-icon" size={SIZE} />;
}

/** A directory: the tree files view. */
export function TreeIcon() {
  return <FileDirectoryIcon className="btn-icon" size={SIZE} />;
}

/** The diff mark: every file's diff at once. */
export function DiffAllIcon() {
  return <DiffIcon className="btn-icon" size={SIZE} />;
}

/** A plus: add a repository. */
export function AddIcon() {
  return <PlusIcon className="btn-icon" size={SIZE} />;
}

/** An open directory: browse for a folder. */
export function BrowseIcon() {
  return <FileDirectoryOpenFillIcon className="btn-icon" size={SIZE} />;
}

/** Collapse the drawer to a rail. */
export function CollapseIcon() {
  return <ChevronLeftIcon className="btn-icon" size={SIZE} />;
}

/** Expand the drawer from its rail. */
export function ExpandIcon() {
  return <ChevronRightIcon className="btn-icon" size={SIZE} />;
}

/** Drawer status indicators: uncommitted changes, unpushed commits and
 * local-only branches. */
export function DirtyIcon() {
  return <DotFillIcon size={12} />;
}
export function UnpushedIcon() {
  return <ArrowUpIcon size={12} />;
}
export function LocalBranchIcon() {
  return <GitBranchIcon size={12} />;
}

/** Chevron pointing down (closed) or up (open): the message-body bar. */
export function BodyToggleIcon({ open }: { open: boolean }) {
  return open ? (
    <ChevronUpIcon className="btn-icon" size={SIZE} />
  ) : (
    <ChevronDownIcon className="btn-icon" size={SIZE} />
  );
}

/** Fetch every repository's remotes. */
export function FetchIcon() {
  return <DownloadIcon className="btn-icon" size={SIZE} />;
}

/** The command/action log pane. */
export function LogIcon() {
  return <TerminalIcon className="btn-icon" size={SIZE} />;
}

/** Re-read the repositories from disk. */
export function ReloadIcon() {
  return <SyncIcon className="btn-icon" size={SIZE} />;
}

/** The settings panel. */
export function SettingsIcon() {
  return <GearIcon className="btn-icon" size={SIZE} />;
}

/** Light theme half of the toggle. */
export function SunThemeIcon() {
  return <SunIcon className="btn-icon" size={SIZE} />;
}

/** Dark theme half of the toggle. */
export function MoonThemeIcon() {
  return <MoonIcon className="btn-icon" size={SIZE} />;
}

/** The dropdown trigger on a selected diff line. */
export function LineMenuIcon() {
  return <TriangleDownIcon size={12} />;
}

/** The GitHub mark on a branch badge that links to its pull request. */
export function PrLinkIcon() {
  return <MarkGithubIcon size={12} />;
}

/** Copy a log entry (or the whole log) to the clipboard. */
export function CopyIcon() {
  return <OcticonCopyIcon size={12} />;
}

/** Accordion disclosure: right when collapsed, down when expanded. */
export function DisclosureIcon({ open }: { open: boolean }) {
  return open ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />;
}

/** Marks a tag badge apart from branch badges. */
export function TagBadgeIcon() {
  return <TagIcon size={12} />;
}

/** Marks the stash badge apart from branch badges. */
export function StashBadgeIcon() {
  return <StackIcon size={12} />;
}
