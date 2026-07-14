import { useButtonStyle } from "./settings";

/**
 * An action button whose rendering follows the "Buttons" setting: icon only,
 * icon with label, or label only. The label always stays available to
 * assistive tech and as a tooltip.
 */
export function LabeledButton({
  icon,
  label,
  testId,
  className,
  active,
  disabled,
  type = "button",
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  testId: string;
  className?: string;
  /** Adds the "active" class (toggle groups). */
  active?: boolean;
  disabled?: boolean;
  type?: "button" | "submit";
  onClick?: () => void;
}) {
  const style = useButtonStyle();
  const classes = [className, active ? "active" : null, "labeled-btn"]
    .filter(Boolean)
    .join(" ");
  return (
    <button
      className={classes}
      data-testid={testId}
      title={label}
      aria-label={label}
      disabled={disabled}
      type={type}
      onClick={onClick}
    >
      {style !== "label" && icon}
      {style !== "icon" && <span className="btn-label">{label}</span>}
    </button>
  );
}
