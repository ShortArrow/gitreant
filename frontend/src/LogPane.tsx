import type { CommandLogEntry } from "./api";

/** Bottom pane listing the external commands the server executed, newest
 * first. Toggled from the top bar. */
export function LogPane({ entries }: { entries: CommandLogEntry[] }) {
  return (
    <div className="log-pane" data-testid="log-pane">
      {entries.length === 0 && (
        <p className="log-empty">No commands executed yet.</p>
      )}
      <ul className="log-entries">
        {[...entries].reverse().map((entry, i) => (
          <li
            key={`${entry.time}-${i}`}
            className={`log-entry${entry.ok ? "" : " log-entry-error"}`}
            data-testid="log-entry"
          >
            <span className="log-time">
              {new Date(entry.time * 1000).toLocaleTimeString()}
            </span>
            <span className="log-command">{entry.command}</span>
            {!entry.ok && <span className="log-message">{entry.message}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
