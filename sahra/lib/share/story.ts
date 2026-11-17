"use client";

import { kassaSvgString, type KassaExpression } from "@/components/Kassa";

/**
 * Story images (1080×1920) drawn in the browser with Canvas 2D.
 *
 * Why not Next.js ImageResponse (satori)? Its font engine crashes on Lalezar's
 * Arabic ligatures (e.g. "با"), and with them removed the lam-alef ligature and
 * letter positions break. The browser's own text shaping renders Arabic
 * correctly with the exact fonts the app uses, and costs nothing on the server.
 */

export type StoryCard =
  | {
      kind: "result";
      heading: string;
      label: string;
      value: string;
      lines: string[];
      badges: string[];
      kassa?: KassaExpression;
    }
  | {
      kind: "title";
      heading: string;
      title: string;
      name: string;
      kassa?: KassaExpression;
    };

export type StoryChrome = {
  wordmark: string;
  tagline: string;
  footer: string;
  dir: "rtl" | "ltr";
};

export const STORY_WIDTH = 1080;
export const STORY_HEIGHT = 1920;

const C = {
  tomato: "#E8412C",
  sunflower: "#FFC93C",
  chair: "#12A6A0",
  ink: "#2B1B17",
  cream: "#FFF4DE",
  paper: "#FFFFFF",
  muted: "#6B5147",
  green: "#2E8B57",
};

function fontFamily(variable: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return v || fallback;
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = src;
  await img.decode();
  return img;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Word-wraps text to maxWidth; returns lines (works in both directions). */
export function wrapText(measure: (s: string) => number, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (measure(next) <= maxWidth || !line) line = next;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawLights(ctx: CanvasRenderingContext2D) {
  const segments = 3;
  const segW = STORY_WIDTH / segments;
  const top = 18;
  const sag = 90;
  ctx.lineWidth = 6;
  ctx.strokeStyle = C.ink;
  ctx.beginPath();
  ctx.moveTo(0, top);
  for (let s = 0; s < segments; s++) ctx.quadraticCurveTo(s * segW + segW / 2, top + sag, (s + 1) * segW, top);
  ctx.stroke();
  const colours = [C.tomato, C.sunflower, C.chair, C.green];
  let n = 0;
  for (let s = 0; s < segments; s++) {
    for (const t of [0.25, 0.5, 0.75]) {
      const x = s * segW + segW * t;
      const y = top + 2 * (sag / 2) * 2 * t * (1 - t);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + 14);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(x, y + 38, 17, 23, 0, 0, Math.PI * 2);
      ctx.fillStyle = colours[n++ % colours.length];
      ctx.fill();
      ctx.stroke();
    }
  }
}

/** Renders a story card to a PNG blob. */
export async function renderStory(card: StoryCard, chrome: StoryChrome): Promise<Blob> {
  const display = fontFamily("--font-lalezar", "serif");
  const body = fontFamily("--font-plex-arabic", "sans-serif");
  // Best effort: one missing unicode-range subset makes fonts.load() reject even
  // though the Arabic faces the card needs are already loaded by the page.
  await Promise.all(
    [`120px ${display}`, `700 48px ${body}`, `400 40px ${body}`].map((f) =>
      document.fonts.load(f, "سهرة Sahra").catch(() => []),
    ),
  );
  await document.fonts.ready;

  const canvas = document.createElement("canvas");
  canvas.width = STORY_WIDTH;
  canvas.height = STORY_HEIGHT;
  const ctx = canvas.getContext("2d")!;
  ctx.direction = chrome.dir;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  const cx = STORY_WIDTH / 2;

  ctx.fillStyle = C.cream;
  ctx.fillRect(0, 0, STORY_WIDTH, STORY_HEIGHT);
  drawLights(ctx);

  // Wordmark.
  ctx.fillStyle = C.tomato;
  ctx.font = `190px ${display}`;
  ctx.fillText(chrome.wordmark, cx, 400);

  // Card.
  const cardX = 80;
  const cardY = 480;
  const cardW = STORY_WIDTH - 160;
  const cardH = 900;
  roundRect(ctx, cardX, cardY, cardW, cardH, 56);
  ctx.fillStyle = card.kind === "result" ? C.tomato : C.sunflower;
  ctx.fill();
  ctx.lineWidth = 10;
  ctx.strokeStyle = C.ink;
  ctx.stroke();

  const textColour = card.kind === "result" ? C.cream : C.ink;
  ctx.fillStyle = textColour;
  ctx.font = `700 54px ${body}`;
  ctx.fillText(card.heading, cx, cardY + 120);

  if (card.kind === "result") {
    ctx.font = `700 46px ${body}`;
    ctx.fillText(card.label, cx, cardY + 230);
    ctx.font = `260px ${display}`;
    ctx.fillText(card.value, cx, cardY + 520);
    ctx.font = `400 46px ${body}`;
    card.lines.slice(0, 2).forEach((l, i) => ctx.fillText(l, cx, cardY + 630 + i * 66));
    // Badges: a row of chips along the bottom of the card.
    ctx.font = `700 36px ${body}`;
    const chips = card.badges.slice(0, 3).map((b) => ({ b, w: ctx.measureText(b).width + 56 }));
    // Chips are placed left to right; in Arabic the first badge belongs on the right.
    if (chrome.dir === "rtl") chips.reverse();
    const gap = 20;
    const rowW = chips.reduce((a, c) => a + c.w, 0) + gap * Math.max(0, chips.length - 1);
    let x = cx - rowW / 2;
    const y = cardY + cardH - 70;
    for (const c of chips) {
      roundRect(ctx, x, y - 52, c.w, 76, 38);
      ctx.fillStyle = C.sunflower;
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.strokeStyle = C.ink;
      ctx.stroke();
      ctx.fillStyle = C.ink;
      ctx.fillText(c.b, x + c.w / 2, y);
      x += c.w + gap;
    }
  } else {
    ctx.font = `110px ${display}`;
    const lines = wrapText((s) => ctx.measureText(s).width, card.title, cardW - 120).slice(0, 4);
    const startY = cardY + 330 + (4 - lines.length) * 60;
    lines.forEach((l, i) => ctx.fillText(l, cx, startY + i * 130));
    ctx.font = `700 64px ${body}`;
    ctx.fillText(card.name, cx, cardY + cardH - 90);
  }

  // Kassa.
  const kassa = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(kassaSvgString(card.kassa ?? "laughing"))}`);
  ctx.drawImage(kassa, cx - 115, cardY + cardH + 50, 230, 276);

  // Footer.
  ctx.fillStyle = C.ink;
  ctx.font = `700 46px ${body}`;
  ctx.fillText(chrome.tagline, cx, STORY_HEIGHT - 130);
  ctx.fillStyle = C.muted;
  ctx.font = `400 38px ${body}`;
  ctx.direction = "ltr";
  ctx.fillText(chrome.footer, cx, STORY_HEIGHT - 66);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png"));
}
