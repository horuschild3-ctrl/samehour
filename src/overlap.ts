export type CivilDate = {
  year: number;
  month: number;
  day: number;
};

export type InstantInterval = {
  start: number;
  end: number;
};

export type Bar = {
  left: number;
  width: number;
};

export type Tick = {
  hour: number;
  left: number;
};

export type Lane = {
  id: string;
  name: string;
  bars: Bar[];
};

export type DayPerson = {
  id: string;
  name: string;
  timeZone: string;
  start: string;
  end: string;
};

export type DayModel = {
  dateLabel: string;
  ticks: Tick[];
  lanes: Lane[];
  sharedBars: Bar[];
  totalLabel: string;
  rangeLabel: string;
  outsideNote: string | null;
  copyText: string;
};

const CITY_NAMES: Record<string, string> = {
  "America/Bogota": "Bogotá",
  "America/Sao_Paulo": "São Paulo",
  "America/Mexico_City": "Mexico City",
  "America/Los_Angeles": "Los Angeles",
  "America/New_York": "New York",
};

export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function cityLabel(timeZone: string): string {
  const named = CITY_NAMES[timeZone];
  if (named) return named;
  const city = timeZone.split("/").pop() ?? timeZone;
  return city.replaceAll("_", " ");
}

export function parseHm(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

export function formatHm(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function personIssue(person: {
  timeZone: string;
  start: string;
  end: string;
}): string | null {
  if (!isValidTimeZone(person.timeZone)) return "Timezone isn't recognized";
  const start = parseHm(person.start);
  const end = parseHm(person.end);
  if (start === null || end === null) return "Need a start and end";
  if (start === end) return "Start and end are the same";
  return null;
}

export function isOvernight(start: string, end: string): boolean {
  const startMinute = parseHm(start);
  const endMinute = parseHm(end);
  return startMinute !== null && endMinute !== null && endMinute < startMinute;
}

export function toInputDate(date: CivilDate): string {
  return `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

export function fromInputDate(value: string): CivilDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

export function addDays(date: CivilDate, days: number): CivilDate {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function formatterParts(utcMs: number, timeZone: string): Intl.DateTimeFormatPart[] {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
}

function readPart(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
): number {
  const value = parts.find((part) => part.type === type)?.value;
  if (value === undefined) {
    throw new Error(`Missing ${type} from timezone formatter`);
  }
  return Number(value);
}

export function localParts(
  utcMs: number,
  timeZone: string,
): CivilDate & { hour: number; minute: number } {
  const parts = formatterParts(utcMs, timeZone);
  let year = readPart(parts, "year");
  let month = readPart(parts, "month");
  let day = readPart(parts, "day");
  let hour = readPart(parts, "hour");
  const minute = readPart(parts, "minute");
  if (hour === 24) {
    hour = 0;
    const next = addDays({ year, month, day }, 1);
    year = next.year;
    month = next.month;
    day = next.day;
  }
  return { year, month, day, hour, minute };
}

function zoneOffsetMs(utcMs: number, timeZone: string): number {
  const parts = formatterParts(utcMs, timeZone);
  const year = readPart(parts, "year");
  const month = readPart(parts, "month");
  const day = readPart(parts, "day");
  const hour = readPart(parts, "hour");
  const minute = readPart(parts, "minute");
  const second = readPart(parts, "second");
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  return asUtc - utcMs;
}

// Treat the civil time as UTC, then subtract the zone offset at that
// instant. A second pass settles the difference around a DST change.
export function zonedLocalToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  if (!isValidTimeZone(timeZone)) {
    throw new RangeError(`Invalid time zone: ${timeZone}`);
  }
  const desired = Date.UTC(year, month - 1, day, hour, minute, 0);
  let utc = desired;
  for (let pass = 0; pass < 4; pass += 1) {
    const next = desired - zoneOffsetMs(utc, timeZone);
    if (next === utc) return new Date(utc);
    utc = next;
  }
  return new Date(utc);
}

export function civilToday(timeZone: string, now = Date.now()): CivilDate {
  const parts = localParts(now, timeZone);
  return { year: parts.year, month: parts.month, day: parts.day };
}

function minuteOnDate(date: CivilDate, minuteOfDay: number, timeZone: string): number {
  if (minuteOfDay === 24 * 60) {
    const next = addDays(date, 1);
    return zonedLocalToUtc(next.year, next.month, next.day, 0, 0, timeZone).getTime();
  }
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  return zonedLocalToUtc(date.year, date.month, date.day, hour, minute, timeZone).getTime();
}

export function shiftOnDate(
  date: CivilDate,
  timeZone: string,
  startMinute: number,
  endMinute: number,
): InstantInterval[] {
  if (!isValidTimeZone(timeZone)) return [];
  if (startMinute === endMinute) return [];
  if (startMinute < 0 || endMinute < 0 || startMinute > 1440 || endMinute > 1440) return [];

  const start = minuteOnDate(date, startMinute, timeZone);
  const endDate = endMinute < startMinute ? addDays(date, 1) : date;
  const end = minuteOnDate(endDate, endMinute, timeZone);
  if (end <= start) return [];
  return [{ start, end }];
}

export function mergeIntervals(input: InstantInterval[]): InstantInterval[] {
  const sorted = [...input].sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: InstantInterval[] = [];
  for (const interval of sorted) {
    const last = merged[merged.length - 1];
    if (!last || interval.start > last.end) {
      merged.push({ start: interval.start, end: interval.end });
    } else if (interval.end > last.end) {
      last.end = interval.end;
    }
  }
  return merged;
}

function intersectTwo(left: InstantInterval[], right: InstantInterval[]): InstantInterval[] {
  const hits: InstantInterval[] = [];
  for (const a of left) {
    for (const b of right) {
      const start = Math.max(a.start, b.start);
      const end = Math.min(a.end, b.end);
      if (start < end) hits.push({ start, end });
    }
  }
  return mergeIntervals(hits);
}

export function intersectMany(groups: InstantInterval[][]): InstantInterval[] {
  if (groups.length === 0) return [];
  const first = groups[0];
  if (!first) return [];
  return groups.slice(1).reduce((acc, group) => intersectTwo(acc, group), mergeIntervals(first));
}

export function dayWindow(date: CivilDate, timeZone: string): InstantInterval | null {
  if (!isValidTimeZone(timeZone)) return null;
  const start = zonedLocalToUtc(date.year, date.month, date.day, 0, 0, timeZone).getTime();
  const next = addDays(date, 1);
  const end = zonedLocalToUtc(next.year, next.month, next.day, 0, 0, timeZone).getTime();
  if (end <= start) return null;
  return { start, end };
}

export function clipToWindow(
  intervals: InstantInterval[],
  window: InstantInterval,
): InstantInterval[] {
  const clipped: InstantInterval[] = [];
  for (const interval of intervals) {
    const start = Math.max(interval.start, window.start);
    const end = Math.min(interval.end, window.end);
    if (start < end) clipped.push({ start, end });
  }
  return clipped;
}

export function toBars(intervals: InstantInterval[], window: InstantInterval): Bar[] {
  const span = window.end - window.start;
  if (span <= 0) return [];
  return clipToWindow(intervals, window).map((interval) => ({
    left: ((interval.start - window.start) / span) * 100,
    width: ((interval.end - interval.start) / span) * 100,
  }));
}

export function hourTicks(date: CivilDate, timeZone: string): Tick[] {
  const window = dayWindow(date, timeZone);
  if (!window) return [];
  const span = window.end - window.start;
  const ticks: Tick[] = [];
  for (let hour = 0; hour < 24; hour += 3) {
    const instant = zonedLocalToUtc(date.year, date.month, date.day, hour, 0, timeZone).getTime();
    const back = localParts(instant, timeZone);
    const sameCivil =
      back.year === date.year &&
      back.month === date.month &&
      back.day === date.day &&
      back.hour === hour &&
      back.minute === 0;
    if (!sameCivil) continue;
    ticks.push({ hour, left: ((instant - window.start) / span) * 100 });
  }
  return ticks;
}

export function formatDuration(ms: number): string {
  const minutes = Math.round(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h ${rest}m`;
}

function shortDate(date: CivilDate): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(date.year, date.month - 1, date.day, 12)));
}

