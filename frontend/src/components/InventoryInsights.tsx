import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, fmt, date } from "../lib/api";
import type { Snapshot } from "../lib/types";
import type { UsageGuidance } from "./UsageExplorer";
type Lot = {
  id: string;
  lot: string;
  quantity: number;
  available: number;
  reserved: number;
  expires_at: string;
  arrives_at: string;
  incoming: boolean;
  excluded_reason: string | null;
  used: number;
  waste: number;
  remaining: number;
  first_day: number | null;
  last_day: number | null;
};
type Plan = {
  status: string;
  horizon: number;
  model: string;
  as_of: string;
  demand: number;
  unmet: number;
  waste: number;
  stockout_days: number | null;
  lots: Lot[];
  days: {
    day: number;
    date: string;
    demand: number;
    stock: number;
    unmet: number;
    allocations: { id: string; quantity: number }[];
  }[];
};
export function InventoryInsights({
  data,
  actor,
  onExplain,
}: {
  data: Snapshot;
  actor: string;
  onExplain: (value: UsageGuidance) => void;
}) {
  const [product, setProduct] = useState(data.supplies[0]?.id || "");
  const [horizon, setHorizon] = useState(28);
  const [scenario, setScenario] = useState("planning");
  const [selected, setSelected] = useState<string>();
  const [day, setDay] = useState(1);
  const currentProduct = data.supplies.some((s) => s.id === product)
    ? product
    : data.supplies[0]?.id || "";
  const supply = data.supplies.find((s) => s.id === currentProduct);
  const query = useQuery({
    queryKey: [
      "inventory-insights",
      actor,
      currentProduct,
      horizon,
      scenario,
      data.demo.revision,
      data.demo.latest_run,
    ],
    queryFn: () =>
      api<Plan>(
        `/inventory/insights?supply_id=${encodeURIComponent(currentProduct)}&horizon=${horizon}&scenario=${scenario}`,
        actor,
      ),
    enabled: !!currentProduct,
    refetchInterval: 5000,
  });
  const plan = query.data;
  useEffect(() => {
    setDay(1);
    setSelected(undefined);
    onExplain({
      title: "Use the earliest expiring usable lot first",
      text: "This plan matches forecast demand to unreserved stock in expiry order. Select a lot or a day to see which batch is expected to be used. This is a forecast-based plan; exploring it does not consume or edit inventory.",
    });
  }, [currentProduct, horizon, scenario]);
  const explainLot = (lot: Lot) => {
    setSelected(lot.id);
    onExplain({
      title: lot.lot,
      text: lot.excluded_reason
        ? `${lot.excluded_reason}. This lot is excluded from the usage plan. ${lot.reserved} units are reserved.`
        : `${fmt(lot.used)} ${supply?.unit} are projected to be used ${lot.first_day ? `between day ${lot.first_day} and day ${lot.last_day}` : "during this period"}. ${fmt(lot.waste)} may expire unused and ${fmt(lot.remaining)} remain after the selected horizon. Expiry: ${date(lot.expires_at)}. ${lot.incoming ? `This is a confirmed incoming lot, available only after ${date(lot.arrives_at)}.` : "Earlier-expiring usable lots are consumed before later-expiring ones."}`,
    });
  };
  const explainDay = (value: number) => {
    setDay(value);
    const d = plan?.days[value - 1];
    if (!d) return;
    onExplain({
      title: `${date(d.date)} · Usage plan`,
      text: `Forecast demand: ${fmt(d.demand)} ${supply?.unit}. ${d.allocations.length ? d.allocations.map((a) => `${plan?.lots.find((l) => l.id === a.id)?.lot || a.id}: ${fmt(a.quantity)} units`).join("; ") : "No usable lot supplies demand on this day."} ${fmt(d.unmet)} units remain unmet on this day. These are projected quantities, not recorded consumption.`,
    });
  };
  if (!currentProduct)
    return (
      <section className="trio-card">
        <h2>Connect inventory to see insights</h2>
        <p>
          Upload your hospital CSV first. Usage plans need batches and a
          completed forecast.
        </p>
      </section>
    );
  const selectedDay = plan?.days[day - 1];
  const nextLot = plan?.lots.find(
    (l) => !l.excluded_reason && l.first_day === 1 && !l.incoming,
  );
  return (
    <div className="inventory-insights">
      <section className="trio-card insight-controls">
        <div>
          <span className="eyebrow">FORECAST TO ACTION</span>
          <h2>Your lot-by-lot usage plan</h2>
          <p>
            See what to use first, when each lot is needed, and what could
            expire unused.
          </p>
        </div>
        <div className="insight-filters">
          <label>
            Product
            <select
              aria-label="Product"
              value={currentProduct}
              onChange={(e) => setProduct(e.target.value)}
            >
              {data.supplies.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Planning window
            <select
              aria-label="Planning window"
              value={horizon}
              onChange={(e) => setHorizon(Number(e.target.value))}
            >
              {[7, 14, 28].map((n) => (
                <option key={n} value={n}>
                  {n} days
                </option>
              ))}
            </select>
          </label>
          <label>
            Demand scenario
            <select
              aria-label="Demand scenario"
              value={scenario}
              onChange={(e) => setScenario(e.target.value)}
            >
              <option value="planning">Expected planning demand</option>
              <option value="stress">Higher-demand stress scenario</option>
            </select>
          </label>
        </div>
      </section>
      {query.isLoading && <p role="status">Calculating lot usage…</p>}
      {query.error && (
        <p role="alert">Could not load the usage plan. Please try again.</p>
      )}
      {plan && plan.status !== "ready" && (
        <section className="trio-card">
          <h2>Waiting for an up-to-date forecast</h2>
          <p>The analysis must finish before we recommend which lots to use.</p>
        </section>
      )}
      {plan?.status === "ready" && (
        <>
          <section className="trio-card insight-priority">
            <div>
              <span className="eyebrow">START HERE</span>
              <h2>
                {nextLot ? `Use ${nextLot.lot} first` : "Review the daily plan"}
              </h2>
              <p>
                {nextLot
                  ? `Expires ${date(nextLot.expires_at)} · ${fmt(nextLot.available)} ${supply?.unit} available. First-expiry-first-out prioritises this usable lot.`
                  : "No current lot is scheduled for use on day one. Check demand, confirmed arrivals and excluded batches below."}
              </p>
              {nextLot && (
                <button
                  className="button button-outline"
                  onClick={() => explainLot(nextLot)}
                >
                  Explain this lot
                </button>
              )}
            </div>
            <div className="insight-totals">
              <div>
                <small>Forecast demand</small>
                <strong>{fmt(plan.demand)}</strong>
                <span>{supply?.unit}</span>
              </div>
              <div>
                <small>Projected expiry waste</small>
                <strong>{fmt(plan.waste)}</strong>
                <span>{supply?.unit}</span>
              </div>
              <div>
                <small>Unmet forecast demand</small>
                <strong>{fmt(plan.unmet)}</strong>
                <span>{supply?.unit}</span>
              </div>
            </div>
          </section>
          <section className="trio-card">
            <div className="insight-heading">
              <div>
                <h2>When to use each lot</h2>
                <p>
                  Select a row or a day. Blue shows projected use; amber marks
                  expiry.
                </p>
              </div>
              <span>
                {plan.horizon} days · {plan.model}
              </span>
            </div>
            <div className="lot-timeline-scroll">
              <div className="lot-timeline" style={{ minWidth: 650 }}>
                <div className="lot-timeline-axis">
                  <span>Lot · expiry order</span>
                  <div
                    style={{
                      gridTemplateColumns: `repeat(${plan.horizon},1fr)`,
                    }}
                  >
                    {plan.days.map((d) => (
                      <button
                        key={d.day}
                        aria-label={`Explore day ${d.day}`}
                        aria-pressed={day === d.day}
                        onClick={() => explainDay(d.day)}
                      >
                        {d.day}
                      </button>
                    ))}
                  </div>
                </div>
                {plan.lots.map((lot) => (
                  <div
                    key={lot.id}
                    className={
                      "lot-timeline-row " +
                      (selected === lot.id ? "is-selected" : "")
                    }
                  >
                    <button
                      className="lot-name"
                      onClick={() => explainLot(lot)}
                      aria-pressed={selected === lot.id}
                    >
                      <strong>{lot.lot}</strong>
                      <small>
                        {lot.excluded_reason ||
                          (lot.incoming
                            ? "Confirmed arrival"
                            : `${fmt(lot.available)} ${supply?.unit}`)}
                      </small>
                    </button>
                    <div
                      className="lot-day-grid"
                      style={{
                        gridTemplateColumns: `repeat(${plan.horizon},1fr)`,
                      }}
                    >
                      {plan.days.map((d) => {
                        const used =
                          d.allocations.find((a) => a.id === lot.id)
                            ?.quantity || 0;
                        const expiryDay = Math.ceil(
                          (Date.parse(lot.expires_at) -
                            Date.parse(plan.as_of)) /
                            86400000,
                        );
                        return (
                          <button
                            key={d.day}
                            className={
                              (used > 0 ? "has-use " : "") +
                              (d.day === expiryDay ? "expiry-day" : "")
                            }
                            aria-label={`${lot.lot}, day ${d.day}, ${fmt(used)} units planned${d.day === expiryDay ? ", expiry boundary" : ""}`}
                            onClick={() => {
                              setDay(d.day);
                              setSelected(lot.id);
                              onExplain({
                                title: `${lot.lot} · ${date(d.date)}`,
                                text: `${fmt(used)} ${supply?.unit} are projected from this lot on this day. ${lot.excluded_reason || `Expiry: ${date(lot.expires_at)}. The schedule uses available stock in expiry order.`} Total forecast demand on this day is ${fmt(d.demand)} units.`,
                              });
                            }}
                            title={`${fmt(used)} ${supply?.unit}`}
                          >
                            <span>{used > 0 ? "●" : ""}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <p className="microcopy">
              Day 1 starts on the scenario date. A daily cell can include use
              before an expiry boundary within that day. Reserved, expired and
              quarantined stock are excluded.
            </p>
          </section>
          <section className="trio-card insight-day">
            <h2>Explore a day</h2>
            <label>
              Day {day} · {selectedDay && date(selectedDay.date)}
              <input
                type="range"
                min="1"
                max={plan.horizon}
                value={day}
                aria-label="Usage plan day"
                onChange={(e) => explainDay(Number(e.target.value))}
              />
            </label>
            <div className="insight-day-lots">
              {selectedDay?.allocations.map((a) => (
                <button
                  key={a.id}
                  onClick={() => {
                    const lot = plan.lots.find((l) => l.id === a.id);
                    if (lot) explainLot(lot);
                  }}
                >
                  <small>
                    {plan.lots.find((l) => l.id === a.id)?.lot || a.id}
                  </small>
                  <strong>
                    {fmt(a.quantity)} {supply?.unit}
                  </strong>
                </button>
              ))}
              {!selectedDay?.allocations.length && (
                <p>No lot is scheduled for use on this day.</p>
              )}
            </div>
            <p>
              Demand: {fmt(selectedDay?.demand)} · Unmet:{" "}
              {fmt(selectedDay?.unmet)} · Stock at day end:{" "}
              {fmt(selectedDay?.stock)} {supply?.unit}
            </p>
          </section>
          <section className="trio-card">
            <h2>What happens to each lot?</h2>
            <div className="insight-legend">
              <span>Blue · projected use</span>
              <span>Amber · expires unused</span>
              <span>Light · remains at horizon end</span>
            </div>
            {plan.lots.map((lot) => (
              <button
                className="lot-outcome"
                key={lot.id}
                onClick={() => explainLot(lot)}
              >
                <span>
                  <strong>{lot.lot}</strong>
                  <small>
                    {lot.excluded_reason ||
                      `${fmt(lot.used)} used · ${fmt(lot.waste)} expire unused · ${fmt(lot.remaining)} remain`}
                  </small>
                </span>
                <span className="lot-outcome-bar">
                  <i
                    style={{
                      width: `${lot.available ? (lot.used / lot.available) * 100 : 0}%`,
                    }}
                  />
                  <i
                    className="waste"
                    style={{
                      width: `${lot.available ? (lot.waste / lot.available) * 100 : 0}%`,
                    }}
                  />
                </span>
              </button>
            ))}
            <p className="microcopy">
              Projected quantities follow the selected forecast scenario, expiry
              times and confirmed arrivals. This planning view does not edit
              inventory or record consumption.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
