import { describe, expect, it } from "vitest";
import { clamp, lerp, pickRandom, rectsOverlap, type Rect } from "./gameUtils";

describe("gameUtils", () => {
  it("clamps values correctly", () => {
    expect(clamp(10, 0, 5)).toBe(5);
    expect(clamp(-2, 0, 5)).toBe(0);
    expect(clamp(3, 0, 5)).toBe(3);
  });

  it("detects rectangle overlap", () => {
    const base: Rect = { x: 10, y: 10, width: 50, height: 50 };
    expect(rectsOverlap(base, { x: 0, y: 0, width: 20, height: 20 })).toBe(true);
    expect(rectsOverlap(base, { x: 100, y: 100, width: 20, height: 20 })).toBe(
      false,
    );
    expect(rectsOverlap(base, { x: 55, y: 55, width: 40, height: 40 })).toBe(
      true,
    );
  });

  it("performs linear interpolation", () => {
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerp(0, 10, 0.5)).toBe(5);
    expect(lerp(0, 10, 1)).toBe(10);
  });

  it("picks a random item from the list", () => {
    const items = ["a", "b", "c"] as const;
    const value = pickRandom(items);
    expect(items).toContain(value);
  });
});