function sameCivil(left: CivilDate, right: CivilDate): boolean {
  return left.year === right.year && left.month === right.month && left.day === right.day;
}

export function formatRange(
  interval: InstantInterval,
  timeZone: string,
  anchor: CivilDate,
): string {
  const start = localParts(interval.start, timeZone);
  const end = localParts(interval.end, timeZone);
  const startLabel = formatHm(start.hour * 60 + start.minute);
  const endLabel = formatHm(end.hour * 60 + end.minute);
  const startOnAnchor = sameCivil(start, anchor);
  const endOnAnchor = sameCivil(end, anchor);
  if (sameCivil(start, end) && startOnAnchor) return `${startLabel}–${endLabel}`;
  if (startOnAnchor && !endOnAnchor) return `${startLabel}–${endLabel} next day`;
  if (sameCivil(start, end)) return `${startLabel}–${endLabel} on ${shortDate(start)}`;
  return `${startLabel} on ${shortDate(start)} – ${endLabel} on ${shortDate(end)}`;
}

export function formatCivilDate(date: CivilDate, timeZone: string): string {
  const noon = zonedLocalToUtc(date.year, date.month, date.day, 12, 0, timeZone);
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone,
  }).format(noon);
}

function sumMs(intervals: InstantInterval[]): number {
  return intervals.reduce((total, interval) => total + (interval.end - interval.start), 0);
}

