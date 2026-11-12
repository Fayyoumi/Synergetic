import { useId } from "react";

export const kassaExpressions = [
  "neutral",
  "cheeky",
  "shocked",
  "laughing",
  "sad",
] as const;
export type KassaExpression = (typeof kassaExpressions)[number];

type Face = {
  browLeft: string;
  browRight: string;
  pupils: { left: [number, number]; right: [number, number]; r: number };
  mouth:
    | { kind: "fill"; d: string }
    | { kind: "stroke"; d: string }
    | { kind: "oval"; cx: number; cy: number; rx: number; ry: number };
};

const INK = "#2B1B17";

// "cheeky" is the original artwork; the others vary brows, pupils and mouth only.
const faces: Record<KassaExpression, Face> = {
  cheeky: {
    browLeft: "M74 106 Q84 98 96 104",
    browRight: "M105 108 Q115 105 126 110",
    pupils: { left: [88, 126], right: [116, 126], r: 4 },
    mouth: { kind: "fill", d: "M86 152 Q100 172 114 152 Z" },
  },
  neutral: {
    browLeft: "M76 105 Q86 100 96 104",
    browRight: "M104 104 Q114 100 124 105",
    pupils: { left: [86, 125], right: [114, 125], r: 4 },
    mouth: { kind: "stroke", d: "M89 157 Q100 162 111 157" },
  },
  shocked: {
    browLeft: "M74 100 Q85 89 96 97",
    browRight: "M104 97 Q115 89 126 100",
    pupils: { left: [86, 124], right: [114, 124], r: 3 },
    mouth: { kind: "oval", cx: 100, cy: 159, rx: 7, ry: 9 },
  },
  laughing: {
    browLeft: "M74 103 Q84 95 96 101",
    browRight: "M104 101 Q116 95 126 103",
    pupils: { left: [86, 121], right: [114, 121], r: 4 },
    mouth: { kind: "fill", d: "M82 150 Q100 182 118 150 Z" },
  },
  sad: {
    browLeft: "M76 108 Q86 102 96 99",
    browRight: "M104 99 Q114 102 124 108",
    pupils: { left: [86, 128], right: [114, 128], r: 4 },
    mouth: { kind: "stroke", d: "M88 162 Q100 151 112 162" },
  },
};

const GLASS =
  "M60 60 C55 100 75 120 70 150 C66 180 72 205 100 205 C128 205 134 180 130 150 C125 120 145 100 140 60 Z";

type Props = {
  mood?: KassaExpression;
  /** Rendered height in px; width follows the 200:240 artwork ratio. */
  size?: number;
  /** Accessible name from translations. Omit when Kassa is purely decorative. */
  label?: string;
  className?: string;
};

export function Kassa({ mood = "cheeky", size = 120, label, className }: Props) {
  // useId keeps the clipPath id unique when several Kassas share a page.
  const clipId = `kassa-glass-${useId().replace(/:/g, "")}`;
  const face = faces[mood];
  const decorative = !label;

  return (
    <svg
      viewBox="0 0 200 240"
      width={(size * 200) / 240}
      height={size}
      className={className}
      data-mood={mood}
      {...(decorative
        ? { "aria-hidden": true }
        : { role: "img", "aria-label": label })}
    >
      <defs>
        <clipPath id={clipId}>
          <path d={GLASS} />
        </clipPath>
      </defs>
      <g fill="none" stroke={INK} strokeWidth="5" strokeLinecap="round">
        <path d="M85 44 C75 34 95 24 85 12" />
        <path d="M100 44 C90 31 110 21 100 6" />
        <path d="M115 44 C105 34 125 24 115 12" />
      </g>
      <ellipse cx="100" cy="214" rx="72" ry="14" fill="#12A6A0" stroke={INK} strokeWidth="5" />
      <path d={GLASS} fill="#FFFDF7" />
      <rect x="40" y="92" width="120" height="120" fill="#D9541E" clipPath={`url(#${clipId})`} />
      <path d={GLASS} fill="none" stroke={INK} strokeWidth="5" strokeLinejoin="round" />
      <ellipse cx="100" cy="60" rx="40" ry="8" fill="#FFFDF7" stroke={INK} strokeWidth="5" />
      <path d="M72 76 C69 92 73 104 71 116" stroke="#FFFFFF" strokeWidth="4" fill="none" strokeLinecap="round" />
      <circle cx="86" cy="124" r="10" fill="#FFFFFF" stroke={INK} strokeWidth="4" />
      <circle cx="114" cy="124" r="10" fill="#FFFFFF" stroke={INK} strokeWidth="4" />
      <circle cx={face.pupils.left[0]} cy={face.pupils.left[1]} r={face.pupils.r} fill={INK} />
      <circle cx={face.pupils.right[0]} cy={face.pupils.right[1]} r={face.pupils.r} fill={INK} />
      <path d={face.browLeft} stroke={INK} strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d={face.browRight} stroke={INK} strokeWidth="5" fill="none" strokeLinecap="round" />
      {/* Moustache: the same in every expression. */}
      <path d="M84 142 Q92 135 100 141 Q108 135 116 142 Q108 147 100 144 Q92 147 84 142 Z" fill={INK} />
      {face.mouth.kind === "fill" && <path d={face.mouth.d} fill={INK} />}
      {face.mouth.kind === "stroke" && (
        <path d={face.mouth.d} stroke={INK} strokeWidth="5" fill="none" strokeLinecap="round" />
      )}
      {face.mouth.kind === "oval" && (
        <ellipse cx={face.mouth.cx} cy={face.mouth.cy} rx={face.mouth.rx} ry={face.mouth.ry} fill={INK} />
      )}
    </svg>
  );
}
