// Renders the PWA icons from the Kassa artwork. Run: node scripts/make-icons.mjs
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../components/Kassa.tsx", import.meta.url), "utf8");
if (!src.includes("M60 60 C55 100")) throw new Error("Kassa artwork not found");

const svg = (pad) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-pad} ${-pad} ${200 + 2 * pad} ${240 + 2 * pad}" width="100%" height="100%">
  <defs><clipPath id="g"><path d="M60 60 C55 100 75 120 70 150 C66 180 72 205 100 205 C128 205 134 180 130 150 C125 120 145 100 140 60 Z"/></clipPath></defs>
  <g fill="none" stroke="#2B1B17" stroke-width="5" stroke-linecap="round"><path d="M85 44 C75 34 95 24 85 12"/><path d="M100 44 C90 31 110 21 100 6"/><path d="M115 44 C105 34 125 24 115 12"/></g>
  <ellipse cx="100" cy="214" rx="72" ry="14" fill="#12A6A0" stroke="#2B1B17" stroke-width="5"/>
  <path d="M60 60 C55 100 75 120 70 150 C66 180 72 205 100 205 C128 205 134 180 130 150 C125 120 145 100 140 60 Z" fill="#FFFDF7"/>
  <rect x="40" y="92" width="120" height="120" fill="#D9541E" clip-path="url(#g)"/>
  <path d="M60 60 C55 100 75 120 70 150 C66 180 72 205 100 205 C128 205 134 180 130 150 C125 120 145 100 140 60 Z" fill="none" stroke="#2B1B17" stroke-width="5" stroke-linejoin="round"/>
  <ellipse cx="100" cy="60" rx="40" ry="8" fill="#FFFDF7" stroke="#2B1B17" stroke-width="5"/>
  <path d="M72 76 C69 92 73 104 71 116" stroke="#FFFFFF" stroke-width="4" fill="none" stroke-linecap="round"/>
  <circle cx="86" cy="124" r="10" fill="#FFFFFF" stroke="#2B1B17" stroke-width="4"/><circle cx="114" cy="124" r="10" fill="#FFFFFF" stroke="#2B1B17" stroke-width="4"/>
  <circle cx="88" cy="126" r="4" fill="#2B1B17"/><circle cx="116" cy="126" r="4" fill="#2B1B17"/>
  <path d="M74 106 Q84 98 96 104" stroke="#2B1B17" stroke-width="5" fill="none" stroke-linecap="round"/>
  <path d="M105 108 Q115 105 126 110" stroke="#2B1B17" stroke-width="5" fill="none" stroke-linecap="round"/>
  <path d="M84 142 Q92 135 100 141 Q108 135 116 142 Q108 147 100 144 Q92 147 84 142 Z" fill="#2B1B17"/>
  <path d="M86 152 Q100 172 114 152 Z" fill="#2B1B17"/>
</svg>`;

const icons = [
  ["icon-192.png", 192, 14],
  ["icon-512.png", 512, 14],
  ["icon-maskable-512.png", 512, 60], // safe zone padding for maskable icons
  ["apple-touch-icon.png", 180, 18],
  ["favicon-32.png", 32, 4],
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, size, pad] of icons) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;background:#FFF4DE;display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px">
     <div style="height:${size}px;width:${size}px">${svg(pad).replace('width="100%" height="100%"', `width="${size}" height="${size}"`)}</div></body></html>`,
  );
  await page.screenshot({ path: new URL(`../public/icons/${name}`, import.meta.url).pathname });
}
await browser.close();
console.log("icons written");
