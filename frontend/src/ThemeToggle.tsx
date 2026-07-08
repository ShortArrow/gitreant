import { applyTheme, coverRadius, currentTheme, toggleTheme } from "./theme";

type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => void) => { ready: Promise<void> };
};

/**
 * Toggle light/dark with a circular reveal that expands from the button
 * (skipped when the View Transition API is unavailable or motion is reduced).
 */
export function ThemeToggle() {
  const onClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    const apply = () => applyTheme(toggleTheme(currentTheme()));
    const doc = document as ViewTransitionDocument;
    const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (!doc.startViewTransition || reduceMotion) {
      apply();
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const radius = coverRadius(x, y, window.innerWidth, window.innerHeight);

    doc.startViewTransition(apply).ready.then(() => {
      document.documentElement.animate(
        {
          clipPath: [
            `circle(0px at ${x}px ${y}px)`,
            `circle(${radius}px at ${x}px ${y}px)`,
          ],
        },
        {
          duration: 400,
          easing: "ease-in-out",
          pseudoElement: "::view-transition-new(root)",
        },
      );
    });
  };

  return (
    <button
      className="theme-toggle"
      type="button"
      aria-label="テーマ切り替え"
      data-testid="theme-toggle"
      onClick={onClick}
    >
      <span className="sun">☀️</span>
      <span className="moon">🌙</span>
    </button>
  );
}
