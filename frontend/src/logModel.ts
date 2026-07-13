import type { CommandLogEntry } from "./api";

/** A UI interaction recorded on the client, purely as feedback to the user. */
export interface UserAction {
  /** Unix seconds. */
  time: number;
  text: string;
}

/** One row of the log pane: a server-executed command or a user action. */
export interface LogItem {
  time: number;
  kind: "command" | "action";
  text: string;
  ok: boolean;
  message?: string;
}

/** Interleave server commands and user actions by time, oldest first.
 *
 * On a tie the action comes first: the interaction is what triggered the
 * command, so it reads naturally above it once the pane reverses the list.
 */
export function mergeLog(
  commands: CommandLogEntry[],
  actions: UserAction[],
): LogItem[] {
  const items: LogItem[] = [
    ...actions.map((a) => ({
      time: a.time,
      kind: "action" as const,
      text: a.text,
      ok: true,
    })),
    ...commands.map((c) => ({
      time: c.time,
      kind: "command" as const,
      text: c.command,
      ok: c.ok,
      message: c.message || undefined,
    })),
  ];
  return items.sort(
    (a, b) =>
      a.time - b.time ||
      (a.kind === b.kind ? 0 : a.kind === "action" ? -1 : 1),
  );
}
