import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import ar from "@/messages/ar.json";
import en from "@/messages/en.json";

function keys(obj: object, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object" ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(tsx|ts)$/.test(name) ? [full] : [];
  });
}

describe("translations", () => {
  it("has the same keys in Arabic and English", () => {
    expect(keys(ar).sort()).toEqual(keys(en).sort());
  });

  it("keeps Arabic UI text out of components (it belongs in messages/)", () => {
    const root = path.resolve(__dirname, "../..");
    const offenders = ["app", "components"]
      .flatMap((d) => sourceFiles(path.join(root, d)))
      .filter((file) => {
        // Strip comments, then look for Arabic letters in code.
        const code = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
        return /[؀-ۿ]/.test(code);
      })
      .map((f) => path.relative(root, f));
    expect(offenders).toEqual([]);
  });

  it("keeps English UI text out of JSX (it belongs in messages/)", () => {
    const root = path.resolve(__dirname, "../..");
    const offenders = ["app", "components"]
      .flatMap((d) => sourceFiles(path.join(root, d)))
      .filter((f) => f.endsWith(".tsx"))
      .flatMap((file) => {
        const code = readFileSync(file, "utf8").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
        // Text nodes between tags with 2+ English words, e.g. <p>Play now</p>.
        const hits = [...code.matchAll(/>\s*([A-Za-z]+(?:\s+[A-Za-z]+)+)\s*</g)].map((m) => m[1]);
        return hits.map((h) => `${path.relative(root, file)}: "${h}"`);
      });
    expect(offenders).toEqual([]);
  });
});
