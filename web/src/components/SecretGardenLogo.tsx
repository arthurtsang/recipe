/** Secret Garden identity mark — same pattern as Sageboard SageLogo.
 * `badge` = dusk tile + white leaf/table (favicon / standalone).
 * `mark` = white glyph only, follows currentColor (header lockup).
 */
const MARK_SRC =
  'data:image/png;base64,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';

export function SecretGardenLogo({
  size = 32,
  variant = 'badge',
}: {
  size?: number;
  variant?: 'badge' | 'mark';
}) {
  const mark = variant === 'mark';
  const glyph = (
    <img
      src={MARK_SRC}
      alt=""
      width={mark ? size : Math.round(size * 0.72)}
      height={mark ? size : Math.round(size * 0.72)}
      style={{ display: 'block', objectFit: 'contain' }}
    />
  );

  if (mark) {
    return glyph;
  }

  return (
    <span
      style={{
        display: 'grid',
        placeItems: 'center',
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.1556),
        background: '#36274C',
        flexShrink: 0,
      }}
      aria-hidden
    >
      {glyph}
    </span>
  );
}
