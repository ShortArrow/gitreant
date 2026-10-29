import { useEffect, useState } from "react";
import { fetchEditors, type EditorList } from "./api";
import { formatArgs } from "./editorArgs";
import { useT } from "./settings";

/**
 * The editors a file opens with (ADR 0062), as the server's configuration
 * lists them. Read only: the page may run the programs listed but never
 * choose them, so the list is written with `gitreant editor` or by hand.
 */
export function EditorsSetting({
  load = fetchEditors,
}: {
  /** Injectable for Storybook; defaults to the real API. */
  load?: () => Promise<EditorList>;
}) {
  const t = useT();
  const [list, setList] = useState<EditorList | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    load()
      .then(setList)
      .catch((e) => setError(String(e)));
  }, [load]);

  return (
    <fieldset
      className="settings-group editors-setting"
      data-testid="editors-setting"
    >
      <legend>{t("settingsEditors")}</legend>
      {error && <span className="detail-error">{error}</span>}
      {list && list.editors.length === 0 && (
        <p className="settings-note">{t("noEditors")}</p>
      )}
      {list?.editors.map((editor, i) => (
        <code key={i} className="editor-row" data-testid="editor-row">
          {editor.name}: {formatArgs([editor.program, ...editor.args])}
        </code>
      ))}
      <p className="settings-note">
        {t("editorsHint")}{" "}
        <code>gitreant editor add &lt;name&gt; &lt;program&gt; [args…]</code>
      </p>
      {list?.file && (
        <p className="settings-note">
          {t("editorsFile")} <code>{list.file}</code>
        </p>
      )}
    </fieldset>
  );
}
