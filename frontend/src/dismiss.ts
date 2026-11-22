import { useEffect } from "react";

/** Calls `onClose` on Escape or on a mouse press anywhere, for as long as
 * the calling menu is shown. A press inside the menu reaches it only when
 * the menu stops it from going further. */
export function useDismiss(onClose: () => void) {
  useEffect(() => {
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      onClose();
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", close);
    };
  }, [onClose]);
}
