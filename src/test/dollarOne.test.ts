import { describe, it, expect } from "vitest";
import { scoreAgainstTemplate, type Pt } from "@/lib/dollarOne";

// Helper shapes
const line = (x1: number, y1: number, x2: number, y2: number, n = 32): Pt[] =>
  Array.from({ length: n }, (_, i) => [x1 + ((x2 - x1) * i) / (n - 1), y1 + ((y2 - y1) * i) / (n - 1)] as Pt);

const vee: Pt[] = [...line(0, 0, 50, 100, 16), ...line(50, 100, 100, 0, 16)];
const circle = (cx: number, cy: number, r: number, n = 48): Pt[] =>
  Array.from({ length: n }, (_, i) => {
    const a = (2 * Math.PI * i) / (n - 1);
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as Pt;
  });

describe("$1 unistroke recognizer", () => {
  it("scores an identical stroke near 1", () => {
    expect(scoreAgainstTemplate(vee, vee)).toBeGreaterThan(0.95);
  });

  it("is invariant to translation and scale", () => {
    const moved = vee.map(([x, y]) => [x * 3 + 500, y * 3 + 200] as Pt);
    expect(scoreAgainstTemplate(moved, vee)).toBeGreaterThan(0.9);
  });

  it("tolerates small rotations", () => {
    const rad = (12 * Math.PI) / 180;
    const rotated = vee.map(([x, y]) => [
      x * Math.cos(rad) - y * Math.sin(rad),
      x * Math.sin(rad) + y * Math.cos(rad),
    ] as Pt);
    expect(scoreAgainstTemplate(rotated, vee)).toBeGreaterThan(0.8);
  });

  it("scores clearly different shapes low", () => {
    const veeScore = scoreAgainstTemplate(circle(50, 50, 40), vee);
    expect(veeScore).toBeLessThan(0.7);
    // A matching circle must beat the mismatched vee comfortably.
    const circleScore = scoreAgainstTemplate(circle(200, 300, 90), circle(50, 50, 40));
    expect(circleScore).toBeGreaterThan(veeScore);
  });

  it("returns 0 for degenerate input", () => {
    expect(scoreAgainstTemplate([], vee)).toBe(0);
    expect(scoreAgainstTemplate([[1, 1], [2, 2]], vee)).toBe(0);
    expect(scoreAgainstTemplate(vee, [[0, 0]])).toBe(0);
  });

  it("never returns a negative score", () => {
    const jagged: Pt[] = Array.from({ length: 40 }, (_, i) => [i % 2 === 0 ? 0 : 100, i * 5] as Pt);
    const s = scoreAgainstTemplate(jagged, circle(50, 50, 40));
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(1);
  });
});
