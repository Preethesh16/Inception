import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Boxes,
  History,
  SlidersHorizontal,
  MessageSquare,
  CheckCircle2,
  LogOut,
  ArrowRight,
  Upload,
  AlertTriangle,
  Network,
  Download,
} from "lucide-react";
import { api, post, fmt, days, date, exportUrl } from "./lib/api";
import type { Snapshot, Batch, Negotiation } from "./lib/types";
import { Button, Badge } from "./components/ui";
import { ForecastChart } from "./components/ForecastChart";
import { NetworkMap } from "./components/NetworkMap";
const EMAILS: Record<string, string> = {
  A: "admin@kaveri.demo",
  B: "admin@chamundi.demo",
  D: "admin@mandya.demo",
};
const NAME: Record<string, string> = {
  A: "Kaveri General Hospital",
  B: "Chamundi Community Hospital",
  D: "Mandya Regional Hospital",
};
const token = (actor: string) =>
  sessionStorage.getItem("inception-session-" + actor) || "demo-" + actor;
const fileUrl = (path: string, actor: string) =>
  "/api" + path + "?session=" + encodeURIComponent(token(actor));
function Card({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children: ReactNode;
}) {
  return (
    <section className="trio-card">
      <div className="trio-card-heading">
        <h2>{title}</h2>
        {sub && <p>{sub}</p>}
      </div>
      {children}
    </section>
  );
}
export function TrioLanding() {
  const [selected, setSelected] = useState("A");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const q = useQuery({
    queryKey: ["trio-guide"],
    queryFn: () =>
      api<{ hospitals: { id: string; onboarded: boolean }[] }>(
        "/demo/guide",
        "judge",
      ),
  });
  async function login() {
    setBusy(true);
    setError("");
    try {
      const r = await post<{ session: string; facility_id: string }>(
        "/auth/login",
        "judge",
        { email: EMAILS[selected], password },
      );
      sessionStorage.setItem("inception-session-" + selected, r.session);
      window.location.href = "/hospital/" + selected;
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="demo-landing trio-landing">
      <header>
        <a className="brand" href="/">
          <Activity />
          inception.
        </a>
        <Badge tone="green">THREE-HOSPITAL DEMO</Badge>
      </header>
      <main>
        <span className="eyebrow">MEDICAL SUPPLY INTELLIGENCE</span>
        <h1>
          One change.
          <br />A network that responds.
        </h1>
        <p className="landing-lead">
          Upload Kaveri’s hospital file. Adjust stock or report an outbreak.
          Watch forecasts guide safe transfers between three connected
          hospitals.
        </p>
        <div className="trio-login-grid">
          <div className="trio-hospital-options">
            {Object.entries(NAME).map(([id, name]) => (
              <button
                key={id}
                className={selected === id ? "selected" : ""}
                onClick={() => setSelected(id)}
              >
                <span>
                  {id === "A"
                    ? "01 · YOUR ONBOARDING HOSPITAL"
                    : id === "B"
                      ? "02 · NEARBY HOSPITAL"
                      : "03 · OUTSIDE-ZONE DONOR"}
                </span>
                <strong>{name}</strong>
                <small>
                  {q.data?.hospitals.find((h) => h.id === id)?.onboarded
                    ? "CSV loaded · ready to demo"
                    : "Upload one CSV after login"}
                </small>
              </button>
            ))}
          </div>
          <Card
            title="Hospital administrator login"
            sub="Local demonstration accounts; use a separate tab for each hospital."
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                login();
              }}
            >
              <label>
                Email
                <input aria-label="Email" value={EMAILS[selected]} readOnly />
              </label>
              <label>
                Password
                <input
                  aria-label="Password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              <p className="microcopy">
                Demo password: <code>Demo@2026</code>
              </p>
              {error && (
                <p className="text-red" role="alert">
                  {error}
                </p>
              )}
              <Button disabled={busy} type="submit">
                {busy ? "Signing in…" : "Log in"}
                <ArrowRight size={15} />
              </Button>
            </form>
          </Card>
        </div>
        <a className="control-entry" href="http://localhost:5174">
          <Network />
          <div>
            <strong>Live operations console</strong>
            <p>
              Forecast → stock risk → outbreak-aware donor search → negotiations
              → human approval.
            </p>
          </div>
          <ArrowRight />
        </a>
        <p className="microcopy">
          Synthetic hospital data. Local demo login is not production
          authentication. Chamundi and Mandya are already onboarded using their
          own CSV files.
        </p>
      </main>
    </div>
  );
}
const nav = [
  ["Inventory", Boxes],
  ["Past records", History],
  ["Manage inventory", SlidersHorizontal],
  ["AI chat", MessageSquare],
  ["Approvals", CheckCircle2],
] as const;
export default function TrioApp() {
  const consoleMode =
    window.location.port === "5174" ||
    new URLSearchParams(location.search).get("view") === "console";
  const actor = consoleMode ? "judge" : location.pathname.split("/")[2] || "A";
  const [tab, setTab] = useState("Inventory");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState(false);
  const qc = useQueryClient();
  const authenticated =
    consoleMode || !!sessionStorage.getItem("inception-session-" + actor);
  useEffect(() => {
    if (!authenticated) location.href = "/";
  }, [authenticated]);
  const q = useQuery({
    queryKey: ["snapshot", actor],
    queryFn: () => api<Snapshot>("/snapshot", actor),
    enabled: authenticated,
    refetchInterval: 2000,
  });
  useEffect(() => {
    if (!authenticated) return;
    const es = new EventSource(fileUrl("/events/stream", actor));
    let timer: ReturnType<typeof setTimeout>;
    es.onmessage = () => {
      clearTimeout(timer);
      timer = setTimeout(
        () => qc.invalidateQueries({ queryKey: ["snapshot"] }),
        150,
      );
    };
    return () => {
      clearTimeout(timer);
      es.close();
    };
  }, [actor, authenticated, qc]);
  async function act(path: string, body: unknown = {}) {
    setBusy(true);
    setError("");
    try {
      await post(path, actor, body);
      await qc.invalidateQueries();
      return true;
    } catch (e) {
      setError(String(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  const data = q.data;
  const running = data?.jobs.findLast((j) =>
    ["queued", "running"].includes(j.status),
  );
  return (
    <div className="app-shell trio-shell">
      <aside className="sidebar">
        <a className="brand" href="/">
          <Activity /> inception.
        </a>
        <div className="workspace-label">
          {consoleMode ? "LIVE OPERATIONS" : "HOSPITAL WORKSPACE"}
        </div>
        <div className="trio-identity">
          <strong>
            {consoleMode ? "Regional control centre" : NAME[actor]}
          </strong>
          <small>
            {consoleMode ? "Three connected hospitals" : EMAILS[actor]}
          </small>
        </div>
        {!consoleMode && (
          <nav>
            {nav.map(([name, Icon]) => (
              <button
                key={name}
                className={"nav-item " + (name === tab ? "selected" : "")}
                onClick={() => setTab(name)}
              >
                <Icon size={18} />
                <span>{name}</span>
              </button>
            ))}
          </nav>
        )}
        <div className="sidebar-bottom">
          <a
            href={
              consoleMode ? "http://localhost:5173" : "http://localhost:5174"
            }
            target="_blank"
            rel="noreferrer"
          >
            {consoleMode ? "Hospital login" : "Operations console"} ↗
          </a>
          {!consoleMode && (
            <Button
              variant="ghost"
              onClick={() => {
                sessionStorage.removeItem("inception-session-" + actor);
                location.href = "/";
              }}
            >
              <LogOut size={15} />
              Log out
            </Button>
          )}
          <small>Local synthetic demonstration</small>
        </div>
      </aside>
      <main className="trio-main">
        <header className="trio-header">
          <div>
            <span className="eyebrow">
              INCEPTION /{" "}
              {consoleMode ? "LIVE WORKFLOW" : actor + " · HOSPITAL ADMIN"}
            </span>
            <h1>
              {consoleMode
                ? "Every decision, visible."
                : tab === "Inventory"
                  ? "Your hospital. Your supplies."
                  : tab}
            </h1>
          </div>
          {!consoleMode && (
            <Button variant="outline" onClick={() => setReport(true)}>
              <AlertTriangle size={15} />
              Report outbreak
            </Button>
          )}
        </header>
        {(error || q.error) && (
          <div role="alert" className="notice notice-danger">
            {error || String(q.error)}
          </div>
        )}
        {!data ? (
          <p>Connecting to the inventory ledger…</p>
        ) : (
          <>
            <div className="trio-status">
              <Badge tone={running ? "amber" : "green"}>
                {running ? "Analysis " + running.status : "Connected"}
              </Badge>
              <span>
                Scenario date {date(data.demo.as_of)} · refresh every 5 minutes
              </span>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy || !!running}
                onClick={() => act("/analysis-runs", { force: true })}
              >
                Run fresh forecast
              </Button>
            </div>
            {consoleMode ? (
              <Operations data={data} act={act} busy={busy} />
            ) : (
              <>
                {tab === "Inventory" && (
                  <>
                    <SingleImport actor={actor} data={data} />
                    <Inventory data={data} />
                  </>
                )}
                {tab === "Manage inventory" && (
                  <Manage data={data} act={act} busy={busy} />
                )}{" "}
                {tab === "Past records" && (
                  <Records data={data} actor={actor} />
                )}{" "}
                {tab === "AI chat" && <Chat actor={actor} data={data} />}{" "}
                {tab === "Approvals" && (
                  <>
                    <Approvals
                      data={data}
                      actor={actor}
                      act={act}
                      busy={busy}
                    />
                    <Deliveries
                      data={data}
                      actor={actor}
                      act={act}
                      busy={busy}
                    />
                  </>
                )}
              </>
            )}
            {report && (
              <ReportForm
                data={data}
                act={act}
                busy={busy}
                close={() => setReport(false)}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}
function SingleImport({ actor, data }: { actor: string; data: Snapshot }) {
  const q = useQuery({
    queryKey: ["guide", actor],
    queryFn: () =>
      api<{
        hospitals: { id: string; onboarded: boolean; history_rows: number }[];
      }>("/demo/guide", actor),
    refetchInterval: 3000,
  });
  const [file, setFile] = useState<File>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const hospital = q.data?.hospitals.find((h) => h.id === actor);
  async function upload() {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      body.append("file", file);
      await api("/onboarding/csv", actor, { method: "POST", body });
      await qc.invalidateQueries();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card
      title={
        hospital?.onboarded
          ? "Hospital data connected"
          : "Start with your hospital CSV"
      }
      sub={
        hospital?.onboarded
          ? `${hospital.history_rows} historical observations · profile, supply definitions, batches and supplier arrivals imported. A source-linked facility knowledge document is available to your agent.`
          : "One file contains the hospital profile, supply definitions, inventory batches, consumption history and scheduled replenishments. All rows are validated together."
      }
    >
      {!hospital?.onboarded && (
        <div className="single-import">
          <a
            className="button button-outline"
            href={fileUrl("/onboarding/template/" + actor, actor)}
          >
            <Download size={16} />
            Download hospital CSV
          </a>
          <label>
            Hospital CSV
            <input
              aria-label="Hospital CSV"
              type="file"
              accept=".csv"
              onChange={(e) => setFile(e.target.files?.[0])}
            />
          </label>
          <Button disabled={!file || busy} onClick={upload}>
            <Upload size={16} />
            {busy ? "Validating…" : "Import hospital"}
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-red">
          {error}
        </p>
      )}
      {data.inventory.length === 0 && (
        <p className="microcopy">
          Your inventory starts empty. No forecasts or transfers are generated
          for this hospital until the CSV is imported.
        </p>
      )}
    </Card>
  );
}
function Inventory({ data }: { data: Snapshot }) {
  return (
    <Card
      title="Current inventory"
      sub="Usable stock and projected shortages are derived from batches and the current forecast."
    >
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Supply</th>
              <th>Usable units</th>
              <th>Reserved</th>
              <th>7-day demand</th>
              <th>Stock-out</th>
              <th>Expiry exposure</th>
            </tr>
          </thead>
          <tbody>
            {data.supplies.map((s) => {
              const r = data.risks.find((r) => r.supply_id === s.id);
              return (
                <tr key={s.id}>
                  <td>
                    <strong>{s.name}</strong>
                    <small>
                      {s.unit} · pack {s.pack_size}
                    </small>
                  </td>
                  <td>{fmt(r?.stock)}</td>
                  <td>{fmt(r?.reserved)}</td>
                  <td>{fmt(r?.demand_7)}</td>
                  <td>
                    <Badge tone={r?.before_replenishment ? "red" : "green"}>
                      {r ? days(r.stockout_days) : "Awaiting import"}
                    </Badge>
                  </td>
                  <td>{fmt(r?.expiry_units)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
function Manage({
  data,
  act,
  busy,
}: {
  data: Snapshot;
  act: (p: string, b: unknown) => Promise<boolean>;
  busy: boolean;
}) {
  const [editing, setEditing] = useState<Batch | null>(null);
  const [qty, setQty] = useState(0);
  const [expiry, setExpiry] = useState("");
  const [reason, setReason] = useState("Demo inventory correction");
  return (
    <Card
      title="Edit batch quantities and expiry"
      sub="Changes are recorded in the ledger and trigger reassessment. Reducing stock changes coverage, not historical demand. Reserved batches cannot be edited."
    >
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Supply / lot</th>
              <th>On hand</th>
              <th>Expires</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {data.inventory.map((b) => (
              <tr key={b.id}>
                <td>
                  <strong>
                    {data.supplies.find((s) => s.id === b.supply_id)?.name}
                  </strong>
                  <small>{b.lot}</small>
                </td>
                <td>
                  {b.quantity} <small>{b.reserved} reserved</small>
                </td>
                <td>{date(b.expires_at)}</td>
                <td>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!!b.reserved}
                    onClick={() => {
                      setEditing(b);
                      setQty(b.quantity);
                      setExpiry(b.expires_at.slice(0, 10));
                    }}
                  >
                    Edit {b.id}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && (
        <div className="trio-modal-backdrop">
          <section
            className="trio-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Edit inventory batch"
          >
            <h2>Edit {editing.id}</h2>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (
                  await act("/inventory/batches/" + editing.id, {
                    quantity: qty,
                    expires_at: expiry + "T00:00:00Z",
                    reason,
                    expected_quantity: editing.quantity,
                    expected_expiry: editing.expires_at,
                    command_id: crypto.randomUUID(),
                  })
                )
                  setEditing(null);
              }}
            >
              <label>
                On-hand quantity
                <input
                  aria-label="On-hand quantity"
                  type="number"
                  min="0"
                  step="1"
                  required
                  value={qty}
                  onChange={(e) => setQty(Number(e.target.value))}
                />
              </label>
              <label>
                Expiry date
                <input
                  aria-label="Expiry date"
                  type="date"
                  required
                  value={expiry}
                  onChange={(e) => setExpiry(e.target.value)}
                />
              </label>
              <label>
                Reason
                <input
                  required
                  minLength={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <p className="microcopy">
                Scenario clock: {data.demo.as_of.slice(0, 10)}. Past expiry
                dates make stock unusable. Existing reservations must be
                cancelled before editing.
              </p>
              <div className="trio-actions">
                <Button disabled={busy}>Save & reassess</Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditing(null)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </section>
        </div>
      )}
    </Card>
  );
}
function Records({ data, actor }: { data: Snapshot; actor: string }) {
  return (
    <>
      <Card
        title="Historical consumption"
        sub="Imported history feeds demand forecasts; inventory corrections are separate audit movements."
      >
        <div className="file-downloads">
          <a href={exportUrl("observations", actor)}>
            Download consumption history
          </a>
          <a href={exportUrl("movements", actor)}>Download movements</a>
          <a href={exportUrl("forecasts", actor)}>Download forecasts</a>
        </div>
        {data.forecasts.map((f) => (
          <details key={f.id}>
            <summary>
              {data.supplies.find((s) => s.id === f.supply_id)?.name} · last{" "}
              {f.history.length} observed days
            </summary>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Consumed units</th>
                  </tr>
                </thead>
                <tbody>
                  {f.history.map((r, i) => (
                    <tr key={i}>
                      <td>{r.date}</td>
                      <td>{r.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        ))}
      </Card>
      <Card title="Inventory audit trail">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Batch</th>
                <th>Movement</th>
                <th>Units</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {[...data.movements].reverse().map((m) => (
                <tr key={m.id}>
                  <td>{new Date(m.at).toLocaleString()}</td>
                  <td>{m.batch_id}</td>
                  <td>{m.kind}</td>
                  <td>{m.quantity}</td>
                  <td>{m.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
function Chat({ actor, data }: { actor: string; data: Snapshot }) {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<
    { question: string; answer: string; mode: string; sources: string[] }[]
  >([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function send(text: string) {
    setBusy(true);
    setError("");
    try {
      const r = await post<{ answer: string; mode: string; sources: string[] }>(
        "/assistant/query",
        actor,
        { question: text },
      );
      setMessages((m) => [...m, { question: text, ...r }]);
      setQuestion("");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Card
        title="Ask your hospital agent"
        sub="Natural-language answers use your forecasts, stock, proposals and imported facility knowledge. Live OpenAI answers require a backend API key; deterministic fallback is explicitly labelled."
      >
        <div className="trio-actions">
          {[
            "Which supplies may run out before replenishment?",
            "Explain my transfer offers",
            "Which stock may expire unused?",
          ].map((t) => (
            <Button
              key={t}
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => send(t)}
            >
              {t}
            </Button>
          ))}
        </div>
        <div className="trio-chat">
          {messages.map((m, i) => (
            <article key={i}>
              <strong>{m.question}</strong>
              <p>{m.answer}</p>
              <small>
                {m.mode} · Sources: {m.sources.join(", ")}
              </small>
            </article>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(question);
          }}
        >
          <label>
            Your question
            <textarea
              aria-label="Your question"
              required
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
            />
          </label>
          <Button disabled={busy || !question.trim()}>
            {busy ? "Reading current evidence…" : "Ask agent"}
          </Button>
        </form>
        {error && <p role="alert">{error}</p>}
      </Card>
      <Forecasts data={data} />
    </>
  );
}
function Forecasts({ data }: { data: Snapshot }) {
  const [key, setKey] = useState("");
  const changed = data.events.findLast((e) =>
    ["INVENTORY_UPDATED", "REPORT_SUBMITTED", "HOSPITAL_ONBOARDED"].includes(
      e.type,
    ),
  );
  useEffect(() => {
    if (!changed) return;
    const details = changed.details as {
      after?: { supply_id?: string };
      supply_ids?: string[];
      batch_id?: string;
    };
    const sid =
      details.after?.supply_id ||
      details.supply_ids?.[0] ||
      data.inventory.find((b) => b.id === details.batch_id)?.supply_id ||
      "ORS";
    const next = data.forecasts.find(
      (f) => f.facility_id === changed.facilities[0] && f.supply_id === sid,
    );
    if (next) setKey(next.id);
  }, [changed?.id, data.forecasts.length]);
  const f = data.forecasts.find((f) => f.id === key) || data.forecasts[0];
  const r = data.risks.find(
    (r) => r.facility_id === f?.facility_id && r.supply_id === f?.supply_id,
  );
  return (
    <Card
      title="Demand forecast & stock mathematics"
      sub="Chronos and baselines use completed consumption history. Incident planning requirements are shown separately; daily P90 is a stress path, not a total-demand guarantee."
    >
      <select
        aria-label="Forecast series"
        value={f?.id || ""}
        onChange={(e) => setKey(e.target.value)}
      >
        {data.forecasts.map((f) => (
          <option key={f.id} value={f.id}>
            {NAME[f.facility_id]} · {f.supply_id}
          </option>
        ))}
      </select>
      <ForecastChart forecast={f} />
      {f && (
        <>
          <div className="trio-math">
            <span>
              <small>Raw 7-day median demand</small>
              <strong>
                {fmt(f.p50.slice(0, 7).reduce((a, b) => a + b, 0))}
              </strong>
            </span>
            <span>
              <small>Adjusted 7-day demand</small>
              <strong>{fmt(r?.demand_7)}</strong>
            </span>
            <span>
              <small>Usable stock</small>
              <strong>{fmt(r?.stock)}</strong>
            </span>
            <span>
              <small>Projected stock-out</small>
              <strong>{days(r?.stockout_days)}</strong>
            </span>
          </div>
          <p className="microcopy">
            FEFO simulation: opening usable stock + confirmed arrivals −
            reservations − forecast consumption − stock expiring before use.{" "}
            {f.model} · {f.source} · computed{" "}
            {new Date(f.computed_at).toLocaleString()}.
          </p>
          <details>
            <summary>Daily calculations and input provenance</summary>
            <pre>
              {JSON.stringify(
                {
                  run_id: f.run_id,
                  input_hash: f.input_hash,
                  cutoff: f.cutoff,
                  adjustments: f.adjustments,
                  timeline: r?.timeline,
                },
                null,
                2,
              )}
            </pre>
          </details>
        </>
      )}
    </Card>
  );
}
function ReportForm({
  data,
  act,
  busy,
  close,
}: {
  data: Snapshot;
  act: (p: string, b: unknown) => Promise<boolean>;
  busy: boolean;
  close: () => void;
}) {
  const [selected, setSelected] = useState<string[]>(["ORS"]);
  const [requirements, setRequirements] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [category, setCategory] = useState("Suspected demand surge");
  return (
    <div className="trio-modal-backdrop">
      <section
        className="trio-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Report outbreak"
      >
        <h2>Report suspected outbreak</h2>
        <p>
          Choose affected supplies and any extra units needed over seven days. A
          report is operational evidence, not a confirmed diagnosis.
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const additional_units = Object.fromEntries(
              selected
                .filter((s) => requirements[s])
                .map((s) => [s, Number(requirements[s])]),
            );
            if (
              await act("/outbreak-reports", {
                onset_at: data.demo.as_of,
                category,
                supply_ids: selected,
                additional_units,
                note,
              })
            )
              close();
          }}
        >
          <label>
            Incident category
            <input
              required
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
          </label>
          {data.supplies.map((s) => (
            <div className="outbreak-supply" key={s.id}>
              <label>
                <input
                  type="checkbox"
                  checked={selected.includes(s.id)}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? [...selected, s.id]
                        : selected.filter((x) => x !== s.id),
                    )
                  }
                />
                {s.name}
              </label>
              {selected.includes(s.id) && (
                <label>
                  Additional {s.unit}s over 7 days
                  <input
                    aria-label={"Additional " + s.id + " units"}
                    type="number"
                    min="0"
                    max="1000000"
                    step="1"
                    value={requirements[s.id] || ""}
                    placeholder="Optional — no invented multiplier"
                    onChange={(e) =>
                      setRequirements({
                        ...requirements,
                        [s.id]: e.target.value,
                      })
                    }
                  />
                </label>
              )}
            </div>
          ))}
          <label>
            Operational observations
            <textarea
              aria-label="Operational observations"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={1000}
            />
          </label>
          <div className="trio-actions">
            <Button disabled={busy || !selected.length}>
              Submit report & reassess
            </Button>
            <Button variant="outline" type="button" onClick={close}>
              Cancel
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
function Approvals({
  data,
  actor,
  act,
  busy,
}: {
  data: Snapshot;
  actor: string;
  act: (p: string, b?: unknown) => Promise<boolean>;
  busy: boolean;
}) {
  const offers = data.negotiations.filter(
    (n) =>
      !["Needs re-evaluation", "Expired", "Rejected", "Cancelled"].includes(
        n.status,
      ),
  );
  return (
    <Card
      title="Agent negotiations & approvals"
      sub="The allocation engine enforces safe quantities. Agents explain or counterpropose within those limits; both hospitals must approve the same version."
    >
      {offers.length ? (
        offers.map((n) => (
          <Proposal
            key={n.id}
            n={n}
            data={data}
            actor={actor}
            act={act}
            busy={busy}
          />
        ))
      ) : (
        <p>
          No actionable proposals yet. Adjust inventory or report quantified
          additional demand. Unsafe or unnecessary transfers are not created.
        </p>
      )}
      <details>
        <summary>
          Previous proposals ({data.negotiations.length - offers.length})
        </summary>
        {data.negotiations
          .filter((n) => !offers.includes(n))
          .map((n) => (
            <p key={n.id}>
              {n.id} · {n.quantity} {n.supply_id} · {n.status}
            </p>
          ))}
      </details>
    </Card>
  );
}
function Proposal({
  n,
  data,
  actor,
  act,
  busy,
}: {
  n: Negotiation;
  data: Snapshot;
  actor: string;
  act: (p: string, b?: unknown) => Promise<boolean>;
  busy: boolean;
}) {
  const [quantity, setQuantity] = useState(n.quantity);
  const [explanation, setExplanation] = useState("");
  return (
    <article className="trio-proposal">
      <div className="entry-top">
        <h3>
          {NAME[n.donor]} → {NAME[n.recipient]}
        </h3>
        <Badge tone={n.status === "Reserved" ? "green" : "amber"}>
          {n.status}
        </Badge>
      </div>
      <p>
        <strong>
          {n.quantity} {data.supplies.find((s) => s.id === n.supply_id)?.unit}s
          · {n.supply_id}
        </strong>{" "}
        · limit {n.max_quantity} · version {n.version}
      </p>
      <p>{n.reason}</p>
      <div className="trio-math">
        <span>
          <small>Recipient coverage before</small>
          <strong>{days(n.before)}</strong>
        </span>
        <span>
          <small>Coverage after this offer</small>
          <strong>{days(n.after)}</strong>
        </span>
        <span>
          <small>Remaining unmet units</small>
          <strong>{fmt(n.remaining_unmet)}</strong>
        </span>
      </div>
      <details>
        <summary>
          Read agent conversation ({n.messages.length} messages)
        </summary>
        {n.messages.map((m, i) => (
          <div className="agent-message" key={i}>
            <strong>
              {NAME[m.actor] || m.actor} · {m.type}
            </strong>
            <p>{m.text}</p>
            <small>
              {(m as typeof m & { mode?: string }).mode ||
                "Deterministic constrained negotiation"}{" "}
              · {new Date(m.at).toLocaleTimeString()}
            </small>
          </div>
        ))}
      </details>
      <p className="microcopy">
        Approvals:{" "}
        {n.approvals.map((a) => NAME[a]).join(", ") ||
          "Neither hospital has approved"}{" "}
        · {n.id}
      </p>
      {actor !== "judge" && n.status === "Awaiting approvals" && (
        <>
          <div className="trio-actions">
            <Button
              disabled={busy || n.approvals.includes(actor)}
              onClick={() =>
                act("/negotiations/" + n.id + "/approve", {
                  version: n.version,
                })
              }
            >
              {n.approvals.includes(actor)
                ? "You approved"
                : "Approve transfer"}
            </Button>
            <Button
              disabled={busy}
              variant="outline"
              onClick={() => act("/negotiations/" + n.id + "/reject")}
            >
              Reject
            </Button>
            <label>
              Counteroffer quantity
              <input
                aria-label={"Counteroffer " + n.id}
                type="number"
                min="0"
                step="1"
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
              />
            </label>
            <Button
              disabled={busy}
              variant="outline"
              onClick={() =>
                act("/negotiations/" + n.id + "/counteroffer", { quantity })
              }
            >
              Evaluate counteroffer
            </Button>
          </div>
          <Button
            variant="ghost"
            onClick={async () => {
              try {
                const r = await post<{ answer: string; mode: string }>(
                  "/assistant/query",
                  actor,
                  {
                    question:
                      "Explain proposal " +
                      n.id +
                      " and my protected reserve or recipient benefit.",
                  },
                );
                setExplanation(r.mode + ": " + r.answer);
              } catch (e) {
                setExplanation(String(e));
              }
            }}
          >
            Ask agent to explain this decision
          </Button>
          {explanation && <p>{explanation}</p>}
        </>
      )}
    </article>
  );
}
function Deliveries({
  data,
  actor,
  act,
  busy,
}: {
  data: Snapshot;
  actor: string;
  act: (p: string, b?: unknown) => Promise<boolean>;
  busy: boolean;
}) {
  return (
    <Card
      title="Delivery & receipt"
      sub="Simulated courier actions update the same inventory ledger."
    >
      {data.transfers.length ? (
        data.transfers.map((t) => (
          <article className="trio-proposal" key={t.id}>
            <strong>
              {t.donor} → {t.recipient} · {t.quantity} {t.supply_id}
            </strong>
            <Badge tone="green">{t.status}</Badge>
            <div className="trio-actions">
              {actor === "judge" && t.status === "Reserved" && (
                <Button
                  disabled={busy}
                  onClick={() => act("/transfers/" + t.id + "/claim")}
                >
                  Claim courier job
                </Button>
              )}
              {actor === "judge" && t.status === "Assigned" && (
                <Button
                  disabled={busy}
                  onClick={() => act("/transfers/" + t.id + "/pickup")}
                >
                  Confirm pickup
                </Button>
              )}
              {actor === "judge" && t.status === "Picked up" && (
                <Button
                  disabled={busy}
                  onClick={() => act("/transfers/" + t.id + "/transit")}
                >
                  Start transit
                </Button>
              )}
              {(actor === "judge" || actor === t.recipient) &&
                ["Picked up", "In transit"].includes(t.status) && (
                  <Button
                    disabled={busy}
                    onClick={() => act("/transfers/" + t.id + "/receive")}
                  >
                    Confirm receipt
                  </Button>
                )}
              {["Reserved", "Assigned"].includes(t.status) && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => act("/transfers/" + t.id + "/cancel")}
                >
                  Cancel transfer
                </Button>
              )}
            </div>
          </article>
        ))
      ) : (
        <p>Approved transfers will appear here.</p>
      )}
    </Card>
  );
}
function Operations({
  data,
  act,
  busy,
}: {
  data: Snapshot;
  act: (p: string, b?: unknown) => Promise<boolean>;
  busy: boolean;
}) {
  const [follow, setFollow] = useState(true);
  const [supply, setSupply] = useState("ORS");
  const [reveal, setReveal] = useState(false);
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const previous = useRef("");
  const active = data.jobs.findLast((j) =>
    ["queued", "running"].includes(j.status),
  );
  const run = active?.id || data.demo.latest_run;
  const events = data.events.filter((e) => e.run_id === run);
  const changedAt =
    data.events.findLast((e) =>
      ["INVENTORY_UPDATED", "REPORT_SUBMITTED", "HOSPITAL_ONBOARDED"].includes(
        e.type,
      ),
    )?.at || "";
  const offerRun = data.negotiations.findLast(
    (n) =>
      ["Awaiting approvals", "Reserved", "Received"].includes(n.status) &&
      (n.created_at || "") >= changedAt,
  )?.run_id;
  const transferEvents = data.events.filter(
    (e) => e.run_id === run || e.run_id === offerRun,
  );
  const done = [
    events.some((e) => e.type === "ANALYSIS_STARTED"),
    events.some((e) => e.type === "FORECAST_COMPLETED"),
    events.some((e) => e.type === "ALLOCATION_CREATED"),
    transferEvents.some((e) => e.type === "APPROVAL_REQUIRED"),
    transferEvents.some((e) => e.type === "TRANSFER_RESERVED"),
    transferEvents.some((e) => e.type === "RECEIVED"),
  ];
  const latest = done.lastIndexOf(true);
  const change = run + ":" + latest;
  useEffect(() => {
    if (follow && previous.current !== change && latest >= 0) {
      refs.current[Math.min(latest + 1, 5)]?.scrollIntoView({
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
        block: "start",
      });
      previous.current = change;
    }
  }, [change, latest, follow]);
  const outcomes = useQuery({
    queryKey: ["trio-outcomes", data.demo.revision, reveal],
    queryFn: () =>
      api<{
        basis: string;
        with: { unmet_units: number; expiry_units: number };
        without: { unmet_units: number; expiry_units: number };
      }>("/demo/outcomes?reveal=" + reveal, "judge"),
    enabled: !!data.forecasts.length,
  });
  const labels = [
    "Evidence received",
    "Demand & stock-risk analysis",
    "Outbreak check & donor search",
    "Hospital agent negotiation",
    "Dual approval & reservation",
    "Delivery & measured outcome",
  ];
  return (
    <>
      <div className="console-intro">
        <p>
          Make changes in a hospital dashboard. This view follows the resulting
          jobs and explains the numbers; stages do not advance until their
          backend events exist.
        </p>
        <label>
          <input
            type="checkbox"
            checked={follow}
            onChange={(e) => setFollow(e.target.checked)}
          />{" "}
          Follow actionable stages
        </label>
        <Button
          variant="outline"
          size="sm"
          disabled={busy || !!active}
          onClick={() => {
            if (
              confirm(
                "Reset all synthetic transfers and reports? Kaveri will return to empty onboarding; the two partner CSVs will be preloaded.",
              )
            )
              act("/demo/onboarding-reset");
          }}
        >
          Reset onboarding demo
        </Button>
      </div>
      {labels.map((label, i) => (
        <div
          className={"console-stage " + (done[i] ? "done" : "")}
          key={label}
          ref={(el) => {
            refs.current[i] = el;
          }}
        >
          <div className="console-stage-title">
            <span>{done[i] ? "✓" : i + 1}</span>
            <h2>{label}</h2>
            <Badge tone={done[i] ? "green" : "neutral"}>
              {done[i] ? "Backend result available" : "Waiting"}
            </Badge>
          </div>
          {i === 0 && (
            <Card title="Changes driving this analysis">
              <p>
                Run {run?.slice(0, 8) || "pending"} · scenario{" "}
                {data.demo.as_of.slice(0, 10)}. Imported facts enter the
                facility knowledge layer; numerical stock and approvals stay in
                SQLite.
              </p>
              {data.events
                .filter((e) =>
                  [
                    "INVENTORY_UPDATED",
                    "REPORT_SUBMITTED",
                    "HOSPITAL_ONBOARDED",
                    "KNOWLEDGE_UPDATED",
                  ].includes(e.type),
                )
                .slice(-5)
                .reverse()
                .map((e) => (
                  <details key={e.id}>
                    <summary>
                      {new Date(e.at).toLocaleTimeString()} · {e.type} ·{" "}
                      {e.facilities.join(", ")}
                    </summary>
                    <pre>{JSON.stringify(e.details, null, 2)}</pre>
                  </details>
                ))}
              {active && (
                <p>
                  Worker {active.status}. Historical demand is never replaced by
                  manual stock reductions.
                </p>
              )}
              {data.jobs
                .filter((j) => j.status === "failed")
                .slice(-1)
                .map((j) => (
                  <p role="alert" className="text-red" key={j.id}>
                    {j.error}
                  </p>
                ))}
            </Card>
          )}
          {i === 1 && <Forecasts data={data} />}{" "}
          {i === 2 && (
            <>
              <Card
                title="Check the operational planning zone"
                sub="Reported or detected signals exclude inside-zone hospitals from automatic donation. For this demo, search tries the nearest eligible donor first."
              >
                <select
                  aria-label="Map supply"
                  value={supply}
                  onChange={(e) => setSupply(e.target.value)}
                >
                  {data.supplies.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <NetworkMap data={data} supply={supply} />
                {data.incidents
                  .filter((x) => x.supply_id === supply)
                  .map((x) => (
                    <p key={x.id}>
                      <Badge tone="red">{x.status}</Badge>{" "}
                      {x.facilities.map((f) => NAME[f]).join(" + ")} ·{" "}
                      {x.radius_km} km operational radius
                    </p>
                  ))}
              </Card>
              <Card title="Donor checks & remaining gap">
                {data.allocation?.rejected
                  .filter((r) => r.supply_id === supply)
                  .map((r, i) => (
                    <p key={i}>
                      <strong>{NAME[r.facility_id]}</strong> — {r.reason}
                    </p>
                  ))}
                {data.allocation?.deficits
                  .filter((r) => r.supply_id === supply)
                  .map((r, i) => (
                    <p key={i}>
                      {NAME[r.facility_id]}: {fmt(r.unmet)} unmet units.{" "}
                      {r.action}
                    </p>
                  ))}
                {!data.allocation && <p>Waiting for allocation results.</p>}
              </Card>
            </>
          )}{" "}
          {i === 3 && (
            <Approvals data={data} actor="judge" act={act} busy={busy} />
          )}{" "}
          {i === 4 && (
            <Card title="Administrators retain the decision">
              <p>
                Log into the requesting hospital and the selected donor. In
                Approvals, each administrator approves identical terms. Changing
                quantities clears previous approvals. The console cannot approve
                for a hospital.
              </p>
              {data.transfers.map((t) => (
                <p key={t.id}>
                  {NAME[t.donor]} → {NAME[t.recipient]} · {t.quantity}{" "}
                  {t.supply_id} · {t.status}
                </p>
              ))}
            </Card>
          )}
          {i === 5 && (
            <>
              <Deliveries data={data} actor="judge" act={act} busy={busy} />
              <Card title="Verify the outcome">
                <p>
                  <Badge tone={data.reconciliation?.balanced ? "green" : "red"}>
                    {data.reconciliation?.balanced
                      ? "Ledger balanced"
                      : "Check ledger"}
                  </Badge>
                </p>
                <Button variant="outline" onClick={() => setReveal(!reveal)}>
                  {reveal
                    ? "Show projected outcomes"
                    : "Reveal simulated outcomes"}
                </Button>
                <p>{outcomes.data?.basis}</p>
                <div className="trio-math">
                  <span>
                    <small>Unmet units without transfers</small>
                    <strong>{fmt(outcomes.data?.without.unmet_units)}</strong>
                  </span>
                  <span>
                    <small>Unmet units with transfers</small>
                    <strong>{fmt(outcomes.data?.with.unmet_units)}</strong>
                  </span>
                  <span>
                    <small>Expiry without / with</small>
                    <strong>
                      {fmt(outcomes.data?.without.expiry_units)} /{" "}
                      {fmt(outcomes.data?.with.expiry_units)}
                    </strong>
                  </span>
                </div>
                <div className="file-downloads">
                  {[
                    "inventory",
                    "observations",
                    "forecasts",
                    "allocation",
                    "evaluation",
                    "movements",
                  ].map((k) => (
                    <a key={k} href={exportUrl(k, "judge")}>
                      {k} ↓
                    </a>
                  ))}
                </div>
              </Card>
            </>
          )}
        </div>
      ))}
    </>
  );
}
