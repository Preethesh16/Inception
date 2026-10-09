import { useEffect, useRef, useState } from "react";
import type { Forecast, Risk, Supply } from "../lib/types";
import { fmt, days } from "../lib/api";
import { Badge } from "./ui";
import { ForecastChart } from "./ForecastChart";
type Checkpoint = {
  run: string;
  need: number;
  stock: number;
  coverage: number | null;
};
export function ForecastSummary({
  forecast: f,
  risk: r,
  supply,
  updating = false,
}: {
  forecast?: Forecast;
  risk?: Risk;
  supply?: Supply;
  updating?: boolean;
}) {
  const [previous, setPrevious] = useState<Checkpoint | null>(null);
  const current = useRef("");
  useEffect(() => {
    if (!f || !r || updating) return;
    const key = "forecast-checkpoint-" + f.id;
    const mark = f.id + ":" + f.run_id;
    if (current.current === mark) return;
    current.current = mark;
    try {
      const old = JSON.parse(sessionStorage.getItem(key) || "null") as
        (Checkpoint & { previous?: Checkpoint | null }) | null;
      const prior =
        old && old.run !== f.run_id
          ? {
              run: old.run,
              need: old.need,
              stock: old.stock,
              coverage: old.coverage,
            }
          : old?.previous || null;
      setPrevious(prior);
      sessionStorage.setItem(
        key,
        JSON.stringify({
          run: f.run_id,
          need: r.demand_7,
          stock: r.stock,
          coverage: r.stockout_days,
          previous: prior,
        }),
      );
    } catch {
      setPrevious(null);
    }
  }, [f?.id, f?.run_id, updating]);
  if (!f || !r)
    return (
      <section className="trio-card">
        <h2>Awaiting hospital onboarding</h2>
        <p>
          Upload this hospital’s CSV to create its forecasts. No other
          hospital’s data is shown in its place.
        </p>
      </section>
    );
  const raw7 = f.p50.slice(0, 7).reduce((a, b) => a + b, 0);
  const adjustment = r.demand_7 - Math.round(raw7);
  const unit = supply?.unit || "unit";
  const history7 = f.history.slice(-7).reduce((a, b) => a + b.quantity, 0);
  return (
    <section
      className="trio-card forecast-summary"
      aria-label={(supply?.name || f.supply_id) + " forecast"}
    >
      <div className="forecast-title">
        <div>
          <span className="eyebrow">01 / UNDERSTAND THE FORECAST</span>
          <h2>{supply?.name || f.supply_id}</h2>
        </div>
        <Badge
          tone={
            updating
              ? "amber"
              : r.stockout_days !== null
                ? "red"
                : r.risk_review_required
                  ? "amber"
                  : "green"
          }
        >
          {updating
            ? "Updating…"
            : r.stockout_days !== null
              ? "Shortage projected"
              : r.risk_review_required
                ? "Uncertain demand: review stock"
                : "Central forecast covered for 28 days"}
        </Badge>
      </div>
      <p className="forecast-answer">
        You are expected to use{" "}
        <strong>
          {fmt(r.demand_7)} {unit}s over the next 7 days
        </strong>
        . You have{" "}
        <strong>
          {fmt(r.stock)} usable {unit}s
        </strong>
        .{" "}
        {r.stockout_days !== null ? (
          <>
            Stock is projected to run short in{" "}
            <strong>about {days(r.stockout_days)}</strong>, accounting for
            expiry and confirmed deliveries.
          </>
        ) : (
          <>
            No stock-out is projected within the next 28 days, accounting for
            expiry and confirmed deliveries.
          </>
        )}
      </p>
      {r.uncertainty?.available && (
        <div className="forecast-uncertainty">
          <p>
            <strong>Demand uncertainty:</strong>{" "}
            {((r.uncertainty.shortage_probability ?? 0) * 100).toFixed(1)}% of
            simulated paths run short. Average unmet demand:{" "}
            {fmt(r.uncertainty.expected_unmet)} {unit}s; 95th-percentile unmet
            demand: {fmt(r.uncertainty.unmet_p95)} {unit}s. Average expiry
            waste: {fmt(r.uncertainty.expected_waste)} {unit}s.
          </p>
          <small>
            {r.uncertainty.status.replaceAll("_", " ")} ·{" "}
            {r.uncertainty.independent_windows} non-overlapping historical
            windows. These are conditional simulation estimates, not guaranteed
            probabilities.
          </small>
          <details>
            <summary>Possible surge scenarios</summary>
            {Object.entries(r.surge_stress ?? {}).map(([scale, outcome]) => (
              <p key={scale}>
                {scale} planning demand: {fmt(outcome.unmet)} unmet {unit}s over
                28 days.
              </p>
            ))}
            <small>
              Stress tests only. No probability of an outbreak is assigned.
            </small>
          </details>
        </div>
      )}
      <div className="simple-numbers">
        <div>
          <small>Expected use · next 7 days</small>
          <strong>{fmt(r.demand_7)}</strong>
          <span>{unit}s</span>
        </div>
        <div>
          <small>Usable stock now</small>
          <strong>{fmt(r.stock)}</strong>
          <span>{unit}s, excluding reservations</span>
        </div>
        <div>
          <small>Projected to expire unused</small>
          <strong>{fmt(r.expiry_units)}</strong>
          <span>{unit}s · next 28 days</span>
        </div>
      </div>
      <div className="prediction-source">
        <strong>
          {updating
            ? "Showing the last completed result while analysis runs."
            : f.source === "live"
              ? "Calculated by a fresh model run."
              : "Reused prediction: the historical model inputs are unchanged."}
        </strong>
        <span>
          Model: {f.model} · calculated{" "}
          {new Date(f.computed_at).toLocaleString()} · history through{" "}
          {new Date(new Date(f.cutoff).getTime() - 86400000).toLocaleDateString(
            "en-IN",
          )}
        </span>
        <span>
          Forecast starts on the scenario date,{" "}
          {new Date(f.cutoff).toLocaleDateString("en-IN")}. The demo clock does
          not advance automatically.
        </span>
      </div>
      {previous && !updating && (
        <div className="forecast-change" role="status">
          <strong>What changed since the last result shown here?</strong>
          <p>
            7-day demand: {fmt(previous.need)} → {fmt(r.demand_7)} {unit}s.
            Usable stock: {fmt(previous.stock)} → {fmt(r.stock)}. Stock-out:{" "}
            {days(previous.coverage)} → {days(r.stockout_days)}.
          </p>
          <small>
            {previous.need === r.demand_7
              ? "The demand prediction stayed the same. Inventory or expiry edits affect available stock and coverage, not the historical consumption pattern."
              : "Expected use changed. See the model prediction and incident adjustment below."}
          </small>
        </div>
      )}
      <details className="forecast-explanation">
        <summary>How was this calculated?</summary>
        <ol>
          <li>
            <strong>Read this hospital’s consumption history.</strong>
            <p>
              The model uses up to 180 days of consumption history and weekday
              patterns. Missing or stock-constrained days are marked and
              estimated from earlier observations. The latest 7 recorded days
              total {fmt(history7)} units; that total is context, not a formula
              for the prediction.
            </p>
          </li>
          <li>
            <strong>Predict daily demand.</strong>
            <p>
              {f.model} produces 28 daily predictions. The first seven central
              predictions sum to{" "}
              <strong>
                {fmt(raw7)} {unit}s
              </strong>
              . Chronos remains the forecasting model; simpler forecasts are
              evaluated as benchmarks. Explicit offline test mode is labelled.
            </p>
            <div className="forecast-equation">
              {f.p50
                .slice(0, 7)
                .map((n) => n.toFixed(1))
                .join(" + ")}{" "}
              ≈ {fmt(raw7)} units
            </div>
          </li>
          <li>
            <strong>Account for supported incident requirements.</strong>
            <p>
              {adjustment > 0
                ? `The planning curve adds ${fmt(adjustment)} units over the raw 7-day forecast because of recorded incident evidence or reported requirements. Overlapping evidence is not added twice.`
                : "There is no additional 7-day incident requirement in this result. Planning demand matches the model prediction."}
            </p>
          </li>
          <li>
            <strong>Simulate the stock day by day.</strong>
            <p>
              Start with usable batches, add confirmed arrivals, consume the
              expected demand in expiry order, and remove stock that expires
              before use. The first unmet demand determines the stock-out
              estimate.
            </p>
          </li>
        </ol>
        <p className="microcopy">
          Future demand is an estimate, not a guarantee. The shaded band
          represents daily model uncertainty.
        </p>
      </details>
      <div className="forecast-chart-heading">
        <h3>Past consumption → expected daily use</h3>
        <div className="plain-chart-legend">
          <span>● Recorded use</span>
          <span>┄ Model prediction</span>
          <span>● Planning demand</span>
        </div>
      </div>
      <ForecastChart forecast={f} />
      <details>
        <summary>Inspect daily quantities and stock calculations</summary>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Day</th>
                <th>Model demand</th>
                <th>Planning demand</th>
                <th>Stock at day end</th>
                <th>Unmet units to date</th>
              </tr>
            </thead>
            <tbody>
              {f.planning.map((p, i) => (
                <tr key={i}>
                  <td>
                    {new Date(
                      new Date(f.cutoff).getTime() + i * 86400000,
                    ).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                    })}
                  </td>
                  <td>{f.p50[i].toFixed(1)}</td>
                  <td>{p.toFixed(1)}</td>
                  <td>{fmt(r.timeline?.[i]?.stock)}</td>
                  <td>{fmt(r.timeline?.[i]?.unmet)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="microcopy">
          Run {f.run_id} · input {f.input_hash.slice(0, 12)} · quantities
          rounded for display; calculations use full precision.
        </p>
      </details>
    </section>
  );
}
