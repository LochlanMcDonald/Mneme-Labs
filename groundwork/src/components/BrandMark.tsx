type Props = {
  className?: string;
  /** When set, the mark is exposed to assistive tech with this label. */
  title?: string;
  /**
   * Color treatment. "color" (default) is the full cyber palette for dark
   * surfaces; "blue" is a single-hue version for light backgrounds (e.g. the
   * printable report); "white" is a reversed version for photographic or
   * saturated backgrounds.
   */
  variant?: 'color' | 'blue' | 'white';
};

// Each slab has three faces (top, left, right) to fake the isometric lighting.
const FACES: Record<NonNullable<Props['variant']>, { top: string[]; mid: string[]; base: string[] }> = {
  color: {
    top: ['#ffc09a', '#ff8a4c', '#ef6b28'],
    mid: ['#7ce0f2', '#29bcdc', '#1595b8'],
    base: ['#54bcd8', '#0a86ab', '#076780'],
  },
  blue: {
    top: ['#54bcd8', '#0a86ab', '#076780'],
    mid: ['#54bcd8', '#0a86ab', '#076780'],
    base: ['#54bcd8', '#0a86ab', '#076780'],
  },
  white: {
    top: ['#ffffff', 'rgba(255,255,255,0.72)', 'rgba(255,255,255,0.45)'],
    mid: ['#ffffff', 'rgba(255,255,255,0.72)', 'rgba(255,255,255,0.45)'],
    base: ['#ffffff', 'rgba(255,255,255,0.72)', 'rgba(255,255,255,0.45)'],
  },
};

/**
 * The Groundwork mark: three offset slabs stacked into a foundation, drawn
 * isometrically so it reads as a dimensional structure. The palette climbs
 * from a violet base through blue to a cyan top course. It sizes to the
 * surrounding font (width/height are 1em), so it drops in wherever the
 * wordmark appears.
 */
export function BrandMark({ className, title, variant = 'color' }: Props) {
  const f = FACES[variant];
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
      {/* top course */}
      <polygon points="44,22 62,31 44,40 26,31" fill={f.top[0]} />
      <polygon points="26,31 44,40 44,47 26,38" fill={f.top[1]} />
      <polygon points="62,31 44,40 44,47 62,38" fill={f.top[2]} />
      {/* middle course */}
      <polygon points="56,38 74,47 56,56 38,47" fill={f.mid[0]} />
      <polygon points="38,47 56,56 56,63 38,54" fill={f.mid[1]} />
      <polygon points="74,47 56,56 56,63 74,54" fill={f.mid[2]} />
      {/* base course */}
      <polygon points="44,54 62,63 44,72 26,63" fill={f.base[0]} />
      <polygon points="26,63 44,72 44,79 26,70" fill={f.base[1]} />
      <polygon points="62,63 44,72 44,79 62,70" fill={f.base[2]} />
    </svg>
  );
}
