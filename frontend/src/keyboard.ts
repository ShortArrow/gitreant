/** Whether something other than the page's own shortcuts has the keyboard:
 * a text field has focus, or a menu, dialog or palette is open. */
export function keyboardTaken(): boolean {
  const active = document.activeElement;
  if (
    active instanceof HTMLInputElement ||
    active instanceof HTMLTextAreaElement ||
    active instanceof HTMLSelectElement ||
    (active instanceof HTMLElement && active.isContentEditable)
  ) {
    return true;
  }
  return document.querySelector(".ctx-menu, .modal-backdrop") !== null;
}
