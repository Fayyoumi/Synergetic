import type { ComponentProps, ReactNode } from "react";
import { Link } from "@/i18n/navigation";

type Tone = "tomato" | "sunflower" | "chair" | "ink" | "paper";

const toneClasses: Record<Tone, string> = {
  tomato: "bg-tomato text-cream",
  sunflower: "bg-sunflower text-ink",
  chair: "bg-chair text-ink",
  ink: "bg-ink text-cream",
  paper: "bg-paper text-ink",
};

const sizeClasses = {
  md: "min-h-12 px-5 text-base font-bold",
  lg: "min-h-14 px-6 text-2xl display-text",
  xl: "min-h-16 px-6 text-[1.7rem] display-text",
} as const;

type BaseProps = {
  tone?: Tone;
  size?: keyof typeof sizeClasses;
  selected?: boolean;
  block?: boolean;
  className?: string;
};

function buttonClass({ tone = "sunflower", size = "lg", selected, block, className }: BaseProps) {
  return [
    "inline-flex items-center justify-center gap-2 rounded-[16px] select-none",
    "transition-transform active:translate-y-px disabled:opacity-50 disabled:cursor-not-allowed",
    selected ? "bg-sunflower text-ink ink-border-thick" : `${toneClasses[tone]} ink-border`,
    sizeClasses[size],
    block ? "w-full" : "",
    className ?? "",
  ].join(" ");
}

export function Button({
  tone,
  size,
  selected,
  block,
  className,
  type = "button",
  ...rest
}: BaseProps & ComponentProps<"button">) {
  return (
    <button
      type={type}
      aria-pressed={selected === undefined ? undefined : selected}
      className={buttonClass({ tone, size, selected, block, className })}
      {...rest}
    />
  );
}

export function ButtonLink({
  tone,
  size,
  block,
  className,
  ...rest
}: BaseProps & ComponentProps<typeof Link>) {
  return <Link className={buttonClass({ tone, size, block, className })} {...rest} />;
}

export function Card({
  tone = "paper",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`${toneClasses[tone]} ink-border rounded-[20px] p-4 ${className ?? ""}`}>
      {children}
    </div>
  );
}

/** Kassa's speech bubble. The square corner (bottom, start side) points at Kassa, who sits on the start side. */
export function SpeechBubble({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`bg-paper ink-border px-4 py-3 font-semibold leading-relaxed rounded-[20px] rounded-es-[4px] ${className ?? ""}`}
    >
      {children}
    </div>
  );
}

