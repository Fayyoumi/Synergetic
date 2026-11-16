import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";

const tones = {
  sunflower: "bg-sunflower text-ink",
  chair: "bg-chair text-ink",
  tomato: "bg-tomato text-cream",
  ink: "bg-ink text-cream",
  paper: "bg-paper text-ink",
} as const;

type Props = {
  name: string;
  meta: string;
  tag: string;
  tone: keyof typeof tones;
  href?: string;
  /** Shown instead of the link when the game isn't playable yet. */
  disabled?: boolean;
  extra?: ReactNode;
};

/** A game in the Play hub list: a link card, or a dimmed card when it's coming soon. */
export function GameCard({ name, meta, tag, tone, href, disabled, extra }: Props) {
  const body = (
    <>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="display-text text-2xl">{name}</span>
        <span className="text-sm">{meta}</span>
        {extra}
      </div>
      <span className="shrink-0 rounded-full ink-border bg-cream px-3 py-1 text-sm font-bold text-ink">{tag}</span>
    </>
  );
  const cls = `flex items-center gap-3 rounded-[20px] ink-border p-4 ${tones[tone]}`;
  if (disabled || !href) {
    return (
      <div className={`${cls} opacity-60`} aria-disabled="true">
        {body}
      </div>
    );
  }
  return (
    <Link href={href} className={cls}>
      {body}
    </Link>
  );
}
