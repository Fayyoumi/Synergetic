const BULB_COLOURS = ["#E8412C", "#FFC93C", "#12A6A0", "#2E8B57"] as const;
const INK = "#2B1B17";

type Props = {
  /** "phone" draws 2 sags (390 wide); "wide" draws 4 sags for host screens. */
  variant?: "phone" | "wide";
  className?: string;
};

const TOP = 6;
const SAG = 30; // control-point depth; the wire's lowest point is TOP + SAG / 2

/** Point on the sagging wire, t in [0, 1] along one segment. */
function wireY(t: number): number {
  return TOP + 2 * SAG * t * (1 - t);
}

/**
 * Decorative wedding string lights: a sagging wire with coloured bulbs.
 * Bulbs hang at the quarter points of each sag so they follow the curve.
 */
export function WeddingLights({ variant = "phone", className }: Props) {
  const segments = variant === "wide" ? 4 : 2;
  const segmentWidth = 195;
  const width = segments * segmentWidth;

  let wire = `M0 ${TOP}`;
  const bulbs: { x: number; y: number; colour: string }[] = [];
  for (let s = 0; s < segments; s++) {
    const x0 = s * segmentWidth;
    wire += ` Q${x0 + segmentWidth / 2} ${TOP + SAG} ${x0 + segmentWidth} ${TOP}`;
    for (const t of [0.25, 0.5, 0.75]) {
      bulbs.push({
        x: x0 + segmentWidth * t,
        y: wireY(t),
        colour: BULB_COLOURS[bulbs.length % BULB_COLOURS.length],
      });
    }
  }

  return (
    <svg
      viewBox={`0 0 ${width} 50`}
      className={`block w-full h-auto ${className ?? ""}`}
      aria-hidden="true"
      focusable="false"
    >
      <path d={wire} fill="none" stroke={INK} strokeWidth="2" />
      <g stroke={INK} strokeWidth="2">
        {bulbs.map((b) => (
          <g key={`${b.x}`}>
            <line x1={b.x} y1={b.y} x2={b.x} y2={b.y + 5} />
            <ellipse cx={b.x} cy={b.y + 13} rx="6" ry="8" fill={b.colour} />
          </g>
        ))}
      </g>
    </svg>
  );
}
