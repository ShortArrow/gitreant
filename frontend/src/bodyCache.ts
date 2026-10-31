/** `load` wrapped so each commit's body is asked for once: a second ask
 *  while the first is in flight, or after it succeeded, gets the same
 *  answer. A failed ask is forgotten, so the next one asks again. */
export function bodyCache(
  load: (commitId: string) => Promise<string>,
): (commitId: string) => Promise<string> {
  const asked = new Map<string, Promise<string>>();
  return (commitId) => {
    const known = asked.get(commitId);
    if (known) return known;
    const body = load(commitId);
    asked.set(commitId, body);
    body.catch(() => asked.delete(commitId));
    return body;
  };
}
