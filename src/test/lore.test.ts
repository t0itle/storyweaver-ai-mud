// The wiki (everbloom-lore/) is canon. These tests keep the game's codex, wardens and spelling in step with it.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { loadPages, buildSql, brokenLinks, OUT } from "../../scripts/build-lore.mjs";

type Page = { path: string; slug: string; title: string; tags: string[]; body: string };
const pages: Page[] = loadPages();

describe("the wiki is a complete, linked canon", () => {
  it("the codex migration is regenerated from the current wiki (run `node scripts/build-lore.mjs`)", () => {
    expect(readFileSync(OUT, "utf8")).toBe(buildSql(pages));
  });
  it("every [[link]] points at a page that exists", () => {
    expect(brokenLinks(pages)).toEqual([]);
  });
  it("slugs are unique", () => {
    const slugs = pages.map((p) => p.slug);
    expect(slugs.length).toBe(new Set(slugs).size);
  });
  it("keeps the old codex slugs so players don't lose discoveries", () => {
    const slugs = new Set(pages.map((p) => p.slug));
    for (const s of ["crescent-kingdoms", "first-city", "the-veiled", "the-seven-aethers", "the-shadow", "otherworlders", "solastin"])
      expect(slugs.has(s)).toBe(true);
  });
  it("uses the Latin spelling Non Serviam", () => {
    for (const p of pages) expect(p.body).not.toMatch(/Servium/);
  });
});

describe("each Aether's twelve Wardens are written down", () => {
  for (const god of ["solastin", "khalvaris", "nyxara", "thalvora", "lazareth", "velithria", "morvayne"]) {
    it(`${god}: 12 Wardens — 10 people, 1 item, 1 place — matching drizzle 0008`, () => {
      const page = pages.find((p) => p.slug === `wardens-of-${god}`);
      expect(page).toBeTruthy();
      const rows = page!.body.split("\n").filter((l) => /^\| \d+ \|/.test(l));
      expect(rows).toHaveLength(12);
      const kinds = rows.map((r) => r.split("|")[3].trim());
      expect(kinds.filter((k) => k === "person")).toHaveLength(10);
      expect(kinds.filter((k) => k === "item")).toHaveLength(1);
      expect(kinds.filter((k) => k === "place")).toHaveLength(1);
      // The relic and place named on the page are the ones the migration creates.
      const m8 = readFileSync("drizzle/migrations/0008_wardens.sql", "utf8");
      for (const r of rows.filter((r) => !r.includes("| person |"))) {
        const name = r.split("|")[2].replace(/\*/g, "").trim();
        expect(m8).toContain(`'${god}'`);
        expect(m8).toContain(name.replace(/'/g, "''"));
      }
    });
  }
});
