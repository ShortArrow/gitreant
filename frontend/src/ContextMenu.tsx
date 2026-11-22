import { useDismiss } from "./dismiss";

export interface MenuItem {
  /** Also the rendered button's data-testid. */
  id: string;
  label: string;
  run: () => void;
}

/** A minimal floating context menu (tabs, drawer items): one button per
 * item, closing on outside click or Escape like the other menus. */
export function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}) {
  useDismiss(onClose);

  return (
    <div
      className="ctx-menu"
      data-testid="context-menu"
      style={{ left: x, top: y }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          data-testid={item.id}
          onClick={() => {
            item.run();
            onClose();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
