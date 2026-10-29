/** An editor's arguments as one line in the settings (ADR 0062): split on
 * spaces, a double-quoted part kept whole. */
export function parseArgs(line: string): string[] {
  return [...line.matchAll(/"([^"]*)"|(\S+)/g)].map(
    (match) => match[1] ?? match[2],
  );
}

/** The arguments as `parseArgs` reads them back, a part with a space
 * double-quoted. */
export function formatArgs(args: string[]): string {
  return args.map((arg) => (/\s/.test(arg) ? `"${arg}"` : arg)).join(" ");
}
