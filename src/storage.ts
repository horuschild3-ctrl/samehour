export type Person = {
  id: string;
  name: string;
  timeZone: string;
  start: string;
  end: string;
};

export type Saved = {
  people: Person[];
  displayZone: string;
};

const KEY = "samehour.v1";

function isPerson(value: unknown): value is Person {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    record.id.length > 0 &&
    typeof record.name === "string" &&
    typeof record.timeZone === "string" &&
    typeof record.start === "string" &&
    typeof record.end === "string"
  );
}

function isSaved(value: unknown): value is Saved {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.displayZone === "string" &&
    Array.isArray(record.people) &&
    record.people.every(isPerson)
  );
}

export function loadSaved(): Saved | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isSaved(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveSaved(data: Saved): void {
  localStorage.setItem(KEY, JSON.stringify(data));
}
