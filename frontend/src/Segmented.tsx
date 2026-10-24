/**
 * A choice of one among a few, drawn as touching buttons in a row. Each
 * segment is a radio input laid over its label, so the group keeps a radio
 * group's keyboard and assistive-tech behavior; `${name}-${value}` is each
 * input's test id.
 */
export function Segmented<T extends string>({
  name,
  value,
  options,
  onChange,
}: {
  name: string;
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="segmented">
      {options.map(([option, label]) => (
        <label
          key={option}
          className={`segment${option === value ? " chosen" : ""}`}
        >
          <input
            type="radio"
            name={name}
            data-testid={`${name}-${option}`}
            checked={option === value}
            onChange={() => onChange(option)}
          />
          {label}
        </label>
      ))}
    </div>
  );
}
