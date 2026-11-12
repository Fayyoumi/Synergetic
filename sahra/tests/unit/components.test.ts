import { describe, expect, it } from "vitest";
import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Kassa, kassaExpressions } from "@/components/Kassa";
import { WeddingLights } from "@/components/WeddingLights";

describe("Kassa", () => {
  it("gives every instance its own clipPath id", () => {
    const html = renderToStaticMarkup(
      createElement(Fragment, null, createElement(Kassa, { label: "a" }), createElement(Kassa, { label: "b" })),
    );
    const ids = [...html.matchAll(/<clipPath id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    for (const id of ids) expect(html).toContain(`clip-path="url(#${id})"`);
  });

  it("renders a different face for each expression", () => {
    const faces = kassaExpressions.map((mood) =>
      renderToStaticMarkup(createElement(Kassa, { mood })).replace(/kassa-glass-[^"')]+/g, "ID"),
    );
    expect(new Set(faces).size).toBe(kassaExpressions.length);
  });

  it("is an image with a label, or hidden when decorative", () => {
    expect(renderToStaticMarkup(createElement(Kassa, { label: "كاسة" }))).toContain('role="img" aria-label="كاسة"');
    expect(renderToStaticMarkup(createElement(Kassa))).toContain('aria-hidden="true"');
  });
});

describe("WeddingLights", () => {
  it("draws 6 bulbs on a phone and 12 on a host screen", () => {
    const count = (variant: "phone" | "wide") =>
      (renderToStaticMarkup(createElement(WeddingLights, { variant })).match(/<ellipse/g) ?? []).length;
    expect(count("phone")).toBe(6);
    expect(count("wide")).toBe(12);
  });
});
