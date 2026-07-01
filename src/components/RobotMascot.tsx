// Robot mascots rendered as inline SVG (not <img src>) so the animation is
// driven by index.css keyframes. Keeping the animation out of the .svg files
// avoids an SVG optimizer stripping <style>/class attributes on save.

const HERO_BARS: { x: number; delay: string }[] = [
  { x: 82, delay: '-0.90s' },
  { x: 91, delay: '-0.30s' },
  { x: 100, delay: '-0.60s' },
  { x: 109, delay: '-0.12s' },
  { x: 118, delay: '-0.78s' },
  { x: 127, delay: '-0.45s' },
  { x: 136, delay: '-0.20s' },
  { x: 145, delay: '-0.55s' },
  { x: 154, delay: '-0.85s' },
]

const TYPING_BARS: { x: number; delay: string }[] = [
  { x: 30, delay: '-0.90s' },
  { x: 39, delay: '-0.25s' },
  { x: 48, delay: '-0.65s' },
  { x: 57, delay: '-0.10s' },
  { x: 66, delay: '-0.80s' },
  { x: 75, delay: '-0.40s' },
  { x: 84, delay: '-0.55s' },
]

export function RobotHero({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 300" className={className} aria-hidden="true">
      {/* antenna + note move as one rigid unit */}
      <g className="robot-note">
        <line x1="120" y1="88" x2="120" y2="72" stroke="#1db954" strokeWidth="5" strokeLinecap="round" />
        <path d="M120 72 V42" stroke="#1db954" strokeWidth="5" strokeLinecap="round" />
        <path d="M120 42 c10 1 16 7 15 16" fill="none" stroke="#1db954" strokeWidth="5" strokeLinecap="round" />
        <ellipse cx="111" cy="72" rx="10" ry="7.5" fill="#1db954" transform="rotate(-18 111 72)" />
      </g>
      <rect x="42" y="120" width="8" height="34" rx="4" fill="#159443" />
      <rect x="190" y="120" width="8" height="34" rx="4" fill="#159443" />
      <rect x="48" y="86" width="144" height="116" rx="22" fill="#1db954" />
      <rect x="60" y="104" width="120" height="64" rx="14" fill="#08130c" />
      {HERO_BARS.map((b) => (
        <rect
          key={b.x}
          className="robot-eq"
          x={b.x}
          y="120"
          width="5"
          height="38"
          rx="2.5"
          fill="#5be59a"
          style={{ animationDelay: b.delay }}
        />
      ))}
      <rect x="108" y="202" width="24" height="10" rx="5" fill="#159443" />
      <rect x="70" y="210" width="100" height="32" rx="13" fill="#1db954" />
      <rect x="100" y="222" width="6" height="8" rx="3" fill="#08130c" />
      <rect x="110" y="217" width="6" height="14" rx="3" fill="#08130c" />
      <rect x="120" y="220" width="6" height="10" rx="3" fill="#08130c" />
      <rect x="130" y="216" width="6" height="15" rx="3" fill="#08130c" />
      <rect x="140" y="223" width="6" height="8" rx="3" fill="#08130c" />
      <rect x="82" y="242" width="28" height="12" rx="6" fill="#159443" />
      <rect x="130" y="242" width="28" height="12" rx="6" fill="#159443" />
    </svg>
  )
}

export function RobotTyping({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden="true">
      <g className="robot-note">
        <line x1="60" y1="30" x2="60" y2="22" stroke="#1db954" strokeWidth="4" strokeLinecap="round" />
        <path d="M60 21 V8" stroke="#1db954" strokeWidth="4" strokeLinecap="round" />
        <path d="M60 8 c6 1 9 4 8 9" fill="none" stroke="#1db954" strokeWidth="4" strokeLinecap="round" />
        <ellipse cx="55" cy="21" rx="6" ry="4.5" fill="#1db954" transform="rotate(-18 55 21)" />
      </g>
      <rect x="8" y="56" width="8" height="22" rx="4" fill="#159443" />
      <rect x="104" y="56" width="8" height="22" rx="4" fill="#159443" />
      <rect x="14" y="30" width="92" height="74" rx="18" fill="#1db954" />
      <rect x="26" y="44" width="68" height="40" rx="10" fill="#08130c" />
      {TYPING_BARS.map((b) => (
        <rect
          key={b.x}
          className="robot-eq"
          x={b.x}
          y="50"
          width="5"
          height="30"
          rx="2.5"
          fill="#5be59a"
          style={{ animationDelay: b.delay }}
        />
      ))}
    </svg>
  )
}
