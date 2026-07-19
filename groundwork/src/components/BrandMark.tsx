type Props = {
  className?: string;
  /** When set, the mark is exposed to assistive tech with this label. */
  title?: string;
};

/**
 * The Groundwork mark: three offset slabs stacked into a foundation, drawn
 * isometrically so it reads as a dimensional structure. The palette climbs
 * from a violet base through blue to a cyan top course. Colors are baked in
 * so it renders the same on any background; it sizes to the surrounding font
 * (width/height are 1em), so it drops in wherever the wordmark appears.
 */
export function BrandMark({ className, title }: Props) {
  return (
    <svg
      className={className}
      viewBox="0 0 100 100"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      {/* top course (cyan) */}
      <polygon points="44,22 62,31 44,40 26,31" fill="#7df3ff" />
      <polygon points="26,31 44,40 44,47 26,38" fill="#22d3ee" />
      <polygon points="62,31 44,40 44,47 62,38" fill="#0e7490" />
      {/* middle course (blue) */}
      <polygon points="56,38 74,47 56,56 38,47" fill="#9ad4ff" />
      <polygon points="38,47 56,56 56,63 38,54" fill="#4f8cff" />
      <polygon points="74,47 56,56 56,63 74,54" fill="#3b5bdb" />
      {/* base course (violet) */}
      <polygon points="44,54 62,63 44,72 26,63" fill="#d3b0ff" />
      <polygon points="26,63 44,72 44,79 26,70" fill="#a855f7" />
      <polygon points="62,63 44,72 44,79 62,70" fill="#7c3aed" />
    </svg>
  );
}
