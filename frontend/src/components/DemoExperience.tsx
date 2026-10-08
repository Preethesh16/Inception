import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  ArrowRight,
  Building2,
  CheckCircle2,
  Download,
  Upload,
  Network,
} from "lucide-react";
import { api, post } from "../lib/api";
import type { Snapshot } from "../lib/types";
import { Button, Badge } from "./ui";

type Guide = {
  hospitals: {
    id: string;
    name: string;
    area: string;
    onboarded: boolean;
    history_rows: number;
  }[];
  scenarios: { id: string; title: string; description: string }[];
  refresh: {
    enabled: boolean;
    interval_seconds: number;
    last_check_at?: string;
    next_at?: string;
  };
};
const useGuide = (actor = "judge") =>
  useQuery({
    queryKey: ["guide", actor],
    queryFn: () => api<Guide>("/demo/guide", actor),
    refetchInterval: 5000,
  });
export function Landing() {
  const q = useGuide();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function reset() {
    setBusy(true);
    try {
      await post("/demo/onboarding-reset", "judge");
      await q.refetch();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="demo-landing">
      <header>
        <a className="brand" href="/">
          <Activity /> inception.
        </a>
        <Badge tone="green">LOCAL DEMONSTRATION</Badge>
      </header>
      <main>
        <span className="eyebrow">MEDICAL SUPPLY INTELLIGENCE</span>
        <h1>
          The right supplies.
          <br />A connected care network.
        </h1>
        <p className="landing-lead">
          Onboard two hospitals. See demand change. Follow a safe transfer from
          the first signal to confirmed delivery.
        </p>
        <div className="landing-steps">
          <span>01 · Import hospital data</span>
          <span>02 · Run a scenario</span>
          <span>03 · Approve & deliver</span>
        </div>
        {error && <p role="alert">{error}</p>}
        {q.error && <p role="alert">{String(q.error)}</p>}
        <div className="hospital-entry-grid">
          {q.data?.hospitals.map((h, i) => (
            <article key={h.id}>
              <div className="entry-top">
                <Building2 size={28} />
                <Badge tone={h.onboarded ? "green" : "amber"}>
                  {h.onboarded ? "Onboarded" : "Ready to onboard"}
                </Badge>
              </div>
              <small>
                HOSPITAL {String(i + 1).padStart(2, "0")} ·{" "}
                {i === 0 ? "REQUESTING FACILITY" : "POTENTIAL DONOR"}
              </small>
              <h2>{h.name}</h2>
              <p>
                {i === 0
                  ? "Review shortage forecasts, request support and approve incoming stock."
                  : "Inspect protected reserves, respond to requests and approve safe donations."}
              </p>
              <a className="button button-primary" href={"/hospital/" + h.id}>
                {h.onboarded ? "Open dashboard" : "Onboard hospital"}{" "}
                <ArrowRight size={16} />
              </a>
            </article>
          ))}
        </div>
        <a className="control-entry" href="http://localhost:5174">
          <Network />
          <div>
            <strong>Workflow control centre</strong>
            <p>
              Choose a scenario and present each stage as it actually happens.
            </p>
          </div>
          <ArrowRight />
        </a>
        <div className="landing-bottom">
          <p>
            Six fictional hospitals around Mysuru. Kaveri and Mandya are the two
            administrator workspaces. The other four provide regional context.
          </p>
          <Button variant="outline" disabled={busy} onClick={reset}>
            {busy ? "Preparing…" : "Start fresh onboarding demo"}
          </Button>
        </div>
        <small>
          Starting fresh clears all synthetic reports, approvals and transfers,
          and restores the opening scenario. Inventory is pre-seeded for the
          regional demo; onboarding replaces each selected hospital’s opening
          records with your validated imports.
        </small>
      </main>
    </div>
  );
}
export function Onboarding({ actor }: { actor: string }) {
  const q = useGuide(actor);
  const qc = useQueryClient();
  const [inventory, setInventory] = useState<File>();
  const [consumption, setConsumption] = useState<File>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const hospital = q.data?.hospitals.find((h) => h.id === actor);
  async function submit() {
    if (!inventory || !consumption) return;
    setBusy(true);
    setError("");
    const body = new FormData();
    body.append("inventory", inventory);
    body.append("consumption", consumption);
    try {
      await api("/onboarding", actor, { method: "POST", body });
      await qc.invalidateQueries();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  if (!hospital) return null;
  return (
    <section className="onboarding-card">
      <div className="entry-top">
        <div>
          <span className="eyebrow">HOSPITAL ONBOARDING</span>
          <h2>
            {hospital.onboarded
              ? "Your data is connected"
              : "Connect your opening inventory"}
          </h2>
        </div>
        <Badge tone={hospital.onboarded ? "green" : "amber"}>
          {hospital.onboarded ? "Complete" : "Import required for guided demo"}
        </Badge>
      </div>
      {hospital.onboarded ? (
        <p>
          <CheckCircle2 size={16} /> {hospital.history_rows} daily consumption
          records imported. Inventory and forecasts now use the validated
          hospital data. Scheduled replenishments and the facility profile use
          the supplied demo configuration.
        </p>
      ) : (
        <>
          <p>
            Download the two required CSVs, then upload them below. Both files
            are validated before any balances change. The files describe 5
            October 2026; start fresh from the landing page if the scenario has
            advanced.
          </p>
          <div className="file-downloads">
            {["inventory", "consumption", "profile", "replenishments"].map(
              (kind) => (
                <a
                  key={kind}
                  href={`/api/demo/files/${actor}/${kind}?session=demo-${actor}`}
                >
                  <Download size={15} />
                  {kind}
                  {kind === "profile" ? ".json" : ".csv"}
                  {["profile", "replenishments"].includes(kind)
                    ? " · reference"
                    : ""}
                </a>
              ),
            )}
          </div>
          <div className="import-fields">
            <label>
              1. Opening inventory CSV
              <input
                aria-label="Opening inventory CSV"
                type="file"
                accept=".csv"
                onChange={(e) => setInventory(e.target.files?.[0])}
              />
            </label>
            <label>
              2. Consumption history CSV
              <input
                aria-label="Consumption history CSV"
                type="file"
                accept=".csv"
                onChange={(e) => setConsumption(e.target.files?.[0])}
              />
            </label>
            <Button
              disabled={busy || !inventory || !consumption}
              onClick={submit}
            >
              <Upload size={16} />
              {busy ? "Validating…" : "Validate & onboard hospital"}
            </Button>
          </div>
          {error && (
            <p className="text-red" role="alert">
              {error}
            </p>
          )}
        </>
      )}
    </section>
  );
}
export function RefreshStatus({ actor }: { actor: string }) {
  const q = useGuide(actor);
  const r = q.data?.refresh;
  return (
    <div className="refresh-status">
      <span className="dot green" />
      <strong>
        {r?.enabled === false
          ? "Automatic refresh paused"
          : `Automatic forecast refresh · every ${(r?.interval_seconds || 300) / 60} minutes`}
      </strong>
      <span>
        {r?.last_check_at
          ? "Last check " + new Date(r.last_check_at).toLocaleTimeString()
          : "Waiting for scheduler"}
      </span>
      <small>
        New imports and reports trigger an immediate run. Unchanged inputs may
        reuse a labelled cache; scenario time advances only from the console.
      </small>
    </div>
  );
}
const STAGES = [
  [
    "ANALYSIS_STARTED",
    "Read the evidence",
    "The worker reads only completed observations at the scenario cutoff.",
  ],
  [
    "FORECAST_COMPLETED",
    "Forecast demand",
    "Inspect the selected model, uncertainty and incident adjustments.",
  ],
  [
    "RISK_UPDATED",
    "Calculate shortage & expiry",
    "Compare stock, expiry and confirmed supplier arrivals.",
  ],
  [
    "ALLOCATION_CREATED",
    "Find safe transfers",
    "Check donor protection, rejected options and unfilled demand.",
  ],
  [
    "APPROVAL_REQUIRED",
    "Review agent proposals",
    "Open each hospital’s AI communications. Both administrators approve the same terms.",
  ],
  [
    "TRANSFER_RESERVED",
    "Reserve approved stock",
    "Both approvals lock the accepted batches atomically.",
  ],
  [
    "DISPATCHED",
    "Pick up & dispatch",
    "Claim the courier job, then record pickup and transit.",
  ],
  [
    "RECEIVED",
    "Confirm receipt",
    "The recipient balance and audit ledger update together.",
  ],
];
export function ScenarioDirector({ data }: { data: Snapshot }) {
  const q = useGuide();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [follow, setFollow] = useState(true);
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const last = useRef("");
  const [pinned, setPinned] = useState<{
    id: string;
    generation: string;
  } | null>(() => {
    try {
      return JSON.parse(
        sessionStorage.getItem("inception-presenter-run") || "null",
      );
    } catch {
      return null;
    }
  });
  const selectedRun =
    pinned?.generation === data.demo.generation ? pinned.id : null;
  const active = data.jobs.findLast((j) =>
    ["queued", "running"].includes(j.status),
  );
  const run = selectedRun || active?.id || data.demo.latest_run;
  const events = data.events.filter((e) => e.run_id === run);
  const stageDone = STAGES.map(([type]) => events.some((e) => e.type === type));
  const latest = stageDone.lastIndexOf(true);
  const key = run + ":" + latest;
  useEffect(() => {
    if (follow && latest >= 0 && last.current !== key) {
      refs.current[Math.min(latest + 1, STAGES.length - 1)]?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
        block: "center",
      });
      last.current = key;
    }
  }, [key, latest, follow]);
  async function launch(id: string) {
    setBusy(true);
    setError("");
    try {
      const result = await post<{ job: { id: string; generation: string } }>(
        "/demo/scenarios/" + id,
        "judge",
      );
      setPinned(result.job);
      sessionStorage.setItem(
        "inception-presenter-run",
        JSON.stringify(result.job),
      );
      await qc.invalidateQueries();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="scenario-director">
      <div className="entry-top">
        <div>
          <span className="eyebrow">PRESENTER CONTROLS</span>
          <h2>Choose the story. Follow the evidence.</h2>
        </div>
        <label>
          <input
            type="checkbox"
            checked={follow}
            onChange={(e) => setFollow(e.target.checked)}
          />{" "}
          Follow live stages
        </label>
      </div>
      <p>
        Each scenario restores opening stock and clears prior reports and
        proposals, while keeping completed onboarding. Finish or cancel active
        deliveries first.
      </p>
      <div className="scenario-choice-grid">
        {q.data?.scenarios.map((s) => (
          <button
            key={s.id}
            disabled={busy || !!active}
            onClick={() => launch(s.id)}
          >
            <strong>{s.title}</strong>
            <span>{s.description}</span>
            <small>Load scenario →</small>
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-red">
          {error}
        </p>
      )}
      <RefreshStatus actor="judge" />
      <div className="stage-walkthrough">
        {STAGES.map(([type, title, description], i) => {
          const evidence = events.find((e) => e.type === type);
          return (
            <div
              ref={(el) => {
                refs.current[i] = el;
              }}
              className={"walk-stage " + (stageDone[i] ? "complete" : "")}
              key={type}
            >
              <span className="stage-number">
                {stageDone[i] ? "✓" : String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <h3>{title}</h3>
                <p>{description}</p>
                <small>
                  {evidence
                    ? new Date(evidence.at).toLocaleTimeString() + " · " + type
                    : latest === 3 && i === 4 && stageDone[3]
                      ? "No proposal yet: inspect allocation deficits and donor rejection reasons."
                      : "Waiting for backend event"}
                </small>
                {evidence && (
                  <details>
                    <summary>Inspect execution evidence</summary>
                    <pre>{JSON.stringify(evidence, null, 2)}</pre>
                  </details>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
