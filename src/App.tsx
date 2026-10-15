import { useEffect, useMemo, useState } from "react";
import {
  buildDay,
  civilToday,
  formatHm,
  fromInputDate,
  isOvernight,
  isValidTimeZone,
  parseHm,
  personIssue,
  toInputDate,
  type CivilDate,
  type DayModel,
} from "./overlap";
import { loadSaved, saveSaved, type Person } from "./storage";

const MAX_PEOPLE = 8;

const LANE_COLORS = ["#1f4d3a", "#1e4d7b", "#6b3f69", "#8a5a12", "#3f4f44", "#7a3b2e"];

function systemZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function zoneList(): string[] {
  const supported = (Intl as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
  if (!supported) {
    return ["UTC", "America/Bogota", "America/New_York", "Europe/London", "Asia/Tokyo"];
  }
  return supported.call(Intl, "timeZone").slice().sort((a, b) => a.localeCompare(b));
}

function examplePeople(): Person[] {
  return [
    {
      id: "bogota",
      name: "Bogotá",
      timeZone: "America/Bogota",
      start: "09:00",
      end: "18:00",
    },
    {
      id: "nyc",
      name: "New York",
      timeZone: "America/New_York",
      start: "09:00",
      end: "17:00",
    },
    {
      id: "lon",
      name: "London",
      timeZone: "Europe/London",
      start: "09:00",
      end: "17:30",
    },
  ];
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `p-${Date.now()}`;
}

export function App() {
  const zones = useMemo(zoneList, []);
  const [people, setPeople] = useState<Person[]>(() => loadSaved()?.people ?? examplePeople());
  const [zoneDraft, setZoneDraft] = useState(() => loadSaved()?.displayZone ?? systemZone());
  const [displayZone, setDisplayZone] = useState(() => {
    const zone = loadSaved()?.displayZone ?? systemZone();
    return isValidTimeZone(zone) ? zone : systemZone();
  });
  const [date, setDate] = useState<CivilDate>(() => {
    const zone = loadSaved()?.displayZone ?? systemZone();
    return isValidTimeZone(zone) ? civilToday(zone) : civilToday("UTC");
  });
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);

  useEffect(() => {
    saveSaved({ people, displayZone: zoneDraft });
  }, [people, zoneDraft]);

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(id);
  }, [copied]);

  const model = useMemo(
    () => buildDay({ date, displayZone, people }),
    [date, displayZone, people],
  );

  function update(id: string, patch: Partial<Person>) {
    setPeople((current) =>
      current.map((person) => (person.id === id ? { ...person, ...patch } : person)),
    );
  }

  function addPerson() {
    if (people.length >= MAX_PEOPLE) return;
    const previous = people[people.length - 1];
    setPeople((current) => [
      ...current,
      {
        id: newId(),
        name: "",
        timeZone: isValidTimeZone(displayZone) ? displayZone : (previous?.timeZone ?? "UTC"),
        start: previous?.start ?? "09:00",
        end: previous?.end ?? "17:00",
      },
    ]);
  }

  function resetExample() {
    const zone = systemZone();
    setPeople(examplePeople());
    setZoneDraft(zone);
    setDisplayZone(isValidTimeZone(zone) ? zone : "UTC");
    setDate(isValidTimeZone(zone) ? civilToday(zone) : civilToday("UTC"));
    setCopied(false);
    setCopyError(false);
  }

  async function copySummary(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopyError(false);
      setCopied(true);
    } catch {
      setCopied(false);
      setCopyError(true);
    }
  }

  return (
    <div className="wrap">
      <header>
        <h1>samehour</h1>
        <p className="lede">The hours a few people actually share.</p>
      </header>

      <section className="panel" aria-label="Overlap">
        <div className="toolbar">
          <label className="field">
            Date
            <input
              type="date"
              value={toInputDate(date)}
              onChange={(event) => {
                const next = fromInputDate(event.target.value);
                if (next) setDate(next);
              }}
            />
          </label>
          <label className="field zone-field">
            Read times in
            <input
              list="zones"
              value={zoneDraft}
              spellCheck={false}
              autoComplete="off"
              onChange={(event) => {
                const value = event.target.value;
                setZoneDraft(value);
                if (isValidTimeZone(value)) setDisplayZone(value);
              }}
            />
          </label>
        </div>
        {!isValidTimeZone(zoneDraft) ? (
          <p className="issue" role="alert">
            That timezone isn't recognized.
          </p>
        ) : null}

        {"error" in model ? (
          <p className="issue" role="alert">
            {model.error}
          </p>
        ) : (
          <Timeline
            model={model}
            colors={people.map((person, index) => ({
              id: person.id,
              color: LANE_COLORS[index % LANE_COLORS.length] ?? "#1f4d3a",
            }))}
            onCopy={() => void copySummary(model.copyText)}
            copied={copied}
            copyError={copyError}
          />
        )}
      </section>

      <section className="panel" aria-label="People">
        <div className="people-head">
          <h2>People</h2>
          <span className="quiet">
            {people.length} of {MAX_PEOPLE}
          </span>
        </div>
        <div className="person head" aria-hidden="true">
          <span>Name</span>
          <span>Timezone</span>
          <span>Start</span>
          <span>End</span>
          <span />
        </div>
        {people.map((person) => {
          const issue = personIssue(person);
          const overnight = !issue && isOvernight(person.start, person.end);
          const label = person.name.trim() || "this person";
          return (
            <div className="person" key={person.id}>
              <input
                aria-label={`Name for ${label}`}
                value={person.name}
                placeholder="Name"
                onChange={(event) => update(person.id, { name: event.target.value })}
              />
              <input
                className="zone"
                aria-label={`Timezone for ${label}`}
                list="zones"
                spellCheck={false}
                autoComplete="off"
                value={person.timeZone}
                onChange={(event) => update(person.id, { timeZone: event.target.value })}
              />
              <input
                aria-label={`Start for ${label}, 24-hour`}
                placeholder="09:00"
                autoComplete="off"
                value={person.start}
                onChange={(event) => update(person.id, { start: event.target.value })}
                onBlur={(event) => {
                  const minutes = parseHm(event.target.value);
                  if (minutes !== null) update(person.id, { start: formatHm(minutes) });
                }}
              />
              <input
                aria-label={`End for ${label}, 24-hour`}
                placeholder="17:00"
                autoComplete="off"
                value={person.end}
                onChange={(event) => update(person.id, { end: event.target.value })}
                onBlur={(event) => {
                  const minutes = parseHm(event.target.value);
                  if (minutes !== null) update(person.id, { end: formatHm(minutes) });
                }}
              />
              <button
                type="button"
                className="remove"
                aria-label={`Remove ${label}`}
                onClick={() => setPeople((current) => current.filter((item) => item.id !== person.id))}
              >
                Remove
              </button>
              {issue ? <p className="issue">{issue}</p> : null}
              {overnight ? <p className="hint">Overnight, into the next morning.</p> : null}
            </div>
          );
        })}
        <datalist id="zones">
          {zones.map((zone) => (
            <option key={zone} value={zone} />
          ))}
        </datalist>
        <div className="actions">
          <button type="button" className="primary" onClick={addPerson} disabled={people.length >= MAX_PEOPLE}>
            Add person
          </button>
          <button type="button" onClick={resetExample}>
            Reset example
          </button>
        </div>
      </section>

      <p className="foot">Times are 24-hour. Nothing leaves this browser.</p>
    </div>
  );
}

