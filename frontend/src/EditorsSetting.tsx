import { useEffect, useState } from "react";
import { fetchEditors, saveEditors, type Editor } from "./api";
import { formatArgs, parseArgs } from "./editorArgs";
import { useT } from "./settings";

/** An editor as the settings edit it: its arguments as one line. */
interface EditorRow {
  name: string;
  program: string;
  args: string;
}

/**
 * The editors a file opens with (ADR 0062), kept in the server's
 * configuration: a row per editor with its name, program and arguments,
 * where `{path}` and `{line}` are filled in, saved to the server at once.
 */
export function EditorsSetting({
  load = fetchEditors,
  save = saveEditors,
}: {
  /** Injectable for Storybook; defaults to the real API. */
  load?: () => Promise<Editor[]>;
  save?: (list: Editor[]) => Promise<void>;
}) {
  const t = useT();
  const [rows, setRows] = useState<EditorRow[]>([]);
  const [status, setStatus] = useState<"saved" | string | null>(null);

  useEffect(() => {
    load()
      .then((list) =>
        setRows(list.map((e) => ({ ...e, args: formatArgs(e.args) }))),
      )
      .catch((e) => setStatus(String(e)));
  }, [load]);

  const change = (index: number, field: keyof EditorRow, value: string) => {
    setStatus(null);
    setRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)),
    );
  };

  const submit = async () => {
    const list = rows
      .filter((row) => row.name.trim() && row.program.trim())
      .map((row) => ({
        name: row.name.trim(),
        program: row.program.trim(),
        args: parseArgs(row.args),
      }));
    try {
      await save(list);
      setStatus("saved");
    } catch (e) {
      setStatus(String(e));
    }
  };

  return (
    <fieldset className="settings-group editors-setting">
      <legend>{t("settingsEditors")}</legend>
      <p className="settings-note">{t("editorsHint")}</p>
      {rows.map((row, i) => (
        <div key={i} className="editor-row" data-testid="editor-row">
          <input
            type="text"
            placeholder={t("editorName")}
            aria-label={t("editorName")}
            data-testid="editor-name"
            value={row.name}
            onChange={(e) => change(i, "name", e.target.value)}
          />
          <input
            type="text"
            placeholder={t("editorProgram")}
            aria-label={t("editorProgram")}
            data-testid="editor-program"
            value={row.program}
            onChange={(e) => change(i, "program", e.target.value)}
          />
          <input
            type="text"
            placeholder={t("editorArgs")}
            aria-label={t("editorArgs")}
            data-testid="editor-args"
            value={row.args}
            onChange={(e) => change(i, "args", e.target.value)}
          />
          <button
            type="button"
            className="icon-btn"
            title={t("editorRemove")}
            aria-label={t("editorRemove")}
            data-testid="editor-remove"
            onClick={() => {
              setStatus(null);
              setRows((prev) => prev.filter((_, j) => j !== i));
            }}
          >
            ×
          </button>
        </div>
      ))}
      <div className="editor-actions">
        <button
          type="button"
          data-testid="editor-add"
          onClick={() =>
            setRows((prev) => [...prev, { name: "", program: "", args: "" }])
          }
        >
          {t("editorAdd")}
        </button>
        <button
          type="button"
          data-testid="editors-save"
          onClick={() => void submit()}
        >
          {t("editorsSave")}
        </button>
        {status === "saved" && (
          <span className="settings-note" data-testid="editors-saved">
            {t("editorsSaved")}
          </span>
        )}
        {status && status !== "saved" && (
          <span className="detail-error">{status}</span>
        )}
      </div>
    </fieldset>
  );
}
