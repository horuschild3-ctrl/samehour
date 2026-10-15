import { describe, expect, it } from "vitest";
import {
  buildDay,
  dayWindow,
  formatRange,
  fromInputDate,
  hourTicks,
  localParts,
  personIssue,
  shiftOnDate,
  zonedLocalToUtc,
} from "./overlap";

const HOUR = 60 * 60 * 1000;

const bogota = {
  id: "bogota",
  name: "Bogotá",
  timeZone: "America/Bogota",
  start: "09:00",
  end: "18:00",
};
const newYork = {
  id: "nyc",
  name: "New York",
  timeZone: "America/New_York",
  start: "09:00",
  end: "17:00",
};
const london = {
  id: "lon",
  name: "London",
  timeZone: "Europe/London",
  start: "09:00",
  end: "17:30",
};

describe("zonedLocalToUtc", () => {
  it("maps Bogotá midnight to 05:00 UTC", () => {
    expect(zonedLocalToUtc(2026, 10, 15, 0, 0, "America/Bogota").toISOString()).toBe(
      "2026-10-15T05:00:00.000Z",
    );
  });

  it("maps London midnight in October to the previous UTC evening", () => {
    expect(zonedLocalToUtc(2026, 10, 15, 0, 0, "Europe/London").toISOString()).toBe(
      "2026-10-14T23:00:00.000Z",
    );
  });

  it("reads civil parts back in the same zone", () => {
    expect(localParts(Date.parse("2026-10-15T14:00:00Z"), "America/Bogota")).toMatchObject({
      year: 2026,
      month: 10,
      day: 15,
      hour: 9,
      minute: 0,
    });
  });

  it("does not throw on a skipped DST hour", () => {
    const instant = zonedLocalToUtc(2026, 3, 8, 2, 30, "America/New_York");
    expect(Number.isNaN(instant.getTime())).toBe(false);
    const again = zonedLocalToUtc(2026, 3, 8, 2, 30, "America/New_York");
    expect(again.getTime()).toBe(instant.getTime());
  });

  it("is stable across the repeated autumn hour", () => {
    const first = zonedLocalToUtc(2026, 11, 1, 1, 30, "America/New_York");
    const second = zonedLocalToUtc(2026, 11, 1, 1, 30, "America/New_York");
    expect(second.getTime()).toBe(first.getTime());
  });
});

describe("day length", () => {
  it("is 23 hours on the New York spring-forward", () => {
    const window = dayWindow({ year: 2026, month: 3, day: 8 }, "America/New_York");
    expect(window && window.end - window.start).toBe(23 * HOUR);
  });

  it("is 25 hours on the New York fall-back", () => {
    const window = dayWindow({ year: 2026, month: 11, day: 1 }, "America/New_York");
    expect(window && window.end - window.start).toBe(25 * HOUR);
  });

  it("places 03:00 two real hours after midnight when the US clock springs forward", () => {
    const ticks = hourTicks({ year: 2026, month: 3, day: 8 }, "America/New_York");
    expect(ticks.map((tick) => tick.hour)).toEqual([0, 3, 6, 9, 12, 15, 18, 21]);
    const three = ticks.find((tick) => tick.hour === 3);
    expect(three?.left).toBeCloseTo((2 / 23) * 100, 5);
  });

  it("places 03:00 four real hours after midnight when the US clock falls back", () => {
    const ticks = hourTicks({ year: 2026, month: 11, day: 1 }, "America/New_York");
    const three = ticks.find((tick) => tick.hour === 3);
    expect(three?.left).toBeCloseTo((4 / 25) * 100, 5);
  });
});

