/** Hand-rolled typed i18n: two dictionaries and a context-driven lookup.
 * Domain terms shared with GitHub (Signed/Verified badges, HEAD) stay
 * untranslated on purpose (see ADR 0019). */

export type Lang = "en" | "ja";
/** The stored preference; "auto" follows the browser language. */
export type LangSetting = Lang | "auto";

export const LANG_KEY = "gitreant-lang";

export function parseLangSetting(value: string | null): LangSetting {
  return value === "en" || value === "ja" ? value : "auto";
}

export function resolveLang(setting: LangSetting, browserLang: string): Lang {
  if (setting !== "auto") return setting;
  return browserLang.toLowerCase().startsWith("ja") ? "ja" : "en";
}

/** Replace `{name}` tokens with the given parameters. */
export function format(
  template: string,
  params?: Record<string, string | number>,
): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in params ? String(params[key]) : whole,
  );
}

const en = {
  // App chrome
  emptyPane: "Select a repository from the drawer.",
  fetch: "Fetch",
  log: "Log",
  reload: "Reload",
  settings: "Settings",
  theme: "Theme",
  closeTab: "Close tab",
  // Settings dialog
  settingsButtons: "Buttons",
  buttonsIcon: "Icon",
  buttonsIconLabel: "Icon + label",
  buttonsLabel: "Label",
  settingsGraph: "Graph",
  squashLinksSetting: "Dashed squash-merge links",
  settingsLanguage: "Language",
  langAuto: "Auto",
  langEn: "English",
  langJa: "日本語",
  closeSettings: "Close settings",
  // Command palette
  paletteHint: "Type a command…",
  paletteEmpty: "No matching commands",
  cmdFetch: "Fetch remotes",
  cmdReload: "Reload repositories",
  cmdToggleLog: "Toggle command log",
  cmdOpenSettings: "Open settings",
  cmdToggleTheme: "Toggle theme",
  cmdCollapseDrawer: "Collapse the repository list",
  cmdExpandDrawer: "Expand the repository list",
  cmdOpenRepo: "Open repository: {name}",
  // Drawer
  repositories: "Repositories",
  addRepoPlaceholder: "Add repository path…",
  browse: "Browse",
  add: "Add",
  noRepositories: "No repositories.",
  removeFromView: "Remove from view",
  collapse: "Collapse",
  expand: "Expand",
  // Graph rows
  commitsCount: "{n} commits",
  copyFullId: "Copy the full commit id",
  // Ref context menu
  refCopyName: "Copy branch name",
  refCheckout: "Checkout {reference}",
  refMergeInto: "Merge into {branch}",
  refCheckoutQuestion: "Checkout {reference}?",
  refMergeQuestion: "Merge {reference} into {branch}?",
  yes: "Yes",
  cancel: "Cancel",
  noBranchCheckedOut: "No branch is checked out",
  openPr: "Open pull request #{number} on GitHub",
  // Tag operations
  copyTagName: "Copy tag name",
  deleteTag: "Delete tag",
  deleteTagQuestion: "Delete tag {name}?",
  createTag: "Create tag",
  tagNamePlaceholder: "Tag name…",
  // Commit details
  loading: "Loading…",
  author: "Author",
  date: "Date",
  signature: "Signature",
  parents: "Parents",
  filesCount: "{n} files",
  fileCount: "{n} file",
  diffAll: "Diff all",
  diffAllTitle: "Show every file's diff",
  flat: "Flat",
  tree: "Tree",
  noFileChanges: "No file changes",
  closeDetails: "Close details",
  copyKeyId: "Copy the signing key id",
  // Diff pane
  inline: "Inline",
  split: "Split",
  closeDiff: "Close diff",
  binaryFile: "Binary file — no text diff.",
  linesSelected: "{n} lines selected",
  lineSelected: "{n} line selected",
  copyLines: "Copy lines",
  copyPermalink: "Copy permalink",
  noGithubRemote: "No GitHub remote",
  noPermalinkSide: "The selection has no permalink on this side",
  selectionActions: "Selection actions",
  // Log pane
  noActivity: "No activity yet.",
} as const;

export type MsgKey = keyof typeof en;

const ja: Record<MsgKey, string> = {
  emptyPane: "左のドロワーからリポジトリを選択してください。",
  fetch: "フェッチ",
  log: "ログ",
  reload: "再読込",
  settings: "設定",
  theme: "テーマ",
  closeTab: "タブを閉じる",
  settingsButtons: "ボタン",
  buttonsIcon: "アイコン",
  buttonsIconLabel: "アイコン＋ラベル",
  buttonsLabel: "ラベル",
  settingsGraph: "グラフ",
  squashLinksSetting: "squashマージの点線を表示",
  settingsLanguage: "言語",
  langAuto: "自動",
  langEn: "English",
  langJa: "日本語",
  closeSettings: "設定を閉じる",
  paletteHint: "コマンドを入力…",
  paletteEmpty: "一致するコマンドがありません",
  cmdFetch: "リモートをフェッチ",
  cmdReload: "リポジトリを再読込",
  cmdToggleLog: "コマンドログを切替",
  cmdOpenSettings: "設定を開く",
  cmdToggleTheme: "テーマを切替",
  cmdCollapseDrawer: "リポジトリ一覧をたたむ",
  cmdExpandDrawer: "リポジトリ一覧をひらく",
  cmdOpenRepo: "リポジトリを開く: {name}",
  repositories: "リポジトリ",
  addRepoPlaceholder: "リポジトリのパスを追加…",
  browse: "参照",
  add: "追加",
  noRepositories: "リポジトリがありません。",
  removeFromView: "表示から削除",
  collapse: "たたむ",
  expand: "ひらく",
  commitsCount: "{n} コミット",
  copyFullId: "コミットIDをコピー",
  refCopyName: "ブランチ名をコピー",
  refCheckout: "{reference} をチェックアウト",
  refMergeInto: "{branch} へマージ",
  refCheckoutQuestion: "{reference} をチェックアウトしますか？",
  refMergeQuestion: "{reference} を {branch} へマージしますか？",
  yes: "はい",
  cancel: "キャンセル",
  noBranchCheckedOut: "チェックアウト中のブランチがありません",
  openPr: "GitHub で Pull Request #{number} を開く",
  copyTagName: "タグ名をコピー",
  deleteTag: "タグを削除",
  deleteTagQuestion: "タグ {name} を削除しますか？",
  createTag: "タグを作成",
  tagNamePlaceholder: "タグ名…",
  loading: "読み込み中…",
  author: "作者",
  date: "日時",
  signature: "署名",
  parents: "親",
  filesCount: "{n} ファイル",
  fileCount: "{n} ファイル",
  diffAll: "全差分",
  diffAllTitle: "全ファイルの差分を表示",
  flat: "フラット",
  tree: "ツリー",
  noFileChanges: "ファイル変更なし",
  closeDetails: "詳細を閉じる",
  copyKeyId: "署名鍵IDをコピー",
  inline: "インライン",
  split: "分割",
  closeDiff: "差分を閉じる",
  binaryFile: "バイナリファイル — テキスト差分はありません。",
  linesSelected: "{n} 行選択中",
  lineSelected: "{n} 行選択中",
  copyLines: "行をコピー",
  copyPermalink: "パーマリンクをコピー",
  noGithubRemote: "GitHub リモートがありません",
  noPermalinkSide: "この側にはパーマリンクを作れない行が含まれています",
  selectionActions: "選択中の操作",
  noActivity: "まだ何も実行されていません。",
} as const;

export const MESSAGES: Record<Lang, Record<MsgKey, string>> = { en, ja };
