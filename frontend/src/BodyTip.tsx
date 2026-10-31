import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { MessageBody } from "./MessageBody";

/** How long the pointer rests on a row before its body is asked for. */
const BODY_TIP_DELAY_MS = 400;

/** The gap between the pointer and the tip, and the tip and the window. */
const BODY_TIP_GAP = 12;

interface Shown {
  id: string;
  body: string;
  x: number;
  y: number;
}

/** A popup with the message body of the row the pointer rests on. Rows
 *  spread `rowProps(id)`; `tip` is rendered once. A commit without a body
 *  shows nothing, and each body is asked for once per card (ADR 0067). */
export function useBodyTip(load: (commitId: string) => Promise<string>) {
  const bodies = useRef(new Map<string, string>());
  const pointer = useRef({ x: 0, y: 0 });
  const hovered = useRef<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const [shown, setShown] = useState<Shown | null>(null);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const show = (id: string, body: string) => {
    if (hovered.current !== id || !body) return;
    setShown({ id, body, ...pointer.current });
  };

  const rowProps = (id: string) => ({
    onMouseEnter: (e: React.MouseEvent) => {
      hovered.current = id;
      pointer.current = { x: e.clientX, y: e.clientY };
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        const known = bodies.current.get(id);
        if (known !== undefined) {
          show(id, known);
          return;
        }
        load(id).then(
          (body) => {
            bodies.current.set(id, body);
            show(id, body);
          },
          () => undefined,
        );
      }, BODY_TIP_DELAY_MS);
    },
    onMouseMove: (e: React.MouseEvent) => {
      pointer.current = { x: e.clientX, y: e.clientY };
    },
    onMouseLeave: () => {
      hovered.current = null;
      window.clearTimeout(timer.current);
      setShown(null);
    },
  });

  return { rowProps, tip: shown && <BodyTip shown={shown} /> };
}

/** Below and right of the pointer, moved above or left of it where the
 *  window would cut it off. */
function BodyTip({ shown }: { shown: Shown }) {
  const ref = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState({
    left: shown.x + BODY_TIP_GAP,
    top: shown.y + BODY_TIP_GAP,
  });
  useLayoutEffect(() => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    const below = shown.y + BODY_TIP_GAP;
    const top =
      below + box.height + BODY_TIP_GAP > window.innerHeight
        ? Math.max(BODY_TIP_GAP, shown.y - BODY_TIP_GAP - box.height)
        : below;
    const left = Math.max(
      BODY_TIP_GAP,
      Math.min(
        shown.x + BODY_TIP_GAP,
        window.innerWidth - BODY_TIP_GAP - box.width,
      ),
    );
    setPlace({ left, top });
  }, [shown]);
  return (
    <div className="body-tip" data-testid="body-tip" ref={ref} style={place}>
      <MessageBody body={shown.body} />
    </div>
  );
}
