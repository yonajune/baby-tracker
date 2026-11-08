import { useState } from "react";
import type { FormEvent } from "react";
import {
  loadActivities,
  saveActivities,
  sortActivities,
  StorageChangedError,
} from "./activity";
import type { Activity, FeedType, LoadResult } from "./activity";

type Kind = Activity["kind"];
const names = { feed: "Feed", sleep: "Sleep", diaper: "Diaper" };
const symbols = { feed: "◒", sleep: "☾", diaper: "◇" };
const feedNames: Record<FeedType, string> = {
  "breast milk": "Breast milk",
  formula: "Formula",
  solids: "Solids",
  other: "Other",
};
const dateFormat = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function localNow() {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

function initialData(): LoadResult {
  try {
    return loadActivities(window.localStorage);
  } catch {
    return { status: "unavailable" };
  }
}

function details(activity: Activity) {
  if (activity.kind === "feed") {
    return (
      [
        activity.feedType && feedNames[activity.feedType],
        activity.amount !== undefined && `${activity.amount} ml`,
      ]
        .filter(Boolean)
        .join(" · ") || "Feeding"
    );
  }
  if (activity.kind === "diaper")
    return {
      wet: "Wet diaper",
      dirty: "Dirty diaper",
      both: "Wet + dirty diaper",
    }[activity.diaperType];
  const minutes = Math.round(
    (Date.parse(activity.end) - Date.parse(activity.timestamp)) / 60_000,
  );
  const duration =
    minutes < 1
      ? "Less than a minute"
      : [
          minutes >= 60 && `${Math.floor(minutes / 60)}h`,
          minutes % 60 > 0 && `${minutes % 60}m`,
        ]
          .filter(Boolean)
          .join(" ");
  return `${duration} · ended ${dateFormat.format(new Date(activity.end))}`;
}

export default function App() {
  const [loaded, setLoaded] = useState(initialData);
  const [activities, setActivities] = useState<Activity[]>(
    loaded.status === "ready" ? loaded.activities : [],
  );
  const [savedRaw, setSavedRaw] = useState(
    loaded.status === "ready" ? loaded.raw : null,
  );
  const [kind, setKind] = useState<Kind>("feed");
  const [timestamp, setTimestamp] = useState(localNow);
  const [end, setEnd] = useState(localNow);
  const [feedType, setFeedType] = useState<FeedType | "">("");
  const [amount, setAmount] = useState("");
  const [diaperType, setDiaperType] = useState<"wet" | "dirty" | "both">("wet");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState<Kind | "all">("all");

  function persist(next: Activity[]) {
    try {
      const raw = saveActivities(
        window.localStorage,
        next,
        loaded.status === "invalid" ? loaded.raw : savedRaw,
      );
      setSavedRaw(raw);
      setActivities(next);
      setError("");
      return true;
    } catch (cause) {
      setNotice("");
      setError(
        cause instanceof StorageChangedError
          ? "Saved data changed in another tab. This change wasn’t saved. Copy any unsaved form details, then reload this page to load the latest activity without overwriting it."
          : "This change wasn’t saved. Browser storage may be full or blocked. Your previous entries and this form are unchanged. Free up space or allow storage, then try again.",
      );
      return false;
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loaded.status !== "ready") return;
    const startDate = new Date(timestamp);
    const endDate = new Date(end);
    if (!timestamp || !Number.isFinite(startDate.getTime())) {
      setError("Choose a valid date and time.");
      return;
    }
    if (
      kind === "sleep" &&
      (!end || !Number.isFinite(endDate.getTime()) || endDate <= startDate)
    ) {
      setError("Sleep end must be after the start time.");
      return;
    }
    const parsedAmount = amount.trim() === "" ? undefined : Number(amount);
    if (
      kind === "feed" &&
      parsedAmount !== undefined &&
      (!Number.isFinite(parsedAmount) || parsedAmount <= 0)
    ) {
      setError("Enter an amount greater than zero, or leave it blank.");
      return;
    }
    const base = {
      id: crypto.randomUUID(),
      timestamp: startDate.toISOString(),
      note: note.trim(),
    };
    const activity: Activity =
      kind === "feed"
        ? {
            ...base,
            kind,
            ...(feedType && { feedType }),
            ...(parsedAmount !== undefined && { amount: parsedAmount }),
          }
        : kind === "sleep"
          ? { ...base, kind, end: endDate.toISOString() }
          : { ...base, kind, diaperType };
    if (persist(sortActivities([...activities, activity]))) {
      setAmount("");
      setNote("");
      setTimestamp(localNow());
      setEnd(localNow());
      setNotice(`${names[kind]} saved on this device.`);
    }
  }

  function retryStorage() {
    const result = initialData();
    setLoaded(result);
    if (result.status === "ready") {
      setActivities(result.activities);
      setSavedRaw(result.raw);
      setError("");
      setNotice("Saved activity loaded.");
    }
  }

  function downloadStoredData() {
    if (loaded.status !== "invalid") return;
    const url = URL.createObjectURL(
      new Blob([loaded.raw], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "baby-tracker-unreadable-data.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  const visible = activities.filter(
    (activity) => filter === "all" || activity.kind === filter,
  );

  return (
    <main className="app">
      <header className="page-header">
        <a className="brand" href="./" aria-label="Baby tracker home">
          <span className="brand-mark" aria-hidden="true">
            ✳
          </span>{" "}
          Baby tracker
        </a>
        <span className="device-badge">
          <span /> Only on this device
        </span>
      </header>

      <section className="intro" aria-labelledby="page-title">
        <p className="eyebrow">THE EVERYDAY, A LITTLE EASIER</p>
        <h1 id="page-title">
          Small moments.
          <br />
          <span>A little more peace of mind.</span>
        </h1>
        <p>A simple place to keep track of feeds, sleep, and diaper changes.</p>
      </section>

      {loaded.status !== "ready" && (
        <section className="storage-warning" role="alert">
          <h2>
            {loaded.status === "invalid"
              ? "Your saved data needs attention"
              : "Browser storage isn’t available"}
          </h2>
          <p>
            {loaded.status === "invalid"
              ? "We couldn’t read the saved activity. Nothing has been overwritten. Download the original data before choosing to start fresh."
              : "We can’t safely load or save activity. Allow local storage in your browser, then retry. No changes will be made until storage is available."}
          </p>
          <div className="warning-actions">
            <button type="button" className="secondary" onClick={retryStorage}>
              Retry storage
            </button>
            {loaded.status === "invalid" && (
              <>
                <button
                  type="button"
                  className="secondary"
                  onClick={downloadStoredData}
                >
                  Download original data
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    if (
                      window.confirm(
                        "Replace the unreadable saved data with an empty activity list? Download the original data first if you need to keep it. This cannot be undone.",
                      ) &&
                      persist([])
                    ) {
                      setLoaded({ status: "ready", activities: [], raw: null });
                      setNotice("Started a new activity list.");
                    }
                  }}
                >
                  Start fresh
                </button>
              </>
            )}
          </div>
        </section>
      )}

      <div className="workspace">
        <section className="entry-card" aria-labelledby="entry-title">
          <div className="section-heading">
            <h2 id="entry-title">Log a little moment</h2>
            <span className="tiny-flower" aria-hidden="true">
              ✳
            </span>
          </div>
          <div className="kind-picker" aria-label="Activity type">
            {(["feed", "sleep", "diaper"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={kind === value}
                className={kind === value ? "selected" : ""}
                onClick={() => {
                  setKind(value);
                  setError("");
                  setNotice("");
                }}
              >
                <span aria-hidden="true">{symbols[value]}</span>
                {names[value]}
              </button>
            ))}
          </div>
          <form onSubmit={submit}>
            <fieldset disabled={loaded.status !== "ready"}>
              <label htmlFor="timestamp">
                {kind === "sleep" ? "Sleep started" : "When"}
              </label>
              <input
                id="timestamp"
                type="datetime-local"
                required
                value={timestamp}
                onChange={(event) => setTimestamp(event.target.value)}
              />
              {kind === "sleep" && (
                <>
                  <label htmlFor="end">Sleep ended</label>
                  <input
                    id="end"
                    type="datetime-local"
                    required
                    value={end}
                    onChange={(event) => setEnd(event.target.value)}
                  />
                  <p className="field-hint">
                    Log a completed nap or night’s sleep.
                  </p>
                </>
              )}
              {kind === "feed" && (
                <div className="field-row">
                  <div>
                    <label htmlFor="feed-type">
                      Feed type <span>(optional)</span>
                    </label>
                    <select
                      id="feed-type"
                      value={feedType}
                      onChange={(event) =>
                        setFeedType(event.target.value as FeedType | "")
                      }
                    >
                      <option value="">Choose a type</option>
                      {Object.entries(feedNames).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="amount">
                      Amount <span>(optional)</span>
                    </label>
                    <div className="input-unit">
                      <input
                        id="amount"
                        type="number"
                        min="0"
                        step="any"
                        placeholder="e.g. 120"
                        value={amount}
                        onChange={(event) => setAmount(event.target.value)}
                      />
                      <span>ml</span>
                    </div>
                  </div>
                </div>
              )}
              {kind === "diaper" && (
                <>
                  <label htmlFor="diaper-type">Diaper type</label>
                  <select
                    id="diaper-type"
                    value={diaperType}
                    onChange={(event) =>
                      setDiaperType(event.target.value as typeof diaperType)
                    }
                  >
                    <option value="wet">Wet</option>
                    <option value="dirty">Dirty</option>
                    <option value="both">Wet + dirty</option>
                  </select>
                </>
              )}
              <label htmlFor="note">
                A little note <span>(optional)</span>
              </label>
              <textarea
                id="note"
                rows={3}
                maxLength={1000}
                placeholder="Anything you’d like to remember…"
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
              <button className="save-button" type="submit">
                <span aria-hidden="true">＋</span> Save{" "}
                {names[kind].toLowerCase()}
              </button>
            </fieldset>
          </form>
          <p className="save-note">
            No account. No cloud. Just your little day.
          </p>
        </section>

        <section className="activity-panel" aria-labelledby="activity-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">ONE MOMENT AT A TIME</p>
              <h2 id="activity-title">Recent activity</h2>
            </div>
            <span className="entry-count">
              {activities.length}{" "}
              {activities.length === 1 ? "entry" : "entries"}
            </span>
          </div>
          <div className="filters" aria-label="Filter activity">
            {(["all", "feed", "sleep", "diaper"] as const).map((value) => (
              <button
                type="button"
                key={value}
                className={filter === value ? "active" : ""}
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {value === "all" ? "All activity" : names[value]}
              </button>
            ))}
          </div>
          <div className="feedback" aria-live="polite">
            {notice && (
              <p className="success-message" role="status">
                {notice}
              </p>
            )}
          </div>
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
          {visible.length === 0 ? (
            <div className="empty-state">
              <span className="empty-symbol" aria-hidden="true">
                ☀
              </span>
              <h3>
                {loaded.status !== "ready"
                  ? "Let’s get storage ready"
                  : activities.length
                    ? "No moments of this kind yet"
                    : "A fresh start to your little day"}
              </h3>
              <p>
                {loaded.status !== "ready"
                  ? "Resolve the storage message above to see your activity."
                  : "Log a moment and it will appear here, ready when you need it."}
              </p>
            </div>
          ) : (
            <ul className="activity-list">
              {visible.map((activity) => (
                <li key={activity.id} className="activity-item">
                  <span
                    className={`activity-icon ${activity.kind}`}
                    aria-hidden="true"
                  >
                    {symbols[activity.kind]}
                  </span>
                  <div className="activity-copy">
                    <div className="activity-title">
                      <h3>{names[activity.kind]}</h3>
                      <time dateTime={activity.timestamp}>
                        {dateFormat.format(new Date(activity.timestamp))}
                      </time>
                    </div>
                    <p className="activity-detail">{details(activity)}</p>
                    {activity.note && (
                      <p className="activity-note">{activity.note}</p>
                    )}
                  </div>
                  <button
                    className="delete-button"
                    type="button"
                    aria-label={`Delete ${names[activity.kind].toLowerCase()} from ${dateFormat.format(new Date(activity.timestamp))}`}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Delete this ${names[activity.kind].toLowerCase()} entry? This cannot be undone.`,
                        ) &&
                        persist(
                          activities.filter((item) => item.id !== activity.id),
                        )
                      )
                        setNotice("Entry deleted.");
                    }}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="activity-footnote">The newest moments come first.</p>
        </section>
      </div>
      <footer>
        <span className="footer-flower" aria-hidden="true">
          ✳
        </span>
        <p>
          For the beautifully ordinary days.
          <br />
          <span>
            Only in this browser. No sync or backup. Clearing browser data
            removes activity.
          </span>
        </p>
      </footer>
    </main>
  );
}
