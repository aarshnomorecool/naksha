export function CampusSketch() {
  return (
    <svg viewBox="0 0 320 220" className="h-full w-full">
      <defs>
        <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke="var(--border)" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="320" height="220" fill="url(#grid)" />

      {/* buildings */}
      <rect x="28" y="34" width="70" height="46" fill="var(--accent)" stroke="var(--primary)" strokeWidth="1.5" />
      <rect x="120" y="20" width="46" height="60" fill="var(--accent)" stroke="var(--primary)" strokeWidth="1.5" />
      <rect x="190" y="46" width="90" height="38" fill="var(--accent)" stroke="var(--primary)" strokeWidth="1.5" />
      <rect x="48" y="120" width="58" height="40" fill="var(--accent)" stroke="var(--primary)" strokeWidth="1.5" />
      <rect x="150" y="130" width="80" height="52" fill="var(--accent)" stroke="var(--primary)" strokeWidth="1.5" />

      {/* route */}
      <path
        d="M40 100 C 90 95, 110 150, 160 155 S 250 110, 270 95"
        fill="none"
        stroke="var(--primary)"
        strokeWidth="1.5"
        strokeDasharray="5 5"
        opacity="0.7"
      />
      <circle cx="110" cy="150" r="4" fill="var(--primary)" />
      <circle cx="230" cy="102" r="4" fill="var(--primary)" />

      {/* corner ticks */}
      {[
        [10, 10, 1],
        [310, 10, -1],
        [10, 210, 1],
        [310, 210, -1],
      ].map(([x, y, dir], i) => (
        <g key={i} stroke="var(--muted-foreground)" strokeWidth="1.5">
          <line x1={x} y1={y} x2={Number(x) + 10 * Number(dir)} y2={y} />
          <line x1={x} y1={y} x2={x} y2={Number(y) + (y === 10 ? 10 : -10)} />
        </g>
      ))}
    </svg>
  )
}
