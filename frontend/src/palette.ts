import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

/** One runnable entry of the command palette. */
export interface PaletteCommand {
  id: string;
  title: string;
  run: () => void;
}

/** The palette's command registry: features register their commands next to
 * their implementation with `useCommands`, so a new feature cannot forget
 * the palette without also forgetting its own UI. */
export const CommandRegistryContext = createContext<{
  register: (commands: PaletteCommand[]) => () => void;
}>({
  register: () => () => {},
});

/** Register `commands` while the calling component is mounted. Re-registers
 * when the list identity changes (memoize it with the right deps —
 * typically the translation language and any captured state). */
export function useCommands(commands: PaletteCommand[]) {
  const { register } = useContext(CommandRegistryContext);
  useEffect(() => register(commands), [register, commands]);
}

/** Registry state holder for the provider side. Returns the merged command
 * list (registration order) and the stable `register` function. */
export function useCommandRegistry(): {
  commands: PaletteCommand[];
  register: (commands: PaletteCommand[]) => () => void;
} {
  const [groups, setGroups] = useState<PaletteCommand[][]>([]);
  const register = useMemo(
    () => (commands: PaletteCommand[]) => {
      setGroups((prev) => [...prev, commands]);
      return () => {
        setGroups((prev) => prev.filter((group) => group !== commands));
      };
    },
    [],
  );
  return { commands: groups.flat(), register };
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
