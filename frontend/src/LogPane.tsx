import { useState } from "react";
import { CopyAllIcon, CopyIcon, WrapIcon } from "./Icons";
import { LabeledButton } from "./LabeledButton";
import type { LogItem } from "./logModel";
import { HeightResizeHandle, useStoredWidth } from "./Resizer";
import { useT } from "./settings";

const WRAP_KEY = "gitreant-log-wrap";

function storedLogWrap(): boolean {
  try {
    return localStorage.getItem(WRAP_KEY) === "on";
  } catch {
    return false;
  }
}

function storeLogWrap(on: boolean) {
  try {
    localStorage.setItem(WRAP_KEY, on ? "on" : "off");
  } catch {
    // localStorage may be unavailable; the state change alone is enough.
  }
}

function copyText(text: string) {
  navigator.clipboard?.writeText(text).catch(() => {});
}

/** The one-line, copy-friendly form of an entry: time, text, and any error. */
function entryLine(item: LogItem): string {
  const time = new Date(item.time * 1000).toLocaleTimeString();
  const message = !item.ok && item.message ? `  ${item.message}` : "";
  return `${time}  ${item.text}${message}`;
}

/** Bottom pane listing user actions and the external commands the server
 * executed, newest first. Toggled from the top bar. Its height is drag-resizable,
 * long lines wrap or truncate (with a tooltip) per the wrap toggle, and entries
 * copy individually or all at once. */
export function LogPane({ items }: { items: LogItem[] }) {
  const t = useT();
  const [height, setHeight] = useStoredWidth("gitreant-log-height", 180, 90, 600);
  const [wrap, setWrap] = useState(storedLogWrap);
  const toggleWrap = () => {
    setWrap((on) => {
      storeLogWrap(!on);
      return !on;
    });
  };

  const ordered = [...items].reverse();

  return (
    <div className="log-pane" data-testid="log-pane" style={{ height }}>
      <HeightResizeHandle
        height={height}
        onHeight={setHeight}
        label={t("resizeLog")}
        testId="log-resize"
      />
      <div className="log-toolbar">
        <LabeledButton
          icon={<WrapIcon />}
          label={t("logWrap")}
          testId="log-wrap-toggle"
          className="log-tool"
          active={wrap}
          onClick={toggleWrap}
        />
        <LabeledButton
          icon={<CopyAllIcon />}
          label={t("copyAll")}
          testId="log-copy-all"
          className="log-tool"
          disabled={ordered.length === 0}
          onClick={() => copyText(ordered.map(entryLine).join("\n"))}
        />
      </div>

      {items.length === 0 && <p className="log-empty">{t("noActivity")}</p>}
      <ul className={`log-entries${wrap ? " log-wrap" : ""}`}>
        {ordered.map((item, i) => (
          <li
            key={`${item.time}-${i}`}
            className={`log-entry${item.ok ? "" : " log-entry-error"}${
              item.kind === "action" ? " log-entry-action" : ""
            }`}
            data-testid="log-entry"
          >
            <span className="log-time">
              {new Date(item.time * 1000).toLocaleTimeString()}
            </span>
            <span className="log-command" title={wrap ? undefined : item.text}>
              {item.text}
            </span>
            {!item.ok && item.message && (
              <span
                className="log-message"
                title={wrap ? undefined : item.message}
              >
                {item.message}
              </span>
            )}
            <button
              type="button"
              className="log-copy"
              title={t("copyLine")}
              aria-label={t("copyLine")}
              data-testid="log-copy"
              onClick={() => copyText(entryLine(item))}
            >
              <CopyIcon />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
