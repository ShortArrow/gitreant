/** An editor's command line as the settings show it (ADR 0062): its parts
 * joined by spaces, a part with a space double-quoted. */
export function formatArgs(args: string[]): string {
  return args.map((arg) => (/\s/.test(arg) ? `"${arg}"` : arg)).join(" ");
}
