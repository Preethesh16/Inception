import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Truck } from "lucide-react";

const StepScene = lazy(() => import("./StepScene"));
const STEP_MS = 5500;

const STEPS = [
  {
    title: "Onboard your inventory",
    meta: "~1 min",
    body: "Upload one CSV. Inception imports stock, batches, expiry dates and past usage, and the hospital joins the network.",
    panel: "Inventory import",
  },
  {
    title: "Forecast demand",
    meta: "Every 5 min",
    body: "A Chronos-2 model forecasts 28 days of demand per supply, checked against two baselines, with outbreak reports raising the planning floor.",
    panel: "Demand forecast",
  },
  {
    title: "Find the right partner",
    meta: "Automatic",
    body: "Only real risk triggers a search. Donors keep their own protected stock, and hospital agents negotiate whole-pack offers.",
    panel: "Partner search",
  },
  {
    title: "Approve and deliver",
    meta: "Two approvals",
    body: "Both hospitals approve the exact terms. Stock is reserved, picked up and credited on receipt, with every movement recorded.",
    panel: "Transfer",
  },
];

function Row({
  code,
  label,
  right,
  tone,
}: {
  code: ReactNode;
  label: string;
  right: ReactNode;
  tone?: "ok" | "muted";
}) {
  return (
    <div className={"how-row" + (tone === "muted" ? " is-muted" : "")}>
      <span className="how-code">{code}</span>
      <span className="how-row-label">{label}</span>
      <span className="how-row-right">{right}</span>
    </div>
  );
}

function Forecast() {
  // Illustrative 28-day forecast: P10–P90 band, median and remaining stock.
  const w = 520,
    h = 150;
  const days = Array.from({ length: 29 }, (_, i) => i);
  const x = (d: number) => (d / 28) * w;
  const med = (d: number) => 46 + d * 0.9 + Math.sin(d / 2.2) * 5 + (d > 10 && d < 18 ? 14 : 0);
  const y = (v: number) => h - (v / 110) * h;
  const top = days.map((d) => `${x(d)},${y(med(d) * 1.28)}`);
  const bottom = days.map((d) => `${x(d)},${y(med(d) * 0.76)}`).reverse();
  const line = days.map((d) => `${x(d)},${y(med(d))}`).join(" ");
  const stock = days.map((d) => `${x(d)},${y(Math.max(0, 104 - d * 11.5))}`).join(" ");
  return (
    <svg className="how-chart" viewBox={`0 0 ${w} ${h + 18}`} role="img" aria-label="Illustrative demand forecast with uncertainty band and stock running out on day 9">
      <polygon points={[...top, ...bottom].join(" ")} className="how-band" />
      <polyline points={line} className="how-median" />
      <polyline points={stock} className="how-stock" />
      <line x1={x(9)} x2={x(9)} y1={0} y2={h} className="how-marker" />
      <text x={x(9) + 6} y={14} className="how-chart-label">stock-out · day 9</text>
      <text x={0} y={h + 15} className="how-axis">today</text>
      <text x={w} y={h + 15} textAnchor="end" className="how-axis">+28 days</text>
    </svg>
  );
}

