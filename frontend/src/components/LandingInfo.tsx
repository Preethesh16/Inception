import { lazy, Suspense } from "react";
import {
  LineChart,
  Siren,
  ArrowLeftRight,
  ShieldCheck,
  MessagesSquare,
  ScrollText,
  Plus,
  ArrowRight,
} from "lucide-react";

const ShelfScene = lazy(() => import("./ShelfScene"));
const ShieldScene = lazy(() => import("./ShieldScene"));

const FEATURES = [
  {
    icon: LineChart,
    title: "Demand forecasting",
    body: "28-day daily forecasts per hospital and supply from Chronos-2, with P10–P90 uncertainty and automatic baseline checks.",
  },
  {
    icon: Siren,
    title: "Outbreak awareness",
    body: "Incident reports and unusual consumption raise the planning floor, so a local surge is visible before shelves run empty.",
  },
  {
    icon: ArrowLeftRight,
    title: "Expiry-aware redistribution",
    body: "Earliest-expiry-first simulation moves whole packs to hospitals that will actually use them before they expire.",
  },
  {
    icon: ShieldCheck,
    title: "Donor protection",
    body: "Partners keep at least seven days of their own forecast demand, so helping a neighbour never creates a new shortage.",
  },
  {
    icon: MessagesSquare,
    title: "Hospital agents",
    body: "Each hospital's agent explains the evidence and negotiates counteroffers within strict, server-checked limits.",
  },
  {
    icon: ScrollText,
    title: "Full audit trail",
    body: "Every approval, reservation, pickup and receipt is recorded, and the evidence behind each decision can be exported.",
  },
];

const FACTS = [
  ["28", "days of daily forecasts"],
  ["2", "approvals on every transfer"],
  ["7+", "days of donor stock protected"],
];

const FAQ = [
  {
    q: "Does Inception move stock on its own?",
    a: "No. Inception proposes transfers, but stock is only reserved after both hospitals approve the exact terms. Agents can suggest counteroffers; they cannot approve or move stock.",
  },
  {
    q: "Can a donor hospital run short by giving stock away?",
    a: "Donors keep a protected reserve covering the longer of seven days or delivery lead time plus two days, and only hospitals with no projected shortage are asked to give.",
  },
  {
    q: "How reliable are the forecasts?",
    a: "Each forecast is checked against two simple baselines at past cutoffs, and the model with the lowest error is used. Uncertainty is always shown, not hidden.",
  },
  {
    q: "What happens to stock that is about to expire?",
    a: "Genuinely unused expiring stock triggers a search for a hospital that will consume it before expiry, so it is used rather than wasted.",
  },
  {
    q: "Is this real hospital data?",
    a: "Not yet. The demo uses three fictional hospitals around Mysuru with synthetic data, so you can explore every step safely.",
  },
];

export default function LandingInfo({ onTryDemo }: { onTryDemo: () => void }) {
  return (
    <>
      <section className="info" id="features" aria-labelledby="features-title">
        <div className="info-head">
          <span className="how-eyebrow">Features</span>
          <h2 id="features-title">Everything a hospital network needs to stay supplied.</h2>
        </div>
        <div className="bento">
          <div className="bento-hero">
            <Suspense fallback={<div className="feature-scene" aria-hidden="true" />}>
              <ShelfScene />
            </Suspense>
            <div className="bento-hero-copy">
              <strong>Shared stock, not shared risk.</strong>
              <span>
                Every shelf in the network becomes visible, so surplus at one
                hospital can cover a shortage at another.
              </span>
            </div>
          </div>
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <article key={title} className="feature">
              <span className="feature-icon">
                <Icon size={20} aria-hidden="true" />
              </span>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
          <dl className="bento-facts">
            {FACTS.map(([n, label]) => (
              <div key={label}>
                <dt>{n}</dt>
                <dd>{label}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
      <section className="info info-faq" id="faq" aria-labelledby="faq-title">
        <div className="faq-side">
          <div className="info-head">
            <span className="how-eyebrow">FAQ</span>
            <h2 id="faq-title">Questions hospitals ask first.</h2>
            <p>Safeguards are built in at every step. Here is how they work.</p>
          </div>
          <div className="faq-visual">
            <Suspense fallback={<div className="faq-scene" aria-hidden="true" />}>
              <ShieldScene />
            </Suspense>
          </div>
          <div className="faq-cta">
            <div>
              <strong>Explore the demo network</strong>
              <span>Sign in as any of the three demo hospitals.</span>
            </div>
            <button type="button" onClick={onTryDemo}>
              Try the demo <ArrowRight size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className="faq-list">
          {FAQ.map(({ q, a }, i) => (
            <details key={q} className="faq" open={i === 0}>
              <summary>
                <span className="faq-num">{String(i + 1).padStart(2, "0")}</span>
                <span className="faq-q">{q}</span>
                <span className="faq-toggle">
                  <Plus size={16} aria-hidden="true" />
                </span>
              </summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>
    </>
  );
}
