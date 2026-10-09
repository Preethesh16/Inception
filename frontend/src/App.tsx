import type { components } from "./lib/generated-api";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  Boxes,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  Database,
  ExternalLink,
  FileText,
  GitBranch,
  HeartPulse,
  Loader2,
  MapPin,
  MessageSquare,
  MoreHorizontal,
  Package,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Truck,
  Upload,
  X,
  AlertTriangle,
  CheckCircle2,
  Play,
  PanelTop,
  Network,
} from "lucide-react";
import type {
  Snapshot,
  Negotiation,
  Forecast,
  Event,
  Supply,
} from "./lib/types";
import { api, post, fmt, days, date, exportUrl } from "./lib/api";
import { Button, Badge, Empty } from "./components/ui";
import { NetworkMap } from "./components/NetworkMap";
import { ForecastChart } from "./components/ForecastChart";
import {
  Onboarding,
  RefreshStatus,
  ScenarioDirector,
} from "./components/DemoExperience";
import { Workflow } from "./components/Workflow";

const consoleMode =
  window.location.port === "5174" ||
  new URLSearchParams(window.location.search).get("view") === "console";
const hospitalNav = [
  ["Inventory", Boxes],
  ["Forecast insights", BarChart3],
  ["AI communications", Truck],
] as const;
const consoleNav = [
  ["Network", Network],
  ["Execution", GitBranch],
  ["Negotiation", MessageSquare],
  ["Evidence", Database],
  ["Scenario lab", Play],
] as const;
function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const old = document.activeElement as HTMLElement;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const all = ref.current?.querySelectorAll<HTMLElement>(
          "button,input,textarea,select,a[href]",
        );
        if (!all?.length) return;
        const first = all[0],
          last = all[all.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    ref.current?.focus();
    return () => {
      document.removeEventListener("keydown", handler);
      old?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={ref}
        className={`modal ${wide ? "modal-wide" : ""}`}
      >
        <div className="modal-heading">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <Button variant="ghost" aria-label="Close dialog" onClick={onClose}>
            <X size={20} />
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}
function Panel({
  title,
  subtitle,
  action,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-heading">
        <div>
          <h3>{title}</h3>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
function Metric({
  label,
  value,
  note,
  icon,
  tone = "neutral",
}: {
  label: string;
  value: string;
  note: string;
  icon: ReactNode;
  tone?: string;
}) {
  return (
    <div className={`metric metric-${tone}`}>
      <div className="metric-top">
        <span>{label}</span>
        <span className="metric-icon">{icon}</span>
      </div>
      <strong>{value}</strong>
      <p>
        <i
          className={`dot ${tone === "danger" ? "red" : tone === "warning" ? "amber" : "green"}`}
        />
        {note}
      </p>
    </div>
  );
}
function RiskBadge({ value }: { value: number | null }) {
  return (
    <Badge tone={value === null ? "green" : value < 2 ? "red" : "amber"}>
      {value === null ? "Adequate" : value < 2 ? "Critical" : "Watch"}
    </Badge>
  );
}
function Timeline({ events }: { events: Event[] }) {
  return (
    <div className="timeline">
      {events
        .slice(-15)
        .reverse()
        .map((e) => (
          <details key={e.id} className="timeline-item">
            <summary>
              <span className="timeline-mark" />
              <div>
                <strong>{e.type.toLowerCase().replaceAll("_", " ")}</strong>
                <span>
                  {e.run_id?.slice(0, 8) || "System"}{" "}
                  {e.entity_id ? "· " + e.entity_id : ""}
                </span>
              </div>
              <time>
                {new Date(e.at).toLocaleTimeString("en-IN", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </time>
            </summary>
            <pre>{JSON.stringify(e.details, null, 2)}</pre>
          </details>
        ))}
      {!events.length && (
        <Empty
          title="Waiting for events"
          description="Actual backend actions appear here as they happen."
        />
      )}
    </div>
  );
}

export default function App() {
  const [facility, setFacility] = useState(
    window.location.pathname.split("/")[2] ||
      localStorage.getItem("inception-facility") ||
      "A",
  );
  const actor = consoleMode ? "judge" : facility;
  const [tab, setTab] = useState<string>(
    consoleMode ? "Scenario lab" : "Inventory",
  );
  const [supply, setSupply] = useState("ORS");
  const [selected, setSelected] = useState<string | null>(
    new URLSearchParams(window.location.search).get("negotiation"),
  );
  const [reportOpen, setReportOpen] = useState(false);
  const [detailSupply, setDetailSupply] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["snapshot", actor],
    queryFn: () => api<Snapshot>("/snapshot", actor),
    refetchInterval: 3500,
  });
  const data = q.data;
  useEffect(() => {
    localStorage.setItem("inception-facility", facility);
  }, [facility]);
  useEffect(() => {
    const es = new EventSource(`/api/events/stream?session=demo-${actor}`);
    let timer: ReturnType<typeof setTimeout> | undefined;
    es.onmessage = (e) => {
      const event = JSON.parse(e.data) as Event;
      if (timer) clearTimeout(timer);
      timer = setTimeout(
        () => qc.invalidateQueries({ queryKey: ["snapshot", actor] }),
        200,
      );
      if (
        event.type === "APPROVAL_REQUIRED" &&
        Date.now() - new Date(event.at).getTime() < 5000
      )
        setToast("A new redistribution recommendation is ready to review.");
    };
    return () => {
      es.close();
      if (timer) clearTimeout(timer);
    };
  }, [actor, qc]);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 6000);
      return () => clearTimeout(t);
    }
  }, [toast]);
  const act = async (
    path: string,
    body: unknown = {},
    success = "Updated successfully",
  ) => {
    setError("");
    setBusy(true);
    try {
      await post(path, actor, body);
      await qc.invalidateQueries({ queryKey: ["snapshot"] });
      setToast(success);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const activeJob = data?.jobs.findLast(
    (j) => j.status === "running" || j.status === "queued",
  );
  const openOffers =
    data?.negotiations.filter((n) => n.status === "Awaiting approvals") || [];
  const fc = data?.forecasts.find(
    (f) => f.facility_id === facility && f.supply_id === supply,
  );
  const ownRisks =
    data?.risks.filter((r) => !consoleMode || r.facility_id === facility) || [];
  const current = data?.facilities.find((f) => f.id === facility);
  const n = data?.negotiations.find((n) => n.id === selected);
  const near = ownRisks
    .filter((r) => r.stockout_days !== null)
    .sort((a, b) => a.stockout_days! - b.stockout_days!)[0];
  const nav = consoleMode ? consoleNav : hospitalNav;
  const heading = consoleMode
    ? {
        Network: "Regional command centre",
        Execution: "A decision, made visible",
        Negotiation: "Hospital conversations",
        Evidence: "Evidence you can inspect",
        "Scenario lab": "One scenario. Two outcomes.",
      }[tab] || tab
    : {
        Overview: "A clearer view. Better care.",
        Inventory: "Every unit, accounted for.",
        "Forecast insights": "Know what comes next.",
        Transfers: "From surplus to support.",
        Assistant: "Your supply intelligence partner.",
      }[tab] || tab;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/">
          <div className="brand-symbol">
            <Activity size={25} strokeWidth={2.2} />
          </div>
          <span>
            inception<span className="brand-dot">.</span>
          </span>
        </a>
        <div className="workspace-label">
          {consoleMode ? "WORKFLOW CONSOLE" : "HOSPITAL WORKSPACE"}
        </div>
        {consoleMode ? (
          <div className="facility-switch console-switch">
            <div className="facility-avatar">
              <Network size={20} />
            </div>
            <div>
              <strong>Regional operations</strong>
              <small>Judge demonstration</small>
            </div>
          </div>
        ) : (
          <div className="facility-switch">
            <div className="facility-avatar">
              <Stethoscope size={20} />
            </div>
            <select
              aria-label="Select hospital"
              value={facility}
              onChange={(e) => setFacility(e.target.value)}
            >
              {(
                data?.facilities.filter((f) => ["A", "D"].includes(f.id)) || [
                  { id: "A", name: "Kaveri General Hospital" },
                ]
              ).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
            <ChevronDown size={13} />
          </div>
        )}
        <nav>
          {nav.map(([label, Icon]) => (
            <button
              aria-label={label}
              className={tab === label ? "nav-item selected" : "nav-item"}
              key={label}
              onClick={() => setTab(label)}
            >
              <Icon size={18} />
              <span>
                {label === "Inventory" ? "Inventory & onboarding" : label}
              </span>
              {label === "AI communications" && openOffers.length > 0 && (
                <b>{openOffers.length}</b>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-insight">
          <div className="insight-icon">
            <ShieldCheck size={22} />
          </div>
          <h4>Better together.</h4>
          <p>Connecting available stock with the care that needs it.</p>
          <span>
            <i className="dot green" />6 hospitals connected
          </span>
        </div>
        <div className="sidebar-bottom">
          <a
            href={`http://localhost:${consoleMode ? "5173" : "5174"}${selected ? "?negotiation=" + selected : ""}`}
            target="_blank"
            rel="noreferrer"
          >
            <PanelTop size={17} />
            {consoleMode ? "Hospital workspace" : "Live workflow console"}
            <ExternalLink size={13} />
          </a>
          <div className="user">
            <div className="user-avatar">
              {consoleMode ? "JD" : facility + "A"}
            </div>
            <div>
              <strong>
                {consoleMode ? "Judge access" : "Hospital administrator"}
              </strong>
              <small>Seeded local demo session</small>
            </div>
            <Settings2 size={16} />
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            {consoleMode ? "Operations" : "Workspace"}
            <ChevronRight size={13} />
            <strong>{tab}</strong>
          </div>
          <div className="topbar-right">
            <span className="demo-label">SYNTHETIC DEMO</span>
            <span className="live-status">
              <i className="dot green" />
              Shared live state
            </span>
            <button
              className="notification-button"
              aria-label="View recommendations"
              onClick={() =>
                setTab(consoleMode ? "Negotiation" : "AI communications")
              }
            >
              <Bell size={19} />
              {openOffers.length > 0 && <span />}
            </button>
            <div className="top-avatar">{consoleMode ? "JD" : facility}</div>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {consoleMode
                  ? "INCEPTION / INTELLIGENCE IN ACTION"
                  : `${current?.area || "Mysuru"} · HOSPITAL ${facility}`}
              </div>
              <h1>{heading}</h1>
              <p>
                {consoleMode
                  ? "Follow the evidence, understand the decision, verify the impact."
                  : `Your inventory, forecasts, and next best actions. All in one place.`}
              </p>
            </div>
            <div className="heading-actions">
              <Button
                variant="outline"
                disabled={busy || !!activeJob}
                onClick={() =>
                  act(
                    "/analysis-runs",
                    { force: true },
                    "Analysis queued. Follow the live workflow for progress.",
                  )
                }
              >
                <RefreshCw size={15} className={activeJob ? "spin" : ""} />
                {activeJob ? "Analyzing…" : "Run live analysis"}
              </Button>
              {!consoleMode && (
                <Button onClick={() => setReportOpen(true)}>
                  <Plus size={16} />
                  Report suspected outbreak
                </Button>
              )}
            </div>
          </div>
          {error && (
            <div className="notice notice-error" role="alert">
              <AlertTriangle size={18} />
              {error}
              <button onClick={() => setError("")} aria-label="Dismiss error">
                <X size={16} />
              </button>
            </div>
          )}
          {q.isError && (
            <div className="notice notice-error">
              Cannot reach the backend: {(q.error as Error).message}. Run make
              dev to start all services.
            </div>
          )}
          {!data ? (
            <div className="loading-screen">
              <Loader2 className="spin" size={30} />
              <h3>Connecting your workspace</h3>
              <p>Loading the shared inventory ledger…</p>
            </div>
          ) : (
            <>
              <div className="context-strip">
                <span>
                  <Clock3 size={13} />
                  Scenario date{" "}
                  <strong>
                    {date(data.demo.as_of)}{" "}
                    {new Date(data.demo.as_of).getFullYear()}
                  </strong>
                </span>
                <span>Data cutoff · day {data.demo.day} of 240</span>
                <span className="context-model">
                  {activeJob ? (
                    <>
                      <Loader2 size={12} className="spin" />
                      Forecast job {activeJob.status}
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={13} />{" "}
                      {data.forecasts[0]?.model || "Awaiting forecast"}{" "}
                      {data.forecasts[0]?.source === "cached"
                        ? "· cached result"
                        : ""}
                    </>
                  )}
                </span>
              </div>
              {!consoleMode && tab === "Inventory" && (
                <Onboarding actor={actor} />
              )}
              {!consoleMode && tab === "Forecast insights" && (
                <RefreshStatus actor={actor} />
              )}
              {!consoleMode && (tab === "Overview" || tab === "Inventory") && (
                <>
                  <div className="metrics">
                    <Metric
                      label="Supplies at risk"
                      value={String(
                        ownRisks.filter(
                          (r) =>
                            r.stockout_days !== null || r.risk_review_required,
                        ).length,
                      ).padStart(2, "0")}
                      note="Before scheduled replenishment"
                      icon={<Activity size={18} />}
                      tone={near ? "danger" : "neutral"}
                    />
                    <Metric
                      label="Earliest stock-out"
                      value={near ? days(near.stockout_days) : "28+ days"}
                      note={
                        near
                          ? data.supplies.find((s) => s.id === near.supply_id)!
                              .name
                          : "Within the forecast horizon"
                      }
                      icon={<Clock3 size={18} />}
                      tone={near ? "danger" : "neutral"}
                    />
                    <Metric
                      label="Potential expiry waste"
                      value={
                        fmt(ownRisks.reduce((n, r) => n + r.expiry_units, 0)) +
                        " units"
                      }
                      note="Projected unused in 28 days"
                      icon={<Package size={18} />}
                      tone="warning"
                    />
                    <Metric
                      label="Pending decisions"
                      value={String(openOffers.length).padStart(2, "0")}
                      note="Redistribution opportunities"
                      icon={<GitBranch size={18} />}
                    />
                  </div>
                  {data.incidents.some((i) =>
                    i.facilities.includes(facility),
                  ) && (
                    <div className="incident-banner">
                      <div className="incident-icon">
                        <Activity size={20} />
                      </div>
                      <div>
                        <strong>Elevated regional demand detected</strong>
                        <p>
                          {data.incidents
                            .filter((i) => i.facilities.includes(facility))
                            .map((i) => i.status)
                            .join(" · ")}
                          . Forecasts and safe redistribution options have been
                          reassessed.
                        </p>
                      </div>
                      <Badge tone="red">Suspected incident</Badge>
                      <button
                        onClick={() => setReportOpen(true)}
                        aria-label="Review outbreak reporting"
                      >
                        <ArrowUpRight size={20} />
                      </button>
                    </div>
                  )}
                  <Panel
                    title="Inventory health"
                    subtitle="Know what you have. See what you’ll need."
                    action={
                      <div className="panel-actions">
                        <label className="search-box">
                          <Search size={14} />
                          <input
                            placeholder="Find a supply…"
                            aria-label="Find supply"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                          />
                        </label>
                        <a
                          className="button button-outline button-sm"
                          href={exportUrl("inventory", actor)}
                        >
                          <ArrowDownToLine size={14} />
                          Export
                        </a>
                        {tab === "Inventory" && (
                          <label className="button button-outline button-sm">
                            <Upload size={14} />
                            Import CSV
                            <input
                              type="file"
                              accept=".csv"
                              hidden
                              onChange={async (e) => {
                                if (!e.target.files?.[0]) return;
                                const f = new FormData();
                                f.append("file", e.target.files[0]);
                                try {
                                  await api("/imports", actor, {
                                    method: "POST",
                                    body: f,
                                  });
                                  setToast(
                                    "Inventory imported. Reassessment queued.",
                                  );
                                  qc.invalidateQueries({
                                    queryKey: ["snapshot"],
                                  });
                                } catch (err) {
                                  setError((err as Error).message);
                                }
                                e.target.value = "";
                              }}
                            />
                          </label>
                        )}
                      </div>
                    }
                  >
                    <div className="table-scroll">
                      <table className="inventory-table">
                        <thead>
                          <tr>
                            <th>Supply / item</th>
                            <th>Available</th>
                            <th>7-day demand</th>
                            <th>Stock-out forecast</th>
                            <th>Expiry exposure</th>
                            <th>Status</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {data.supplies
                            .filter((s) =>
                              s.name
                                .toLowerCase()
                                .includes(search.toLowerCase()),
                            )
                            .map((s) => {
                              const r = ownRisks.find(
                                (r) => r.supply_id === s.id,
                              );
                              return (
                                <tr
                                  key={s.id}
                                  onClick={() => setDetailSupply(s.id)}
                                  tabIndex={0}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter")
                                      setDetailSupply(s.id);
                                  }}
                                >
                                  <td>
                                    <div
                                      className={`supply-icon supply-${s.id}`}
                                    >
                                      <Package size={18} />
                                    </div>
                                    <div>
                                      <strong>{s.name}</strong>
                                      <small>
                                        {s.id} · {s.unit}s / packs of{" "}
                                        {s.pack_size}
                                      </small>
                                    </div>
                                  </td>
                                  <td>
                                    <strong>
                                      {r
                                        ? fmt(r.stock)
                                        : fmt(
                                            data.inventory
                                              .filter(
                                                (b) => b.supply_id === s.id,
                                              )
                                              .reduce(
                                                (n, b) =>
                                                  n + b.quantity - b.reserved,
                                                0,
                                              ),
                                          )}
                                    </strong>
                                    <small>{r?.reserved || 0} reserved</small>
                                  </td>
                                  <td>
                                    {r ? fmt(r.demand_7) : "—"}
                                    <small>forecast units</small>
                                  </td>
                                  <td
                                    className={
                                      r?.stockout_days != null &&
                                      r.stockout_days < 2
                                        ? "text-red"
                                        : ""
                                    }
                                  >
                                    <strong>
                                      {r ? days(r.stockout_days) : "Pending"}
                                    </strong>
                                    <small>
                                      {r?.stockout_days != null ||
                                      r?.risk_review_required
                                        ? "Before restock"
                                        : "Evaluated over 28 days"}
                                    </small>
                                  </td>
                                  <td>
                                    {r?.expiry_units ? (
                                      <Badge tone="amber">
                                        {fmt(r.expiry_units)} units
                                      </Badge>
                                    ) : (
                                      <span className="muted">
                                        No projected waste
                                      </span>
                                    )}
                                  </td>
                                  <td>
                                    {r ? (
                                      <RiskBadge value={r.stockout_days} />
                                    ) : (
                                      <Badge>Analyzing</Badge>
                                    )}
                                  </td>
                                  <td>
                                    <ChevronRight size={16} />
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                    <div className="panel-footer">
                      <ShieldCheck size={13} />
                      Quantities account for batch expiry, reservations, and
                      confirmed replenishments.
                      <span>{data.supplies.length} supplies tracked</span>
                    </div>
                  </Panel>
                  {tab === "Overview" && (
                    <div className="two-column">
                      <Panel
                        title="Demand outlook"
                        subtitle="Observed consumption and the next 28 days"
                        action={
                          <select
                            aria-label="Forecast supply"
                            className="compact-select"
                            value={supply}
                            onChange={(e) => setSupply(e.target.value)}
                          >
                            {data.supplies.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.id}
                              </option>
                            ))}
                          </select>
                        }
                      >
                        <ForecastChart forecast={fc} />
                        <div className="chart-legend">
                          <span>
                            <i style={{ background: "#40576a" }} />
                            Observed
                          </span>
                          <span>
                            <i style={{ background: "#91a3b4" }} />
                            Raw forecast
                          </span>
                          <span>
                            <i style={{ background: "#13816e" }} />
                            Planning demand
                          </span>
                        </div>
                      </Panel>
                      <Panel
                        title="Your regional network"
                        subtitle="Shared capacity. Connected care."
                        action={
                          <a
                            className="icon-link"
                            href="http://localhost:5174"
                            target="_blank"
                            rel="noreferrer"
                            aria-label="Open regional console"
                          >
                            <ArrowUpRight size={18} />
                          </a>
                        }
                      >
                        <NetworkMap
                          data={data}
                          supply={supply}
                          focus={facility}
                        />
                      </Panel>
                    </div>
                  )}
                  {tab === "Inventory" && (
                    <Panel
                      title="Inventory audit trail"
                      subtitle="Every change has a reason and an immutable movement record"
                    >
                      <div className="table-scroll">
                        <table>
                          <thead>
                            <tr>
                              <th>Movement</th>
                              <th>Batch</th>
                              <th>Change</th>
                              <th>Reason</th>
                              <th>Date</th>
                            </tr>
                          </thead>
                          <tbody>
                            {data.movements
                              .slice(-25)
                              .reverse()
                              .map((m) => (
                                <tr key={m.id}>
                                  <td>
                                    <Badge>{m.kind}</Badge>
                                  </td>
                                  <td className="mono">{m.batch_id}</td>
                                  <td>
                                    {m.quantity > 0 ? "+" : ""}
                                    {m.quantity}
                                  </td>
                                  <td>{m.reason}</td>
                                  <td>{date(m.at)}</td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    </Panel>
                  )}
                </>
              )}
              {!consoleMode && tab === "Forecast insights" && (
                <>
                  <div className="filter-row">
                    <label>
                      Supply{" "}
                      <select
                        value={supply}
                        onChange={(e) => setSupply(e.target.value)}
                      >
                        {data.supplies.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <a
                      className="button button-outline"
                      href={exportUrl("forecasts", actor)}
                    >
                      <ArrowDownToLine size={15} />
                      Download forecasts
                    </a>
                  </div>
                  <Panel
                    title="Demand forecast and incident adjustment"
                    subtitle="The statistical forecast stays visible beside the operational planning curve."
                  >
                    <ForecastChart forecast={fc} />
                  </Panel>
                  <div className="two-column">
                    <Panel
                      title="Why this forecast?"
                      subtitle="Evidence, assumptions, and provenance"
                    >
                      <div className="padded">
                        <div className="fact-list">
                          <div>
                            <span>Selected model</span>
                            <strong>{fc?.model || "Pending"}</strong>
                          </div>
                          <div>
                            <span>Result source</span>
                            <strong>{fc?.source || "Pending"}</strong>
                          </div>
                          <div>
                            <span>Inference time</span>
                            <strong>
                              {fc
                                ? new Date(fc.computed_at).toLocaleString()
                                : "—"}
                            </strong>
                          </div>
                          <div>
                            <span>Forecast horizon</span>
                            <strong>28 days</strong>
                          </div>
                        </div>
                        {fc?.adjustments.map((t) => (
                          <p className="evidence-note" key={t}>
                            <Activity size={16} />
                            {t}
                          </p>
                        ))}
                        {!fc?.adjustments.length && (
                          <p className="muted">
                            No incident adjustment is currently applied.
                          </p>
                        )}
                        {fc?.fallback_reason && (
                          <div className="notice notice-warning">
                            {fc.fallback_reason}
                          </div>
                        )}
                        <p className="microcopy">
                          The stress curve uses daily upper forecasts. Their sum
                          is not a calibrated 90% total-demand guarantee.
                        </p>
                      </div>
                    </Panel>
                    <Panel
                      title="Reported incidents"
                      subtitle="Reports are operational evidence, not clinical confirmation"
                      action={
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setReportOpen(true)}
                        >
                          <Plus size={14} />
                          Report
                        </Button>
                      }
                    >
                      <div className="padded">
                        {data.reports.length ? (
                          data.reports.map((r) => (
                            <div className="report-item" key={r.id}>
                              <div>
                                <strong>{r.category}</strong>
                                <p>{r.note || "No additional note"}</p>
                                <Badge
                                  tone={
                                    r.status === "active" ? "amber" : "neutral"
                                  }
                                >
                                  {r.status}
                                </Badge>
                              </div>
                              {r.status === "active" && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={async () => {
                                    try {
                                      await api(
                                        `/outbreak-reports/${r.id}`,
                                        actor,
                                        { method: "DELETE" },
                                      );
                                      qc.invalidateQueries({
                                        queryKey: ["snapshot"],
                                      });
                                    } catch (e) {
                                      setError((e as Error).message);
                                    }
                                  }}
                                >
                                  Withdraw
                                </Button>
                              )}
                            </div>
                          ))
                        ) : (
                          <Empty
                            title="No submitted reports"
                            description="Report observations from your facility to trigger a reassessment."
                          />
                        )}
                      </div>
                    </Panel>
                  </div>
                </>
              )}
              {((!consoleMode &&
                (tab === "Overview" || tab === "AI communications")) ||
                (consoleMode && tab === "Negotiation")) && (
                <Panel
                  title={
                    tab === "Overview"
                      ? "Recommended next steps"
                      : "Redistribution decisions"
                  }
                  subtitle="Evidence-backed proposals. Your approval stays in control."
                  action={
                    <Badge tone="green">
                      <Sparkles size={12} />
                      {openOffers.length} ready for review
                    </Badge>
                  }
                >
                  <div className="recommendations">
                    {data.negotiations
                      .filter(
                        (n) =>
                          !["Needs re-evaluation", "Rejected"].includes(
                            n.status,
                          ),
                      )
                      .slice(-12)
                      .map((n) => (
                        <button
                          className="recommendation"
                          key={n.id}
                          onClick={() => setSelected(n.id)}
                        >
                          <div className="recommendation-icon">
                            <GitBranch size={20} />
                          </div>
                          <div className="recommendation-main">
                            <div>
                              <strong>
                                {n.donor} <ArrowRight size={13} /> {n.recipient}{" "}
                                ·{" "}
                                {
                                  data.supplies.find(
                                    (s) => s.id === n.supply_id,
                                  )?.name
                                }
                              </strong>
                              <Badge
                                tone={
                                  n.status === "Received"
                                    ? "green"
                                    : n.status === "Awaiting approvals"
                                      ? "amber"
                                      : "blue"
                                }
                              >
                                {n.status}
                              </Badge>
                            </div>
                            <p>
                              {n.recipient === facility && !consoleMode
                                ? "Receive"
                                : "Redistribute"}{" "}
                              <b>{fmt(n.quantity)} units</b> ·{" "}
                              {n.travel_hours.toFixed(1)} h simulated transit ·
                              priority {n.tier ?? "—"}
                            </p>
                            <small>{n.reason}</small>
                          </div>
                          <span className="review-link">
                            Review proposal <ArrowUpRight size={16} />
                          </span>
                        </button>
                      ))}
                    {!data.negotiations.some(
                      (n) =>
                        !["Needs re-evaluation", "Rejected"].includes(n.status),
                    ) && (
                      <Empty
                        title={
                          activeJob
                            ? "Finding safe redistribution options"
                            : "No open recommendations"
                        }
                        description={
                          activeJob
                            ? "The engine is checking coverage, expiry, and competing needs."
                            : "Run analysis after new observations or a reported incident."
                        }
                      />
                    )}
                  </div>
                </Panel>
              )}
              {((!consoleMode && tab === "AI communications") ||
                (consoleMode && tab === "Negotiation")) && (
                <Panel
                  title="Transfer tracking"
                  subtitle="Inventory moves only at pickup and receipt."
                >
                  <div className="padded">
                    {data.transfers.length ? (
                      data.transfers.map((t) => (
                        <div className="transfer-card" key={t.id}>
                          <div className="transfer-title">
                            <Truck size={20} />
                            <strong>
                              {t.donor} → {t.recipient}
                            </strong>
                            <span>
                              {fmt(t.quantity)} {t.supply_id} units
                            </span>
                            <Badge
                              tone={t.status === "Received" ? "green" : "blue"}
                            >
                              {t.status}
                            </Badge>
                          </div>
                          <div className="delivery-steps">
                            {[
                              "Reserved",
                              "Assigned",
                              "Picked up",
                              "In transit",
                              "Received",
                            ].map((step, i) => (
                              <span
                                key={step}
                                className={
                                  i <=
                                  [
                                    "Reserved",
                                    "Assigned",
                                    "Picked up",
                                    "In transit",
                                    "Received",
                                  ].indexOf(t.status)
                                    ? "done"
                                    : ""
                                }
                              >
                                <i>
                                  {i <
                                  [
                                    "Reserved",
                                    "Assigned",
                                    "Picked up",
                                    "In transit",
                                    "Received",
                                  ].indexOf(t.status) ? (
                                    <Check size={10} />
                                  ) : (
                                    i + 1
                                  )}
                                </i>
                                {step}
                              </span>
                            ))}
                          </div>
                          <div className="transfer-actions">
                            {consoleMode && t.status === "Reserved" && (
                              <Button
                                size="sm"
                                onClick={() => act(`/transfers/${t.id}/claim`)}
                              >
                                Claim courier job
                              </Button>
                            )}
                            {t.status === "Assigned" &&
                              (consoleMode || actor === t.donor) && (
                                <Button
                                  size="sm"
                                  onClick={() =>
                                    act(`/transfers/${t.id}/pickup`)
                                  }
                                >
                                  Confirm pickup
                                </Button>
                              )}
                            {t.status === "Picked up" && (
                              <Button
                                size="sm"
                                onClick={() =>
                                  act(`/transfers/${t.id}/transit`)
                                }
                              >
                                Start transit
                              </Button>
                            )}
                            {["Picked up", "In transit"].includes(t.status) &&
                              (consoleMode || actor === t.recipient) && (
                                <Button
                                  size="sm"
                                  onClick={() =>
                                    act(`/transfers/${t.id}/receive`)
                                  }
                                >
                                  Confirm receipt
                                </Button>
                              )}
                            {["Reserved", "Assigned"].includes(t.status) && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => act(`/transfers/${t.id}/cancel`)}
                              >
                                Cancel transfer
                              </Button>
                            )}
                            <small className="muted">
                              Simulated delivery · estimated arrival{" "}
                              {new Date(t.eta).toLocaleString("en-IN")}
                            </small>
                          </div>
                        </div>
                      ))
                    ) : (
                      <Empty
                        title="No transfers in progress"
                        description="Approve a proposal from both hospitals to reserve stock and create a courier job."
                      />
                    )}
                  </div>
                </Panel>
              )}
              {!consoleMode && tab === "AI communications" && (
                <Assistant actor={actor} />
              )}
              {consoleMode && tab === "Network" && (
                <>
                  <div className="metrics">
                    <Metric
                      label="Connected facilities"
                      value="06"
                      note="Mysuru regional network"
                      icon={<Stethoscope size={18} />}
                    />
                    <Metric
                      label="Facilities at risk"
                      value={String(
                        new Set(
                          data.risks
                            .filter(
                              (r) =>
                                r.stockout_days !== null ||
                                r.risk_review_required,
                            )
                            .map((r) => r.facility_id),
                        ).size,
                      ).padStart(2, "0")}
                      note="Before scheduled replenishment"
                      icon={<Activity size={18} />}
                      tone="danger"
                    />
                    <Metric
                      label="Proposed redistribution"
                      value={fmt(
                        openOffers.reduce((s, n) => s + n.quantity, 0),
                      )}
                      note={`${openOffers.length} feasible moves · base units`}
                      icon={<GitBranch size={18} />}
                    />
                    <Metric
                      label="Suspected signals"
                      value={String(data.incidents.length).padStart(2, "0")}
                      note="Reported or statistically detected"
                      icon={<MapPin size={18} />}
                      tone="warning"
                    />
                  </div>
                  <div className="network-layout">
                    <Panel
                      title="Regional supply intelligence"
                      subtitle="Operational planning zones · simulated transfer connections"
                      action={
                        <select
                          className="compact-select"
                          value={supply}
                          onChange={(e) => setSupply(e.target.value)}
                        >
                          {data.supplies.map((s) => (
                            <option key={s.id}>{s.id}</option>
                          ))}
                        </select>
                      }
                      className="large-map"
                    >
                      <NetworkMap
                        data={data}
                        supply={supply}
                        focus={facility}
                        onFacility={setFacility}
                      />
                    </Panel>
                    <Panel
                      title="Priority facilities"
                      subtitle="Least coverage, highest urgency"
                    >
                      <div className="facility-list">
                        {data.facilities.map((f) => {
                          const r = data.risks.find(
                            (r) =>
                              r.facility_id === f.id && r.supply_id === supply,
                          );
                          return (
                            <button
                              key={f.id}
                              className={facility === f.id ? "focused" : ""}
                              onClick={() => setFacility(f.id)}
                            >
                              <div className="hospital-letter">{f.id}</div>
                              <div>
                                <strong>{f.name}</strong>
                                <small>
                                  {r
                                    ? days(r.stockout_days) + " coverage"
                                    : "Awaiting analysis"}
                                </small>
                              </div>
                              {r && <RiskBadge value={r.stockout_days} />}
                            </button>
                          );
                        })}
                      </div>
                    </Panel>
                  </div>
                  <div className="two-column">
                    <Panel
                      title={`${current?.name} · demand outlook`}
                      subtitle="Click a facility on the map to inspect its forecast"
                    >
                      <ForecastChart forecast={fc} />
                    </Panel>
                    <Panel
                      title="Why some donors are excluded"
                      subtitle="Location alone never establishes safe surplus"
                    >
                      <div className="padded">
                        {data.allocation?.rejected
                          .filter((r) => r.supply_id === supply)
                          .map((r, i) => (
                            <div className="constraint-row" key={i}>
                              <ShieldCheck size={19} />
                              <div>
                                <strong>Hospital {r.facility_id}</strong>
                                <p>{r.reason}</p>
                              </div>
                            </div>
                          ))}
                        {!data.allocation && (
                          <p className="muted">Awaiting allocation results.</p>
                        )}
                      </div>
                    </Panel>
                  </div>
                </>
              )}
              {consoleMode && tab === "Execution" && (
                <>
                  <Panel
                    title="Live decision workflow"
                    subtitle="Stages reflect persisted backend events, not a timed animation"
                    action={
                      <Badge tone={activeJob ? "amber" : "green"}>
                        {activeJob ? "Processing" : "Latest completed run"}
                      </Badge>
                    }
                  >
                    <Workflow data={data} />
                  </Panel>
                  <div className="two-column">
                    <Panel
                      title="Execution events"
                      subtitle="Open an event to inspect the actual output"
                    >
                      <Timeline events={data.events} />
                    </Panel>
                    <Panel
                      title="Forecast jobs"
                      subtitle="Durable jobs, cache provenance, and failures"
                    >
                      <div className="padded">
                        {[...data.jobs].reverse().map((j) => (
                          <div className="job-row" key={j.id}>
                            <div>
                              <strong className="mono">
                                {j.id.slice(0, 8)}
                              </strong>
                              <p>{new Date(j.created_at).toLocaleString()}</p>
                              {j.error && <p className="text-red">{j.error}</p>}
                            </div>
                            <Badge
                              tone={
                                j.status === "completed"
                                  ? "green"
                                  : j.status === "failed"
                                    ? "red"
                                    : "amber"
                              }
                            >
                              {j.status}
                            </Badge>
                          </div>
                        ))}
                        <div className="notice notice-info">
                          Chronos runs in a separate CPU worker. Cached outputs
                          retain their original compute timestamp. No hidden
                          future values enter inference.
                        </div>
                      </div>
                    </Panel>
                  </div>
                </>
              )}
              {consoleMode && tab === "Evidence" && <Evidence data={data} />}
              {consoleMode && tab === "Scenario lab" && (
                <>
                  {" "}
                  <ScenarioDirector data={data} /> <Scenario data={data} />{" "}
                </>
              )}
              <footer className="page-footer">
                <span>
                  <Activity size={13} />
                  INCEPTION{" "}
                  <span className="muted">Medical Supply Intelligence</span>
                </span>
                <span>
                  Synthetic operational data · Human-approved decisions · Policy
                  v1.0
                </span>
              </footer>
            </>
          )}
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={19} />
          {toast}
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {reportOpen && data && (
        <ReportModal
          data={data}
          facility={facility}
          onClose={() => setReportOpen(false)}
          onSubmit={async (body) => {
            if (
              await act(
                "/outbreak-reports",
                body,
                "Report recorded. Forecast reassessment queued.",
              )
            )
              setReportOpen(false);
          }}
        />
      )}
      {n && data && (
        <ProposalModal
          n={n}
          actor={actor}
          data={data}
          busy={busy}
          onClose={() => setSelected(null)}
          act={act}
        />
      )}
      {detailSupply && data && (
        <InventoryModal
          data={data}
          sid={detailSupply}
          actor={actor}
          onClose={() => setDetailSupply(null)}
          act={act}
        />
      )}
    </div>
  );
}

function ReportModal({
  data,
  facility,
  onClose,
  onSubmit,
}: {
  data: Snapshot;
  facility: string;
  onClose: () => void;
  onSubmit: (body: components["schemas"]["Report"]) => void;
}) {
  const localScenarioTime = new Date(
    new Date(data.demo.as_of).getTime() -
      new Date(data.demo.as_of).getTimezoneOffset() * 60000,
  )
    .toISOString()
    .slice(0, 16);
  const [onset, setOnset] = useState(localScenarioTime);
  const [category, setCategory] = useState("Gastrointestinal demand surge");
  const [sid, setSid] = useState("ORS");
  const [count, setCount] = useState("");
  const [units, setUnits] = useState("");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  return (
    <Modal
      title="Report a suspected outbreak"
      subtitle="Add operational evidence. This does not confirm a clinical diagnosis."
      onClose={onClose}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setSending(true);
          try {
            await onSubmit({
              facility_id: facility,
              onset_at: new Date(onset).toISOString(),
              category,
              case_count: count ? Number(count) : null,
              supply_ids: [sid],
              additional_units: units ? { [sid]: Number(units) } : {},
              note,
            });
          } finally {
            setSending(false);
          }
        }}
      >
        <div className="form-body">
          <label>
            Observed onset (local time)
            <input
              type="datetime-local"
              required
              max={localScenarioTime}
              value={onset}
              onChange={(e) => setOnset(e.target.value)}
            />
          </label>
          <label>
            Suspected incident or syndrome
            <input
              required
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
          </label>
          <div className="form-grid">
            <label>
              Affected supply
              <select value={sid} onChange={(e) => setSid(e.target.value)}>
                {data.supplies.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Observed cases (optional)
              <input
                type="number"
                min="0"
                value={count}
                onChange={(e) => setCount(e.target.value)}
                placeholder="e.g. 24"
              />
            </label>
          </div>
          <label>
            Additional units required over 7 days (optional)
            <input
              type="number"
              min="0"
              max="1000000"
              value={units}
              onChange={(e) => setUnits(e.target.value)}
              placeholder="Leave blank if unknown"
            />
            <small>
              No quantity means a watch and reassessment, not an automatic
              demand multiplier.
            </small>
          </label>
          <label>
            Operational observations
            <textarea
              value={note}
              maxLength={1000}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Describe the change in demand. Do not enter patient identities."
              rows={3}
            />
          </label>
          <div className="notice notice-info">
            <Clock3 size={16} />
            Onset defaults to the current scenario date, {date(data.demo.as_of)}
            . The report remains active for 72 scenario hours.
          </div>
        </div>
        <div className="modal-footer">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={sending} type="submit">
            {sending ? (
              <Loader2 size={15} className="spin" />
            ) : (
              <Send size={15} />
            )}
            Submit report & reassess
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ProposalModal({
  n,
  actor,
  data,
  busy,
  onClose,
  act,
}: {
  n: Negotiation;
  actor: string;
  data: Snapshot;
  busy: boolean;
  onClose: () => void;
  act: (path: string, body?: unknown, success?: string) => Promise<boolean>;
}) {
  const [qty, setQty] = useState(n.quantity);
  const [agentText, setAgentText] = useState("");
  const [thinking, setThinking] = useState(false);
  const supply = data.supplies.find((s) => s.id === n.supply_id)!;
  return (
    <Modal
      title={`${n.donor} → ${n.recipient} · Redistribution proposal`}
      subtitle={`${n.id} · terms v${n.version} · policy v1.0 · round ${n.round}/3`}
      onClose={onClose}
      wide
    >
      <div className="form-body">
        <div className="proposal-summary">
          <div>
            <small>
              {actor === n.donor ? "YOU RELEASE" : "PROPOSED TRANSFER"}
            </small>
            <strong>
              {fmt(n.quantity)}
              <span>{supply.unit}s</span>
            </strong>
          </div>
          <div>
            <small>SIMULATED TRANSIT</small>
            <strong>
              {n.travel_hours.toFixed(1)}
              <span>hours</span>
            </strong>
          </div>
          <div>
            <small>DECISION</small>
            <Badge tone="amber">{n.status}</Badge>
          </div>
        </div>
        <div className="notice notice-info">
          <ShieldCheck size={18} />
          {actor === n.donor
            ? "Your stress-path demand and one normal-demand day remain protected after this release."
            : "The offer respects donor protection, competing recipients, arrival time, and usable shelf life."}
        </div>
        <div className="fact-list">
          <div>
            <span>Allocation limit</span>
            <strong>{n.max_quantity} units</strong>
          </div>
          <div>
            <span>Recipient coverage before</span>
            <strong>{days(n.before)}</strong>
          </div>
          <div>
            <span>Coverage after this proposal</span>
            <strong>{days(n.after)}</strong>
          </div>
          <div>
            <span>Remaining projected deficit</span>
            <strong>{fmt(n.remaining_unmet)} units</strong>
          </div>
        </div>
        <p className="evidence-note">{n.reason}</p>
        <div className="approval-pair">
          {[n.donor, n.recipient].map((f) => (
            <div key={f} className={n.approvals.includes(f) ? "approved" : ""}>
              <CheckCircle2 size={18} />
              <span>Hospital {f}</span>
              <strong>
                {n.approvals.includes(f) ? "Approved" : "Approval pending"}
              </strong>
            </div>
          ))}
        </div>
        <h4>Negotiation history</h4>
        <div className="messages">
          {n.messages.map((m, i) => (
            <div
              className={`message ${m.actor === n.recipient ? "buyer" : "donor"}`}
              key={i}
            >
              <small>
                Hospital {m.actor} · {m.type}
              </small>
              <p>{m.text}</p>
            </div>
          ))}
        </div>
        {n.status === "Awaiting approvals" && actor !== "judge" && (
          <div className="counter-form">
            <label>
              Counterproposal{" "}
              <input
                aria-label="Counterproposal quantity"
                type="number"
                min={supply.pack_size}
                step={supply.pack_size}
                value={qty}
                onChange={(e) => setQty(Number(e.target.value))}
              />
            </label>
            <Button
              disabled={busy}
              variant="outline"
              onClick={() =>
                act(
                  `/negotiations/${n.id}/counteroffer`,
                  { quantity: qty },
                  "Counterproposal evaluated against current constraints.",
                )
              }
            >
              Evaluate counteroffer
            </Button>
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          disabled={thinking}
          onClick={async () => {
            setThinking(true);
            try {
              const r = await post<{ answer: string; mode: string }>(
                "/assistant/query",
                actor,
                {
                  question: `Explain proposal ${n.id} and why its allocation limit is ${n.max_quantity}.`,
                },
              );
              setAgentText(r.mode + "\n\n" + r.answer);
            } catch (e) {
              setAgentText((e as Error).message);
            } finally {
              setThinking(false);
            }
          }}
        >
          {thinking ? (
            <Loader2 className="spin" size={15} />
          ) : (
            <Sparkles size={15} />
          )}
          Ask my agent to explain
        </Button>
        {agentText && <div className="agent-explanation">{agentText}</div>}
        <small className="mono muted">Forecast evidence: {n.run_id}</small>
      </div>
      <div className="modal-footer">
        {actor === "judge" ? (
          <>
            <span className="muted">
              Approvals require each hospital’s own demo session.
            </span>
            <a
              className="button button-primary"
              target="_blank"
              rel="noreferrer"
              href={`http://localhost:5173?negotiation=${n.id}`}
            >
              Open hospital dashboard <ExternalLink size={14} />
            </a>
          </>
        ) : (
          <>
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
            {n.status === "Awaiting approvals" && (
              <>
                <Button
                  disabled={busy}
                  variant="danger"
                  onClick={() =>
                    act(
                      `/negotiations/${n.id}/reject`,
                      {},
                      "Proposal rejected.",
                    )
                  }
                >
                  Reject
                </Button>
                <Button
                  disabled={busy || n.approvals.includes(actor)}
                  onClick={() =>
                    act(
                      `/negotiations/${n.id}/approve`,
                      { version: n.version },
                      "Approval recorded for these exact terms.",
                    )
                  }
                >
                  <Check size={16} />
                  {n.approvals.includes(actor)
                    ? "You approved"
                    : "Approve transfer"}
                </Button>
              </>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

function InventoryModal({
  data,
  sid,
  actor,
  onClose,
  act,
}: {
  data: Snapshot;
  sid: string;
  actor: string;
  onClose: () => void;
  act: (path: string, body?: unknown, success?: string) => Promise<boolean>;
}) {
  const [batch, setBatch] = useState("");
  const [qty, setQty] = useState(0);
  const [reason, setReason] = useState("");
  const [kind, setKind] = useState("consumption");
  const rows = data.inventory.filter((b) => b.supply_id === sid);
  const supply = data.supplies.find((s) => s.id === sid)!;
  return (
    <Modal
      title={supply.name}
      subtitle="Batch-level availability, expiry, and inventory movements"
      onClose={onClose}
      wide
    >
      <div className="form-body">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Lot</th>
                <th>On hand</th>
                <th>Reserved</th>
                <th>Expiry</th>
                <th>Handling</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id}>
                  <td className="mono">{b.lot}</td>
                  <td>{fmt(b.quantity)}</td>
                  <td>{b.reserved}</td>
                  <td>{date(b.expires_at)}</td>
                  <td>
                    {b.quarantined ? (
                      <Badge tone="red">Quarantined</Badge>
                    ) : (
                      b.storage
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h4>Record an inventory movement</h4>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await act(
              "/inventory/movements",
              {
                batch_id: batch || rows[0]?.id,
                kind,
                quantity: kind === "consumption" ? -Math.abs(qty) : qty,
                reason,
                idempotency_key: crypto.randomUUID(),
              },
              "Movement recorded. Forecast reassessment queued.",
            );
          }}
        >
          <div className="form-grid">
            <label>
              Batch
              <select
                value={batch || rows[0]?.id}
                onChange={(e) => setBatch(e.target.value)}
              >
                {rows.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.lot}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Type
              <select value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="consumption">Consumption</option>
                <option value="adjustment">Stock adjustment</option>
              </select>
            </label>
            <label>
              {kind === "consumption"
                ? "Units consumed"
                : "Signed quantity change"}
              <input
                type="number"
                required
                value={qty}
                onChange={(e) => setQty(Number(e.target.value))}
              />
            </label>
            <label>
              Reason
              <input
                required
                minLength={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Explain the movement"
              />
            </label>
          </div>
          <Button type="submit" disabled={!qty}>
            Record movement
          </Button>
        </form>
      </div>
    </Modal>
  );
}

function Assistant({ actor }: { actor: string }) {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<
    { q: string; a: string; mode: string; sources: string[] }[]
  >([]);
  const [busy, setBusy] = useState(false);
  const send = async (q: string) => {
    if (!q.trim()) return;
    setBusy(true);
    setQuestion("");
    try {
      const r = await post<{ answer: string; mode: string; sources: string[] }>(
        "/assistant/query",
        actor,
        { question: q },
      );
      setMessages((m) => [
        ...m,
        { q, a: r.answer, mode: r.mode, sources: r.sources },
      ]);
    } catch (e) {
      setMessages((m) => [
        ...m,
        { q, a: (e as Error).message, mode: "Request failed", sources: [] },
      ]);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel
      title="Ask Inception"
      subtitle="Grounded in your hospital’s current data and operational policies"
    >
      <div className="assistant">
        <div className="assistant-intro">
          <div className="insight-icon">
            <Sparkles size={24} />
          </div>
          <h2>Clarity before the next decision.</h2>
          <p>
            Ask about shortage risk, expiry exposure, or why a transfer was
            recommended.
          </p>
          <div className="suggestions">
            {[
              "Which supplies may run out before replenishment?",
              "Which batches may expire unused?",
              "Explain my redistribution offers.",
            ].map((q) => (
              <button key={q} onClick={() => send(q)}>
                {q}
                <ArrowUpRight size={14} />
              </button>
            ))}
          </div>
        </div>
        {messages.map((m, i) => (
          <div className="chat-turn" key={i}>
            <div className="chat-question">{m.q}</div>
            <div className="chat-answer">
              <small>
                <Sparkles size={13} />
                {m.mode}
              </small>
              <p>{m.a}</p>
              <div className="source-tags">
                {m.sources.map((s) => (
                  <span key={s}>{s}</span>
                ))}
              </div>
            </div>
          </div>
        ))}
        {busy && (
          <p className="muted">
            <Loader2 size={15} className="spin" /> Reading authorized evidence…
          </p>
        )}
        <form
          className="chat-input"
          onSubmit={(e) => {
            e.preventDefault();
            send(question);
          }}
        >
          <input
            aria-label="Ask the assistant"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask a question about your supplies…"
          />
          <Button
            disabled={busy || !question.trim()}
            type="submit"
            aria-label="Send question"
          >
            <Send size={17} />
          </Button>
        </form>
      </div>
    </Panel>
  );
}

function Evidence({ data }: { data: Snapshot }) {
  const q = useQuery({
    queryKey: ["dataset", data.demo.day],
    queryFn: () =>
      api<{
        rows: Record<string, unknown>[];
        row_count: number;
        dictionary: Record<string, string>;
      }>("/dataset", "judge"),
  });
  const heldOut = useQuery({
    queryKey: ["heldout-evaluation", data.run?.id],
    queryFn: () =>
      api<{
        held_out_tests: {
          scope: string;
          results: {
            test_seed: number;
            selected_model: string;
            raw_test: { mae: number; wape: number };
            incident_adjusted_test: { mae: number; wape: number };
            daily_p10_p90_empirical_coverage: number;
            anomaly_detection: { precision: number; recall: number };
            shortage_alerts: {
              precision: number;
              recall: number;
              mean_warning_lead_days: number;
            };
          }[];
        } | null;
      }>("/evaluation", "judge"),
  });
  const evaluation = data.run?.evaluation.evaluation || [];
  return (
    <>
      <div className="notice notice-info">
        <Database size={18} />
        Generated with seed 2026. Synthetic operational data, not real patient
        or hospital records. Hidden future targets are kept out of forecasting
        inputs.
      </div>
      <div className="export-grid">
        {[
          ["observations", "Consumption dataset"],
          ["inventory", "Current inventory"],
          ["forecasts", "Model predictions"],
          ["movements", "Inventory ledger"],
          ["historical-ledger", "Historical ledger"],
          ["evaluation", "Evaluation report"],
          ["allocation", "Allocation calculations"],
          ["policy", "Policy configuration"],
        ].map(([k, label]) => (
          <a key={k} href={exportUrl(k, "judge")}>
            <FileText size={20} />
            <div>
              <strong>{label}</strong>
              <small>
                {["evaluation", "allocation", "policy"].includes(k)
                  ? "JSON"
                  : "CSV"}{" "}
                · downloadable evidence
              </small>
            </div>
            <ArrowDownToLine size={17} />
          </a>
        ))}
      </div>
      <Panel
        title="Forecast validation"
        subtitle="Rolling historical origins · no hidden future data used for model selection"
        action={
          <Badge tone="green">
            Selected: {data.run?.evaluation.selected || "Pending"}
          </Badge>
        }
      >
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Model</th>
                <th>Horizon</th>
                <th>Cutoff offset</th>
                <th>MAE</th>
                <th>WAPE</th>
                <th>Valid observations</th>
              </tr>
            </thead>
            <tbody>
              {evaluation.map((r, i) => (
                <tr key={i}>
                  <td>
                    <strong>{r.model}</strong>
                  </td>
                  <td>{r.horizon} days</td>
                  <td>{r.holdout_offset} days</td>
                  <td>{r.mae.toFixed(2)}</td>
                  <td>
                    {r.wape === null
                      ? "Undefined"
                      : (r.wape * 100).toFixed(1) + "%"}
                  </td>
                  <td>{fmt(r.observations)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!evaluation.length && (
          <Empty
            title="Evaluation pending"
            description="Model comparisons appear after the first completed analysis."
          />
        )}
        {data.run?.evaluation.error && (
          <p className="padded muted">
            Model availability: {data.run.evaluation.error}
          </p>
        )}
      </Panel>
      {heldOut.data?.held_out_tests && (
        <Panel
          title="Unseen synthetic test scenarios"
          subtitle="Independent seeds 2027 and 2028; thresholds not tuned on these cases. Not clinical validation."
        >
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Seed</th>
                  <th>Model</th>
                  <th>Raw MAE</th>
                  <th>Adjusted WAPE</th>
                  <th>Daily interval coverage</th>
                  <th>Anomaly precision / recall</th>
                </tr>
              </thead>
              <tbody>
                {heldOut.data.held_out_tests.results.map((r) => (
                  <tr key={r.test_seed}>
                    <td>{r.test_seed}</td>
                    <td>{r.selected_model}</td>
                    <td>{r.raw_test.mae.toFixed(2)}</td>
                    <td>{(r.incident_adjusted_test.wape * 100).toFixed(1)}%</td>
                    <td>
                      {(r.daily_p10_p90_empirical_coverage * 100).toFixed(1)}%
                    </td>
                    <td>
                      {(r.anomaly_detection.precision * 100).toFixed(1)}% /{" "}
                      {(r.anomaly_detection.recall * 100).toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
      <div className="two-column">
        <Panel
          title="Inventory reconciliation"
          subtitle="On hand + in transit + consumed + expired = accounted stock"
        >
          <div className="padded">
            <Badge tone={data.reconciliation?.balanced ? "green" : "red"}>
              {data.reconciliation?.balanced
                ? "Ledger balanced"
                : "Review required"}
            </Badge>
            <div className="fact-list">
              {Object.entries(data.reconciliation || {})
                .filter(([k, v]) => typeof v === "number")
                .map(([k, v]) => (
                  <div key={k}>
                    <span>{k.replaceAll("_", " ")}</span>
                    <strong>{fmt(v as number)}</strong>
                  </div>
                ))}
            </div>
          </div>
        </Panel>
        <Panel
          title="Data dictionary"
          subtitle={`${fmt(q.data?.row_count)} historical observations available at cutoff`}
        >
          <div className="padded fact-list">
            {Object.entries(q.data?.dictionary || {}).map(([k, v]) => (
              <div key={k}>
                <strong className="mono">{k}</strong>
                <span>{v}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
      <Panel
        title="Dataset preview"
        subtitle="Last 80 observations available to the forecast worker"
      >
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {Object.keys(q.data?.rows[0] || {}).map((k) => (
                  <th key={k}>{k.replaceAll("_", " ")}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {q.data?.rows.map((r, i) => (
                <tr key={i}>
                  {Object.entries(r).map(([k, v]) => (
                    <td key={k}>
                      {k === "date" ? String(v).slice(0, 10) : String(v)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

function Scenario({ data }: { data: Snapshot }) {
  const [revealed, setRevealed] = useState(false);
  const q = useQuery({
    queryKey: ["outcomes", data.demo.revision, revealed],
    queryFn: () =>
      api<{
        basis: string;
        with: {
          unmet_units: number;
          expiry_units: number;
          donor_stockout_days: number;
        };
        without: {
          unmet_units: number;
          expiry_units: number;
          donor_stockout_days: number;
        };
      }>(`/demo/outcomes?reveal=${revealed}`, "judge"),
    enabled: !!data.forecasts.length,
  });
  return (
    <>
      <Panel
        title="Compare the outcomes"
        subtitle="Compare both branches using the same hidden future demand."
      >
        <div className="scenario-controls">
          <div className="scenario-step">
            <span>03</span>
            <div>
              <strong>Replay the outcome</strong>
              <p>
                Evaluate both branches on the identical 28-day future demand
                sequence.
              </p>
            </div>
            <Button
              variant="outline"
              disabled={!data.forecasts.length}
              onClick={() => setRevealed(!revealed)}
            >
              {revealed ? "Show projected view" : "Reveal simulated outcomes"}
            </Button>
          </div>
        </div>
      </Panel>
      <div className="notice notice-info">
        {q.data?.basis || "Run analysis to compare outcomes."} · actual
        transfers made in the demo are included.
      </div>
      <div className="outcome-grid">
        {(["without", "with"] as const).map((branch) => (
          <Panel
            key={branch}
            title={
              branch === "without" ? "Without redistribution" : "With Inception"
            }
            subtitle="Same demand. Same starting resources."
            className={branch === "with" ? "outcome-good" : ""}
          >
            <div className="padded">
              <div className="outcome-number">
                <span>Unmet supply units</span>
                <strong>{fmt(q.data?.[branch].unmet_units)}</strong>
              </div>
              <div className="fact-list">
                <div>
                  <span>Units expiring unused</span>
                  <strong>{fmt(q.data?.[branch].expiry_units)}</strong>
                </div>
                <div>
                  <span>Donor stock-out days</span>
                  <strong>{fmt(q.data?.[branch].donor_stockout_days)}</strong>
                </div>
              </div>
            </div>
          </Panel>
        ))}
      </div>
      <Panel
        title="Judge’s arithmetic check"
        subtitle="The sample scenario from the rubric, with explicit constant-demand assumptions"
      >
        <div className="rubric-math">
          <div>
            <small>Stock</small>
            <strong>20,000 units</strong>
          </div>
          <ArrowRight size={20} />
          <div>
            <small>2,000 units / week</small>
            <strong>70 days</strong>
          </div>
          <ArrowRight size={20} />
          <div>
            <small>5,500 units / week</small>
            <strong>25.5 days</strong>
          </div>
        </div>
        <p className="padded microcopy">
          No arrivals, expiry, or demand changes within each case. The
          operational engine additionally accounts for those events.
        </p>
      </Panel>
    </>
  );
}
