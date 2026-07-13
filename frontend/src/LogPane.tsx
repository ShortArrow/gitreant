import type { LogItem } from "./logModel";

/** Bottom pane listing user actions and the external commands the server
 * executed, newest first. Toggled from the top bar. */
export function LogPane({ items }: { items: LogItem[] }) {
  return (
    <div className="log-pane" data-testid="log-pane">
      {items.length === 0 && <p className="log-empty">No activity yet.</p>}
      <ul className="log-entries">
        {[...items].reverse().map((item, i) => (
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
            <span className="log-command">{item.text}</span>
            {!item.ok && item.message && (
              <span className="log-message">{item.message}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