describe("buildDay", () => {
  it("overlaps three cities on a DST date in October", () => {
    const model = buildDay({
      date: { year: 2026, month: 10, day: 15 },
      displayZone: "America/Bogota",
      people: [bogota, newYork, london],
    });
    expect("error" in model).toBe(false);
    if ("error" in model) return;
    expect(model.totalLabel).toBe("2h 30m");
    expect(model.rangeLabel).toBe("09:00–11:30");
    expect(model.copyText).toBe(
      [
        "Thursday, 15 October 2026 · Bogotá time",
        "2h 30m in common: 09:00–11:30",
        "",
        "Bogotá · America/Bogota · 09:00–18:00",
        "New York · America/New_York · 09:00–17:00",
        "London · Europe/London · 09:00–17:30",
      ].join("\n"),
    );
    expect(model.lanes).toHaveLength(3);
    expect(model.sharedBars.length).toBeGreaterThan(0);
  });

  it("is a longer overlap in January, when London and New York are on standard time", () => {
    const model = buildDay({
      date: { year: 2026, month: 1, day: 15 },
      displayZone: "America/New_York",
      people: [bogota, newYork, london],
    });
    if ("error" in model) throw new Error(model.error);
    expect(model.totalLabel).toBe("3h 30m");
    expect(model.rangeLabel).toBe("09:00–12:30");
  });

  it("finds no overlap between Tokyo and New York office hours", () => {
    const model = buildDay({
      date: { year: 2026, month: 1, day: 15 },
      displayZone: "Asia/Tokyo",
      people: [
        { id: "tyo", name: "Tokyo", timeZone: "Asia/Tokyo", start: "09:00", end: "17:00" },
        newYork,
      ],
    });
    if ("error" in model) throw new Error(model.error);
    expect(model.totalLabel).toBe("No shared time");
    expect(model.sharedBars).toEqual([]);
  });

  it("intersects an overnight shift with the next morning", () => {
    const model = buildDay({
      date: { year: 2026, month: 1, day: 15 },
      displayZone: "Europe/London",
      people: [
        {
          id: "night",
          name: "Night",
          timeZone: "Europe/London",
          start: "22:00",
          end: "06:00",
        },
        {
          id: "early",
          name: "Early",
          timeZone: "America/Bogota",
          start: "20:00",
          end: "23:00",
        },
      ],
    });
    if ("error" in model) throw new Error(model.error);
    expect(model.totalLabel).toBe("3h");
    expect(model.rangeLabel).toBe("01:00–04:00 on 16 Jan");
    expect(model.outsideNote).toMatch(/outside this timeline day/);
    expect(model.sharedBars).toEqual([]);
  });

  it("does not invent a shared block for a single person", () => {
    const model = buildDay({
      date: { year: 2026, month: 10, day: 15 },
      displayZone: "America/Bogota",
      people: [bogota],
    });
    if ("error" in model) throw new Error(model.error);
    expect(model.totalLabel).toBe("Add another person to compare");
    expect(model.sharedBars).toEqual([]);
    expect(model.lanes).toHaveLength(1);
  });

  it("skips a bad timezone without dropping the others", () => {
    const model = buildDay({
      date: { year: 2026, month: 1, day: 15 },
      displayZone: "UTC",
      people: [
        { ...bogota, timeZone: "Not/AZone" },
        { ...newYork, start: "09:00", end: "09:00" },
        london,
        {
          id: "utc",
          name: "UTC",
          timeZone: "UTC",
          start: "10:00",
          end: "16:00",
        },
      ],
    });
    if ("error" in model) throw new Error(model.error);
    expect(model.lanes.map((lane) => lane.name)).toEqual(["London", "UTC"]);
    expect(model.totalLabel).toBe("6h");
  });

  it("rejects an unknown display zone", () => {
    const model = buildDay({
      date: { year: 2026, month: 10, day: 15 },
      displayZone: "Bogota",
      people: [bogota, london],
    });
    expect(model).toEqual({ error: "That timezone isn't recognized." });
  });
});

describe("small parsers", () => {
  it("rejects a calendar day that does not exist", () => {
    expect(fromInputDate("2026-02-31")).toBeNull();
    expect(fromInputDate("2026-02-28")).toEqual({ year: 2026, month: 2, day: 28 });
  });

  it("names the problem on a person row", () => {
    expect(personIssue({ timeZone: "nope", start: "09:00", end: "17:00" })).toBe(
      "Timezone isn't recognized",
    );
    expect(personIssue({ timeZone: "UTC", start: "09:00", end: "09:00" })).toBe(
      "Start and end are the same",
    );
    expect(personIssue({ timeZone: "UTC", start: "", end: "17:00" })).toBe(
      "Need a start and end",
    );
  });

  it("formats a range that crosses midnight in the display zone", () => {
    const [interval] = shiftOnDate(
      { year: 2026, month: 1, day: 15 },
      "Europe/London",
      22 * 60,
      2 * 60,
    );
    expect(interval).toBeDefined();
    if (!interval) return;
    expect(formatRange(interval, "Europe/London", { year: 2026, month: 1, day: 15 })).toBe(
      "22:00–02:00 next day",
    );
  });
});
