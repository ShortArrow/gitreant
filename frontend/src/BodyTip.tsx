import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { bodyCache } from "./bodyCache";
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
  const latestLoad = useRef(load);
  latestLoad.current = load;
  const [bodyOf] = useState(() => bodyCache((id) => latestLoad.current(id)));
  const pointer = useRef({ x: 0, y: 0 });
  const rest = useRef(0);
  const timer = useRef<number | undefined>(undefined);
  const [shown, setShown] = useState<Shown | null>(null);

  useEffect(
    () => () => {
      rest.current += 1;
      window.clearTimeout(timer.current);
    },
    [],
  );

  const rowProps = (id: string) => ({
    onMouseEnter: (e: React.MouseEvent) => {
      const thisRest = ++rest.current;
      pointer.current = { x: e.clientX, y: e.clientY };
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        bodyOf(id).then(
          (body) => {
            if (rest.current !== thisRest || !body) return;
            setShown({ id, body, ...pointer.current });
          },
          () => undefined,
        );
      }, BODY_TIP_DELAY_MS);
    },
    onMouseMove: (e: React.MouseEvent) => {
      pointer.current = { x: e.clientX, y: e.clientY };
    },
    onMouseLeave: () => {
      rest.current += 1;
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
