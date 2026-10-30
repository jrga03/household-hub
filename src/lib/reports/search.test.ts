import { describe, expect, it } from "vitest";
import { defaultParseSearch, defaultStringifySearch } from "@tanstack/react-router";
import { readReportsSearch, type ReportsSearch } from "./search";

const roundTrip = (search: ReportsSearch) =>
  readReportsSearch(defaultParseSearch(defaultStringifySearch(search)));

describe("readReportsSearch", () => {
  it("keeps the period, end month, view and group through the URL", () => {
    const search: ReportsSearch = {
      period: "6m",
      end: "2026-12",
      view: "mine",
      group: "group-food",
    };
    expect(roundTrip(search)).toEqual(search);
    expect(roundTrip({})).toEqual({});
  });

  it("drops values it does not know", () => {
    expect(readReportsSearch({ period: "week", end: "2026-13", view: "family", group: 7 })).toEqual(
      {}
    );
  });
});
