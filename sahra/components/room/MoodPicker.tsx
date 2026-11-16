"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { MOODS, type RoomMood } from "@/lib/rooms/api";

const tone: Record<RoomMood, string> = {
  family: "bg-paper text-ink",
  friends: "bg-chair text-ink",
  roast: "bg-tomato text-cream",
};

/** Host's mood choice. Roast needs the "everyone is 18+ and agreed" tick first. */
export function MoodPicker({
  mood,
  onChange,
  error,
}: {
  mood: RoomMood;
  onChange: (mood: RoomMood, roastConfirmed: boolean) => void;
  error: string | null;
}) {
  const t = useTranslations("moods");
  const [roastOk, setRoastOk] = useState(mood === "roast");
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-3" role="radiogroup">
        {MOODS.map((m) => {
          const on = m === mood;
          return (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(m, m === "roast" ? roastOk : false)}
              className={`flex flex-col items-start gap-1 rounded-[20px] p-4 text-start ${tone[m]} ${
                on ? "ink-border-thick outline-4 outline-offset-2 outline-sunflower [outline-style:solid]" : "ink-border"
              }`}
              data-testid={`mood-${m}`}
            >
              <span className="display-text text-2xl">{t(m)}</span>
              <span className="text-sm">{t(`${m}Body`)}</span>
            </button>
          );
        })}
      </div>
      <label className="flex min-h-11 items-center gap-3 font-semibold">
        <input
          type="checkbox"
          checked={roastOk}
          onChange={(e) => {
            setRoastOk(e.target.checked);
            if (!e.target.checked && mood === "roast") onChange("family", false);
          }}
          className="h-6 w-6 accent-[var(--tomato)]"
          data-testid="roast-confirm"
        />
        {t("roastConfirm")}
      </label>
      {error && (
        <p role="alert" className="font-bold text-tomato">
          {error}
        </p>
      )}
    </div>
  );
}
