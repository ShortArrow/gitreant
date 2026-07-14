/** Hand-rolled 14x14 icons, stroked in the current text color. */

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      className="btn-icon"
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/** One column of full-width lines: the inline diff view. */
export function InlineIcon() {
  return (
    <Icon>
      <path d="M2 3.5h10M2 7h10M2 10.5h10" />
    </Icon>
  );
}

/** Two columns side by side: the split diff view. */
export function SplitIcon() {
  return (
    <Icon>
      <path d="M2 3.5h4M2 7h4M2 10.5h4M8 3.5h4M8 7h4M8 10.5h4" />
    </Icon>
  );
}

/** A plain list: the flat files view. */
export function FlatIcon() {
  return (
    <Icon>
      <path d="M5 3.5h7M5 7h7M5 10.5h7" />
      <path d="M2.5 3.5h.01M2.5 7h.01M2.5 10.5h.01" strokeWidth="2" />
    </Icon>
  );
}

/** Indented branches: the tree files view. */
export function TreeIcon() {
  return (
    <Icon>
      <path d="M3 2.5v8a1 1 0 0 0 1 1h2" />
      <path d="M3 6.5h3" />
      <path d="M8.5 6.5h3.5M8.5 11.5h3.5M6 2.5h6" />
    </Icon>
  );
}

/** Stacked plus and minus: every file's diff at once. */
export function DiffAllIcon() {
  return (
    <Icon>
      <path d="M7 2v5M4.5 4.5h5" />
      <path d="M4.5 10.5h5" />
    </Icon>
  );
}

/** A plus: add a repository. */
export function AddIcon() {
  return (
    <Icon>
      <path d="M7 2.5v9M2.5 7h9" />
    </Icon>
  );
}
