// Fixed, non-interactive tennis-themed backdrop. Very low contrast so it never
// competes with content. Sits behind everything (z-index:-1 inside #root).
export function BgDecor() {
  return (
    <div className="bg-decor" aria-hidden>
      <svg viewBox="0 0 1440 1024" preserveAspectRatio="xMidYMid slice">
        {/* perspective court, lower-right, running off the bottom */}
        <g
          className="court"
          transform="translate(760 250)"
        >
          {/* outer (doubles) */}
          <path d="M-140 0 L340 0 L620 760 L-420 760 Z" />
          {/* singles sidelines */}
          <path d="M-70 0 L270 0 L470 760 L-270 760 Z" />
          {/* net */}
          <path d="M-190 130 L390 130" />
          <path d="M-190 130 L390 130" strokeDasharray="2 10" />
          {/* service line */}
          <path d="M-4 320 L302 320" />
          {/* centre service line */}
          <path d="M149 130 L149 320" />
          {/* baseline centre mark */}
          <path d="M25 760 L25 735" />
        </g>

        {/* big tennis ball, lower-left, mostly off-canvas */}
        <g className="ball" transform="translate(90 880)">
          <circle r="240" />
          <path d="M-240 0 A 240 240 0 0 1 60 -232" />
          <path d="M60 -232 A 360 360 0 0 1 240 40" />
        </g>

        {/* faint swing arc, upper area */}
        <path className="arc" d="M1080 90 Q 1260 250 1180 470" strokeDasharray="3 14" />
        <circle className="arc-dot" cx="1080" cy="90" r="5" />
      </svg>
    </div>
  );
}
