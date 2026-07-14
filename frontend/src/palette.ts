/** One runnable entry of the command palette. */
export interface PaletteCommand {
  id: string;
  title: string;
  run: () => void;
}

/** Case-insensitive substring filter; title-prefix matches rank first.
 * An empty query keeps the full list in its given order. */
export function filterCommands(
  commands: PaletteCommand[],
  query: string,
): PaletteCommand[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return commands;
  const starts: PaletteCommand[] = [];
  const contains: PaletteCommand[] = [];
  for (const command of commands) {
    const title = command.title.toLowerCase();
    if (title.startsWith(needle)) {
      starts.push(command);
    } else if (title.includes(needle)) {
      contains.push(command);
    }
  }
  return [...starts, ...contains];
}
