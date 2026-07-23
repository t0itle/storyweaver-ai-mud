import { describe, it, expect } from "vitest";
import { completeInput } from "@/components/mud/completion";

const npcs = ["Maeve Lensbinder", "Marrow the Fence", "Old Bavren"];

describe("completeInput", () => {
  it("completes a unique command with a trailing space", () => {
    const r = completeInput("inv", []);
    expect(r?.completed).toBe("inventory ");
    expect(r?.candidates).toEqual(["inventory"]);
  });

  it("completes to the shared prefix when ambiguous", () => {
    const r = completeInput("ma", [], ["map", "market"]);
    expect(r?.completed).toBe("ma");
    expect(r?.candidates?.sort()).toEqual(["map", "market"]);
  });

  it("completes NPC first names after the first token", () => {
    const r = completeInput("ask mae", npcs);
    expect(r?.completed).toBe("ask Maeve ");
  });

  it("lists candidates when two souls share a prefix", () => {
    const r = completeInput("ask ma", npcs);
    expect(r?.candidates?.sort()).toEqual(["Maeve", "Marrow"]);
    expect(r?.completed).toBe("ask Ma");
  });

  it("returns null with no match, empty input, or trailing space", () => {
    expect(completeInput("ask zz", npcs)).toBeNull();
    expect(completeInput("", npcs)).toBeNull();
    expect(completeInput("ask ", npcs)).toBeNull();
  });
});
