import type { ComponentProps, ReactNode } from "react";

const tones = {
  sunflower: "bg-sunflower text-ink",
  chair: "bg-chair text-ink",
  tomato: "bg-tomato text-cream",
  ink: "bg-ink text-sunflower",
  paper: "bg-paper text-ink",
} as const;
export type ChipTone = keyof typeof tones;

/** Static label chip. */
export function Chip({ tone = "paper", children, className }: { tone?: ChipTone; children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full ink-border px-3 py-1 text-sm font-bold ${tones[tone]} ${className ?? ""}`}>
      {children}
    </span>
  );
}

/** Toggle chip (multi-select). Selected = sunflower fill + thick ink border, and aria-pressed. */
export function ToggleChip({ pressed, className, ...rest }: { pressed: boolean } & ComponentProps<"button">) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      className={`min-h-11 rounded-full px-4 font-semibold ${
        pressed ? "bg-sunflower ink-border-thick px-[14px]" : "bg-paper ink-border"
      } ${className ?? ""}`}
      {...rest}
    />
  );
}

/** Chip colours for question difficulty (spec: chair = medium, tomato = hard, ink = legend). */
export const difficultyTone: Record<"easy" | "medium" | "hard" | "legend", ChipTone> = {
  easy: "paper",
  medium: "chair",
  hard: "tomato",
  legend: "ink",
};
