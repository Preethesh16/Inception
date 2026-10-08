import { useEffect, useMemo, useState } from "react";
import type { Snapshot } from "../lib/types";
export type UsageGuidance = { title: string; text: string };
const number = (n: number) =>
  n.toLocaleString(undefined, { maximumFractionDigits: 1 });
const day = (value: string) =>
  new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
export function UsageExplorer({
  data,
  onExplain,
}: {
  data: Snapshot;
  onExplain: (value: UsageGuidance) => void;
}) {
  const [product, setProduct] = useState("");
  const [range, setRange] = useState(30);
  const [selectedDate, setSelectedDate] = useState<string>();
  const forecast =
    data.forecasts.find((f) => f.supply_id === product) || data.forecasts[0];
  const supply = data.supplies.find((s) => s.id === forecast?.supply_id);
  const history = useMemo(
    () =>
      [...(forecast?.history || [])].sort((a, b) =>
        a.date.localeCompare(b.date),
      ),
    [forecast?.history],
  );
  const rows = useMemo(() => {
    const end = history.length
      ? Date.parse(history[history.length - 1].date)
      : 0;
    return history.filter((r) => Date.parse(r.date) > end - range * 86400000);
  }, [history, range]);
  const total = rows.reduce((sum, r) => sum + r.quantity, 0);
  const average = rows.length ? total / rows.length : 0;
  const peak = rows.reduce<(typeof rows)[number] | undefined>(
    (best, r) => (!best || r.quantity > best.quantity ? r : best),
    undefined,
  );
  const max = Math.max(1, ...rows.map((r) => r.quantity));
  const selected = rows.find((r) => r.date === selectedDate);
  const unit = supply?.unit || "unit";
  useEffect(() => {
    if (!forecast || !rows.length) {
      onExplain({
        title: "Your usage story starts here.",
        text: "There are no consumption records available in this view yet. Import your CSV and let the first analysis finish to explore its history.",
      });
      return;
    }
    if (selected) {
      const index = history.findIndex((r) => r.date === selected.date);
      const previous = history[index - 1];
      const difference = previous
        ? selected.quantity - previous.quantity
        : undefined;
      onExplain({
        title: `${day(selected.date)} · ${supply?.name || forecast.supply_id}`,
        text: `${number(selected.quantity)} ${unit} consumed. ${difference === undefined ? "This is the first available observation." : `${number(Math.abs(difference))} ${unit} ${difference >= 0 ? "more" : "fewer"} than the previous recorded day.`} The selected period averages ${number(average)} ${unit} per recorded day. This day is ${selected.quantity > average ? "above average, shown in amber" : "at or below average, shown in green"}.${selected.imputed ? " This observation was flagged; the forecast uses a causal imputed value instead of treating it as normal demand." : " A higher day alone does not establish an outbreak."}`,
      });
    } else
      onExplain({
        title: `${supply?.name || forecast.supply_id} · last ${range} days`,
        text: `${number(total)} ${unit} consumed across ${rows.length} recorded days, averaging ${number(average)} per recorded day. Peak usage was ${number(peak?.quantity || 0)} on ${day(peak!.date)}. Amber bars are above this period’s average; green bars are at or below it. Hover, tap, or focus a bar and I’ll explain that day. These are historical observations, not future forecasts.`,
      });
  }, [
    forecast,
    rows,
    selected,
    history,
    supply,
    unit,
    average,
    total,
    peak,
    range,
    onExplain,
  ]);
  if (!forecast || !rows.length)
    return (
      <div className="usage-empty">
        Your consumption chart will appear after CSV import and the first
        analysis.
      </div>
    );
  return (
    <div className="usage-explorer">
      <div className="usage-controls">
        <label>
          Product
          <select
            aria-label="Usage product"
            value={forecast.supply_id}
            onChange={(e) => {
              setProduct(e.target.value);
              setSelectedDate(undefined);
            }}
          >
            {data.forecasts.map((f) => (
              <option key={f.id} value={f.supply_id}>
                {data.supplies.find((s) => s.id === f.supply_id)?.name ||
                  f.supply_id}
              </option>
            ))}
          </select>
        </label>
        <div className="usage-ranges" aria-label="Usage date range">
          {[7, 14, 30].map((days) => (
            <button
              key={days}
              aria-pressed={range === days}
              onClick={() => {
                setRange(days);
                setSelectedDate(undefined);
              }}
            >
              {days} days
            </button>
          ))}
        </div>
      </div>
      <div
        className="usage-chart"
        key={`${forecast.supply_id}-${range}`}
        role="group"
        aria-label="Daily consumption chart"
      >
        <div
          className="usage-average"
          style={{ bottom: `${(average / max) * 85}%` }}
        >
          <span>Average {number(average)}</span>
        </div>
        {rows.map((r, index) => (
          <div className="usage-column" key={r.date}>
            <button
              className={`usage-bar ${r.quantity > average ? "is-above-average" : ""} ${selected?.date === r.date ? "is-selected" : ""} ${r.imputed ? "is-flagged" : ""}`}
              style={{
                height: `${Math.max(1, (r.quantity / max) * 85)}%`,
                animationDelay: `${Math.min(index * 25, 350)}ms`,
              }}
              aria-label={`${day(r.date)}: ${r.quantity} ${unit}${r.quantity > average ? ", above period average" : ", at or below period average"}${r.imputed ? ", flagged observation" : ""}`}
              aria-pressed={selected?.date === r.date}
              onMouseEnter={() => setSelectedDate(r.date)}
              onFocus={() => setSelectedDate(r.date)}
              onClick={() => setSelectedDate(r.date)}
            >
              <span>{number(r.quantity)}</span>
            </button>
          </div>
        ))}
      </div>
      <div className="usage-axis">
        <span>{day(rows[0].date)}</span>
        <span>Observed consumption · {unit}</span>
        <span>{day(rows[rows.length - 1].date)}</span>
      </div>
      <div className="usage-color-key" aria-label="Consumption colour legend">
        <span>
          <i className="usage-key-green" />
          At or below average
        </span>
        <span>
          <i className="usage-key-amber" />
          Above average
        </span>
      </div>
      <div className="usage-metrics">
        <div>
          <span>Total consumed</span>
          <strong>
            {number(total)} <small>{unit}</small>
          </strong>
        </div>
        <div>
          <span>Daily average</span>
          <strong>
            {number(average)} <small>{unit}</small>
          </strong>
        </div>
        <div>
          <span>Highest usage · {day(peak!.date)}</span>
          <strong>
            {number(peak!.quantity)} <small>{unit}</small>
          </strong>
        </div>
      </div>
    </div>
  );
}
