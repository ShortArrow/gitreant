import { useEffect, useMemo, useRef, useState } from "react";
import { filterCommands, type PaletteCommand } from "./palette";
import { useT } from "./settings";

/** GitHub-style command palette: type to filter, arrows to move, Enter to
 * run. The caller owns the open state and the command list. */
export function CommandPalette({
  commands,
  onClose,
}: {
  commands: PaletteCommand[];
  onClose: () => void;
}) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const matches = useMemo(
    () => filterCommands(commands, query),
    [commands, query],
  );
  const active = Math.min(cursor, Math.max(0, matches.length - 1));

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const run = (command: PaletteCommand | undefined) => {
    if (!command) return;
    onClose();
    command.run();
  };

  return (
    <div
      className="modal-backdrop modal-backdrop-top"
      onMouseDown={onClose}
    >
      <div
        className="palette"
        data-testid="command-palette"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          data-testid="palette-input"
          placeholder={t("paletteHint")}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setCursor(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setCursor((c) => Math.min(c + 1, matches.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setCursor((c) => Math.max(c - 1, 0));
            } else if (e.key === "Enter") {
              run(matches[active]);
            }
          }}
        />
        <ul className="palette-list">
          {matches.map((command, i) => (
            <li key={command.id}>
              <button
                type="button"
                data-testid="palette-item"
                className={i === active ? "active" : ""}
                onMouseEnter={() => setCursor(i)}
                onClick={() => run(command)}
              >
                {command.title}
              </button>
            </li>
          ))}
          {matches.length === 0 && (
            <li className="palette-empty">{t("paletteEmpty")}</li>
          )}
        </ul>
      </div>
    </div>
  );
}