function Timeline({
  model,
  colors,
  onCopy,
  copied,
  copyError,
}: {
  model: DayModel;
  colors: { id: string; color: string }[];
  onCopy: () => void;
  copied: boolean;
  copyError: boolean;
}) {
  const colorFor = new Map(colors.map((entry) => [entry.id, entry.color]));

  return (
    <>
      <div className="summary">
        <p>
          {model.dateLabel}.{" "}
          {model.rangeLabel ? (
            <>
              <strong>{model.totalLabel}</strong> in common, {model.rangeLabel}.
            </>
          ) : (
            <strong>{model.totalLabel}.</strong>
          )}
        </p>
        {model.outsideNote ? <p className="note">{model.outsideNote}</p> : null}
      </div>

      <div className="scale" aria-hidden="true">
        {model.ticks.map((tick) => (
          <span
            key={tick.hour}
            className="tick"
            style={{
              left: `${tick.left}%`,
              transform:
                tick.left < 4 ? "none" : tick.left > 96 ? "translateX(-100%)" : "translateX(-50%)",
            }}
          >
            {String(tick.hour).padStart(2, "0")}
          </span>
        ))}
      </div>

      <div>
        {model.lanes.map((lane) => (
          <div className="lane" key={lane.id}>
            <span className="lane-name">{lane.name}</span>
            <Track bars={lane.bars} color={colorFor.get(lane.id) ?? "#1f4d3a"} ticks={model.ticks} />
          </div>
        ))}
        <div className="lane shared">
          <span className="lane-name">Shared</span>
          <Track bars={model.sharedBars} shared ticks={model.ticks} />
        </div>
      </div>

      <div className="actions">
        <button type="button" onClick={onCopy}>
          Copy summary
        </button>
        {copied ? <span className="status">Copied.</span> : null}
        {copyError ? (
          <span className="status">Copy failed. The summary is in the text above.</span>
        ) : null}
      </div>
    </>
  );
}

function Track({
  bars,
  ticks,
  color,
  shared = false,
}: {
  bars: { left: number; width: number }[];
  ticks: { hour: number; left: number }[];
  color?: string;
  shared?: boolean;
}) {
  return (
    <div className="track" aria-hidden="true">
      {ticks.map((tick) => (
        <span key={tick.hour} className="gridline" style={{ left: `${tick.left}%` }} />
      ))}
      {bars.map((bar, index) => (
        <span
          key={`${bar.left}-${index}`}
          className={shared ? "segment shared" : "segment"}
          style={{
            left: `${bar.left}%`,
            width: `${bar.width}%`,
            background: shared ? undefined : color,
          }}
        />
      ))}
    </div>
  );
}
