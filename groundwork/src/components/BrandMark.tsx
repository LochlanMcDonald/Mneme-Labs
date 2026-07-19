type Props = {
  className?: string;
  /** When set, the mark is exposed to assistive tech with this label. */
  title?: string;
};

/**
 * The Groundwork mark: three stacked courses building up from a wide base,
 * the "foundation" idea the brand is named for. Sizes to the surrounding
 * font (width/height are 1em), so it can drop in anywhere the wordmark
 * appears. Colors are baked in so it renders the same on any background.
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
      <rect x="39" y="20" width="22" height="15" rx="7" fill="#3ecf8e" />
      <rect x="29" y="42.5" width="42" height="15" rx="7" fill="#7fa8ff" />
      <rect x="15" y="65" width="70" height="16" rx="8" fill="#4f8cff" />
    </svg>
  );
}