function displayName(name: string): string {
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed : "Unnamed";
}

export function buildDay(input: {
  date: CivilDate;
  displayZone: string;
  people: DayPerson[];
}): DayModel | { error: string } {
  if (!isValidTimeZone(input.displayZone)) {
    return { error: "That timezone isn't recognized." };
  }

  const window = dayWindow(input.date, input.displayZone);
  if (!window) return { error: "That timezone isn't recognized." };

  const lanes: Lane[] = [];
  const groups: InstantInterval[][] = [];
  const lines: string[] = [];

  for (const person of input.people) {
    if (personIssue(person)) continue;
    const startMinute = parseHm(person.start);
    const endMinute = parseHm(person.end);
    if (startMinute === null || endMinute === null) continue;
    const intervals = shiftOnDate(input.date, person.timeZone, startMinute, endMinute);
    if (intervals.length === 0) continue;
    groups.push(intervals);
    lanes.push({
      id: person.id,
      name: displayName(person.name),
      bars: toBars(intervals, window),
    });
    lines.push(
      `${displayName(person.name)} · ${person.timeZone} · ${formatHm(startMinute)}–${formatHm(endMinute)}`,
    );
  }

  const shared = groups.length >= 2 ? intersectMany(groups) : [];
  const sharedOnDay = clipToWindow(shared, window);
  const rangeLabel = shared
    .map((interval) => formatRange(interval, input.displayZone, input.date))
    .join(", ");
  const totalLabel =
    groups.length === 1
      ? "Add another person to compare"
      : shared.length === 0
        ? "No shared time"
        : formatDuration(sumMs(shared));
  const fullMs = sumMs(shared);
  const shownMs = sumMs(sharedOnDay);
  const outsideNote =
    shared.length > 0 && shownMs + 60_000 < fullMs
      ? shownMs === 0
        ? `That shared time is ${rangeLabel}, outside this timeline day.`
        : `Part of that shared time sits outside this day: ${rangeLabel}.`
      : null;

  const dateLabel = formatCivilDate(input.date, input.displayZone);
  const zoneLabel = cityLabel(input.displayZone);
  const headline =
    shared.length === 0 ? totalLabel : `${totalLabel} in common: ${rangeLabel}`;
  const copyText = [
    `${dateLabel} · ${zoneLabel} time`,
    headline,
    "",
    lines.join("\n"),
  ]
    .join("\n")
    .trimEnd();

  return {
    dateLabel,
    ticks: hourTicks(input.date, input.displayZone),
    lanes,
    sharedBars: toBars(shared, window),
    totalLabel,
    rangeLabel,
    outsideNote,
    copyText,
  };
}
