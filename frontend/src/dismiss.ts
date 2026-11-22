import { useEffect, useRef } from "react";

/** Calls `onClose` on Escape or on a mouse press anywhere, for as long as
 * the calling menu is shown. A press inside the menu reaches it only when
 * the menu stops it from going further. The listeners stay subscribed while
 * the menu is shown and call the latest `onClose`: a listener replaced while
 * the browser is still handing out an event misses that event. */
export function useDismiss(onClose: () => void) {
  const latest = useRef(onClose);
  latest.current = onClose;
  useEffect(() => {
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      latest.current();
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", close);
    };
  }, []);
}