function Panel({ step }: { step: number }) {
  if (step === 0)
    return (
      <>
        <div className="how-card-head">
          <div>
            <h3>Kaveri General Hospital</h3>
            <p>A-hospital.csv · 3 supplies · 237 days of usage</p>
          </div>
          <span className="how-pill">Imported</span>
        </div>
        <Row code="ORS" label="Oral rehydration salts" right="3 batches" />
        <Row code="MSK" label="Surgical masks" right="2 batches" />
        <Row code="SAL" label="Normal saline" right="2 batches" />
        <p className="how-more">+ consumption, replenishments and expiry per batch</p>
      </>
    );
  if (step === 1)
    return (
      <>
        <div className="how-card-head">
          <div>
            <h3>ORS · next 28 days</h3>
            <p>Daily P10 / P50 / P90 · validated against two baselines</p>
          </div>
          <span className="how-pill is-warn">Shortage risk</span>
        </div>
        <Forecast />
        <p className="how-legend">
          <span className="sw band" /> P10–P90 <span className="sw med" /> median demand{" "}
          <span className="sw stock" /> projected stock
        </p>
      </>
    );
  if (step === 2)
    return (
      <>
        <div className="how-card-head">
          <div>
            <h3>Partner search · ORS</h3>
            <p>Forecast-gated · donor protection · whole packs</p>
          </div>
          <span className="how-pill">1 match</span>
        </div>
        <Row code="D" label="Mandya Regional" right={<span className="how-tag ok">Selected</span>} />
        <Row code="B" label="Chamundi Community" right={<span className="how-tag">Protected</span>} tone="muted" />
        <div className="how-message">
          <span className="how-code">Agent</span>
          Requesting whole packs of ORS from Mandya, arriving within two days.
        </div>
        <p className="how-more">+ up to three negotiation rounds per proposal</p>
      </>
    );
  return (
    <>
      <div className="how-card-head">
        <div>
          <h3>ORS transfer</h3>
          <p>Mandya Regional → Kaveri General</p>
        </div>
        <span className="how-pill">Reserved</span>
      </div>
      <Row code="A" label="Kaveri approved the terms" right={<Check size={16} className="how-ok" />} />
      <Row code="D" label="Mandya approved the terms" right={<Check size={16} className="how-ok" />} />
      <Row code={<Truck size={13} />} label="Picked up · in transit" right={<span className="how-tag ok">Live</span>} />
      <p className="how-more">+ received stock is credited only on confirmed receipt</p>
    </>
  );
}

export default function HowItWorks() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [held, setHeld] = useState(false);
  const [visible, setVisible] = useState(false);
  const holdTimer = useRef<number | undefined>(undefined);
  const section = useRef<HTMLElement>(null);
  const reduced =
    typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    const observer = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), {
      threshold: 0.3,
    });
    if (section.current) observer.observe(section.current);
    return () => observer.disconnect();
  }, []);

  // Advance through the steps while the section is on screen.
  const autoplay = !reduced && !paused && !held && visible;
  useEffect(() => {
    if (!autoplay) return;
    const timer = setTimeout(() => setActive((s) => (s + 1) % STEPS.length), STEP_MS);
    return () => clearTimeout(timer);
  }, [autoplay, active]);
  useEffect(() => () => clearTimeout(holdTimer.current), []);

  function choose(i: number) {
    setActive(i);
    setHeld(true);
    clearTimeout(holdTimer.current);
    holdTimer.current = window.setTimeout(() => setHeld(false), 15000);
  }

  return (
    <section className="how" id="how-it-works" ref={section} aria-labelledby="how-title">
      <div className="how-intro">
        <span className="how-eyebrow">How it works</span>
        <h2 id="how-title">From stock count to delivery in four supervised steps.</h2>
        <p>
          Inception runs the same loop for every hospital in the network:
          forecast first, search only when there is real risk, and move stock
          only after both hospitals agree.
        </p>
        <ol
          className="how-steps"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          {STEPS.map((s, i) => (
            <li key={s.title}>
              <button
                type="button"
                className="how-step"
                aria-pressed={i === active}
                aria-controls="how-panel"
                onClick={() => choose(i)}
              >
                <span className="how-num">{String(i + 1).padStart(2, "0")}</span>
                <span className="how-step-text">
                  <strong>{s.title}</strong>
                  <span className="how-step-body">{s.body}</span>
                  {i === active && (
                    <span
                      className={"how-progress" + (autoplay ? " is-running" : "")}
                      style={{ animationDuration: STEP_MS + "ms" }}
                      key={active}
                      aria-hidden="true"
                    />
                  )}
                </span>
                <span className="how-meta">{s.meta}</span>
              </button>
            </li>
          ))}
        </ol>
      </div>
      <div className="how-frame">
        <div className="how-frame-head">
          <span>{STEPS[active].panel}</span>
          <span>
            Step {active + 1} of {STEPS.length}
          </span>
        </div>
        <Suspense fallback={<div className="how-scene" aria-hidden="true" />}>
          <StepScene active={active} />
        </Suspense>
        <div className="how-card" id="how-panel" aria-live="polite" key={active}>
          <Panel step={active} />
        </div>
        <p className="how-note">Illustrative example using the demo hospitals.</p>
      </div>
    </section>
  );
}
