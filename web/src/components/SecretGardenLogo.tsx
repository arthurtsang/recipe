/** Secret Garden identity — same pattern as Sageboard SageLogo.
 * `badge` = dusk tile + white leaf/table.
 * `mark` = glyph only, tinted with currentColor (header lockup).
 */
function MarkGlyph({ fill }: { fill: string }) {
  return (
    <g fill={fill}>
      <rect x="17" y="2" width="3" height="1" />
      <rect x="13" y="3" width="9" height="1" />
      <rect x="11" y="4" width="14" height="1" />
      <rect x="10" y="5" width="16" height="1" />
      <rect x="10" y="6" width="7" height="1" />
      <rect x="18" y="6" width="9" height="1" />
      <rect x="9" y="7" width="3" height="1" />
      <rect x="13" y="7" width="3" height="1" />
      <rect x="17" y="7" width="11" height="1" />
      <rect x="9" y="8" width="3" height="1" />
      <rect x="13" y="8" width="2" height="1" />
      <rect x="16" y="8" width="5" height="1" />
      <rect x="23" y="8" width="6" height="1" />
      <rect x="9" y="9" width="2" height="1" />
      <rect x="12" y="9" width="1" height="1" />
      <rect x="15" y="9" width="2" height="1" />
      <rect x="20" y="9" width="9" height="1" />
      <rect x="8" y="10" width="2" height="1" />
      <rect x="18" y="10" width="11" height="1" />
      <rect x="7" y="11" width="2" height="1" />
      <rect x="11" y="11" width="5" height="1" />
      <rect x="22" y="11" width="8" height="1" />
      <rect x="7" y="12" width="11" height="1" />
      <rect x="19" y="12" width="4" height="1" />
      <rect x="24" y="12" width="7" height="1" />
      <rect x="6" y="13" width="2" height="1" />
      <rect x="14" y="13" width="5" height="1" />
      <rect x="20" y="13" width="5" height="1" />
      <rect x="26" y="13" width="5" height="1" />
      <rect x="5" y="14" width="2" height="1" />
      <rect x="15" y="14" width="5" height="1" />
      <rect x="21" y="14" width="6" height="1" />
      <rect x="28" y="14" width="3" height="1" />
      <rect x="5" y="15" width="1" height="1" />
      <rect x="15" y="15" width="16" height="1" />
      <rect x="4" y="16" width="1" height="1" />
      <rect x="17" y="16" width="14" height="1" />
      <rect x="4" y="17" width="1" height="1" />
      <rect x="20" y="17" width="12" height="1" />
      <rect x="3" y="18" width="2" height="1" />
      <rect x="21" y="18" width="2" height="1" />
      <rect x="31" y="18" width="1" height="1" />
      <rect x="3" y="19" width="1" height="1" />
      <rect x="3" y="20" width="1" height="1" />
      <rect x="3" y="21" width="1" height="1" />
      <rect x="5" y="21" width="1" height="1" />
      <rect x="1" y="22" width="1" height="1" />
      <rect x="3" y="22" width="1" height="1" />
      <rect x="5" y="22" width="1" height="1" />
      <rect x="1" y="23" width="5" height="1" />
      <rect x="10" y="23" width="13" height="1" />
      <rect x="2" y="24" width="3" height="1" />
      <rect x="10" y="24" width="14" height="1" />
      <rect x="2" y="25" width="3" height="1" />
      <rect x="14" y="25" width="5" height="1" />
      <rect x="3" y="26" width="2" height="1" />
      <rect x="8" y="26" width="5" height="1" />
      <rect x="21" y="26" width="4" height="1" />
      <rect x="3" y="27" width="2" height="1" />
      <rect x="8" y="27" width="6" height="1" />
      <rect x="20" y="27" width="6" height="1" />
      <rect x="3" y="28" width="2" height="1" />
      <rect x="7" y="28" width="7" height="1" />
      <rect x="19" y="28" width="7" height="1" />
      <rect x="3" y="29" width="2" height="1" />
      <rect x="7" y="29" width="8" height="1" />
      <rect x="19" y="29" width="7" height="1" />
    </g>
  );
}

export function SecretGardenLogo({
  size = 32,
  variant = 'badge',
}: {
  size?: number;
  variant?: 'badge' | 'mark';
}) {
  const mark = variant === 'mark';
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      width={size}
      height={size}
      aria-hidden
      focusable="false"
      style={{ display: 'block', flexShrink: 0 }}
    >
      {mark ? null : (
        <rect x="0" y="0" width="32" height="32" rx="5" ry="5" fill="#36274C" />
      )}
      <g transform={mark ? undefined : 'translate(16,16) scale(0.78) translate(-16,-16)'}>
        <MarkGlyph fill={mark ? 'currentColor' : '#FFFFFF'} />
      </g>
    </svg>
  );
}
