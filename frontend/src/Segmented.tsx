import { useButtonStyle } from "./settings";

/**
 * A choice of one among a few, drawn as touching buttons in a row. Each
 * segment is a radio input laid over its label, so the group keeps a radio
 * group's keyboard and assistive-tech behavior; `${name}-${value}` is each
 * input's test id. When every choice names an icon, the group follows the
 * button style as `LabeledButton` does, the label staying the tooltip.
 */
export function Segmented<T extends string>({
  name,
  value,
  options,
  onChange,
}: {
  name: string;
  value: T;
  options: readonly (
    readonly [T, string] | readonly [T, string, React.ReactNode]
  )[];
  onChange: (value: T) => void;
}) {
  const style = useButtonStyle();
  const iconic = options.every((choice) => choice.length === 3);
  return (
    <div className="segmented">
      {options.map(([option, label, icon]) => (
        <label
          key={option}
          className={`segment${option === value ? " chosen" : ""}`}
          title={iconic ? label : undefined}
        >
          <input
            type="radio"
            name={name}
            data-testid={`${name}-${option}`}
            aria-label={iconic ? label : undefined}
            checked={option === value}
            onChange={() => onChange(option)}
          />
          {iconic && style !== "label" && icon}
          {(!iconic || style !== "icon") && label}
        </label>
      ))}
    </div>
  );
}
