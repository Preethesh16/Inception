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
import { ForecastSummary } from "./components/ForecastSummary";
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
          <Activity /> <span>inception.</span>
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
              consoleMode
                ? "http://localhost:5173"
                : "http://localhost:5174/?hospital=" + actor
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
            {!consoleMode && (
              <div className="trio-status">
                <Badge tone={running ? "amber" : "green"}>
                  {running ? "Analysis " + running.status : "Connected"}
                </Badge>
                <span>
                  Scenario date {date(data.demo.as_of)} · refresh every 5
                  minutes
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
            )}
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
  const [sid, setSid] = useState("ORS");
  const f =
    data.forecasts.find((f) => f.supply_id === sid) || data.forecasts[0];
  return (
    <>
      <div className="product-switch" aria-label="Choose a supply">
        {data.supplies.map((s) => (
          <button
            key={s.id}
            className={f?.supply_id === s.id ? "selected" : ""}
            onClick={() => setSid(s.id)}
          >
            {s.name}
          </button>
        ))}
      </div>
      <ForecastSummary
        forecast={f}
        risk={data.risks.find((r) => r.id === f?.id)}
        supply={data.supplies.find((s) => s.id === f?.supply_id)}
      />
    </>
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
    <article className="trio-proposal" data-proposal-id={n.id}>
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
  data: network,
  act,
  busy,
}: {
  data: Snapshot;
  act: (p: string, b?: unknown) => Promise<boolean>;
  busy: boolean;
}) {
  const [facility, setFacility] = useState(
    new URLSearchParams(location.search).get("hospital") || "A",
  );
  const [sid, setSid] = useState("ORS");
  const [stage, setStage] = useState(1);
  const [follow, setFollow] = useState(true);
  const [showMap, setShowMap] = useState(false);
  const latestRun = useRef(network.demo.latest_run);
  const section = useRef<HTMLDivElement | null>(null);
  const active = network.jobs.findLast((j) =>
    ["queued", "running"].includes(j.status),
  );
  const risks = network.allocation?.risks
    ? Object.values(network.allocation.risks)
    : network.risks;
  const data: Snapshot = {
    ...network,
    forecasts: network.forecasts.filter(
      (f) => f.facility_id === facility && f.supply_id === sid,
    ),
    risks: risks.filter(
      (r) => r.facility_id === facility && r.supply_id === sid,
    ),
    inventory: network.inventory.filter(
      (b) => b.facility_id === facility && b.supply_id === sid,
    ),
    negotiations: network.negotiations.filter(
      (n) =>
        (n.donor === facility || n.recipient === facility) &&
        n.supply_id === sid,
    ),
    transfers: network.transfers.filter(
      (t) =>
        (t.donor === facility || t.recipient === facility) &&
        t.supply_id === sid,
    ),
  };
  const f = data.forecasts[0];
  const r = data.risks[0];
  const supply = network.supplies.find((s) => s.id === sid);
  const gate = network.allocation?.searches?.[facility + ":" + sid];
  const searchNeeded = !!gate && gate.kind !== "none";
  const offers = data.negotiations.filter(
    (n) =>
      !["Needs re-evaluation", "Expired", "Cancelled", "Rejected"].includes(
        n.status,
      ),
  );
  const canApprove = offers.length > 0 || data.transfers.length > 0;
  const searchFinished =
    searchNeeded &&
    network.events.some(
      (e) =>
        e.type === "SEARCH_COMPLETED" &&
        e.run_id === f?.run_id &&
        e.facilities.includes(facility) &&
        e.details.supply_id === sid,
    );
  const failed = network.jobs.findLast(
    (j) => j.id === network.jobs.at(-1)?.id && j.status === "failed",
  );
  useEffect(() => {
    if (active) {
      setStage(1);
      return;
    }
    if (latestRun.current === network.demo.latest_run) return;
    if (!follow || !searchNeeded) latestRun.current = network.demo.latest_run;
    if (follow && searchFinished) {
      const t = setTimeout(() => {
        latestRun.current = network.demo.latest_run;
        setStage(2);
        section.current?.scrollIntoView({
          behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "instant"
            : "smooth",
          block: "start",
        });
      }, 1800);
      return () => clearTimeout(t);
    }
  }, [
    active?.id,
    network.demo.latest_run,
    follow,
    searchFinished,
    searchNeeded,
    facility,
    sid,
  ]);
  useEffect(() => {
    if (stage === 2 && !searchNeeded) setStage(1);
    if (stage === 3 && !canApprove) setStage(1);
  }, [searchNeeded, canApprove, stage]);
  return (
    <div className="simple-operations">
      <div className="operations-toolbar">
        <label>
          Hospital
          <select
            aria-label="Controlled hospital"
            value={facility}
            onChange={(e) => {
              latestRun.current = network.demo.latest_run;
              setFacility(e.target.value);
              setStage(1);
              setShowMap(false);
            }}
          >
            {network.facilities.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
        </label>
        <div>
          <Button
            disabled={busy || !!active || !f}
            onClick={async () => {
              setStage(1);
              await act("/analysis-runs", { force: true });
            }}
          >
            {active ? "Calculating…" : "Refresh forecast"}
          </Button>
          <small>
            Reruns demand prediction, then reassesses current stock and reports.
          </small>
        </div>
      </div>
      <div className="product-overview" aria-label="Product forecasts">
        {network.supplies.map((s) => {
          const risk = risks.find(
            (r) => r.facility_id === facility && r.supply_id === s.id,
          );
          const decision =
            network.allocation?.searches?.[facility + ":" + s.id];
          return (
            <button
              key={s.id}
              aria-label={"View " + s.name}
              aria-pressed={sid === s.id}
              className={sid === s.id ? "selected" : ""}
              onClick={() => {
                latestRun.current = network.demo.latest_run;
                setSid(s.id);
                setStage(1);
                setShowMap(false);
              }}
            >
              <strong>{s.name}</strong>
              <span>
                {risk
                  ? fmt(risk.demand_7) + " " + s.unit + "s expected in 7 days"
                  : "Awaiting hospital CSV"}
              </span>
              <small>
                {risk
                  ? fmt(risk.stock) +
                    " usable · " +
                    (risk.stockout_days === null
                      ? "28 days covered"
                      : days(risk.stockout_days) + " until shortage")
                  : "No forecast yet"}
              </small>
              <Badge
                tone={
                  decision?.kind === "none"
                    ? "green"
                    : decision
                      ? "amber"
                      : "neutral"
                }
              >
                {decision?.kind === "donor_search"
                  ? "Shortage"
                  : decision?.kind === "recipient_search"
                    ? "Unused expiring stock"
                    : decision
                      ? "No action needed"
                      : "Not analysed"}
              </Badge>
            </button>
          );
        })}
      </div>
      <nav className="simple-steps" aria-label="Workflow stages">
        <button
          aria-current={stage === 1 ? "step" : undefined}
          onClick={() => setStage(1)}
        >
          <span>1</span>Forecast
        </button>
        <button
          disabled={!searchFinished || !!active}
          aria-current={stage === 2 ? "step" : undefined}
          onClick={() => setStage(2)}
        >
          <span>2</span>
          {gate?.kind === "recipient_search"
            ? "Find a recipient"
            : "Find a donor"}
        </button>
        <button
          disabled={!canApprove || !!active}
          aria-current={stage === 3 ? "step" : undefined}
          onClick={() => setStage(3)}
        >
          <span>3</span>Approve & deliver
        </button>
      </nav>
      <div className="workflow-hint">
        <p>
          {active
            ? "Recalculating. The previous completed forecast remains visible until the new result is ready."
            : failed
              ? "Analysis failed. Your previous results remain visible; retry Refresh forecast."
              : gate?.kind === "none"
                ? "No action needed. This product’s forecast does not warrant a search."
                : gate?.kind === "donor_search"
                  ? "A shortage is projected. The next stage checks eligible donors."
                  : gate?.kind === "recipient_search"
                    ? "Some stock will expire unused. The next stage checks who can consume it safely."
                    : "Import this hospital’s CSV to begin."}
        </p>
        <label>
          <input
            type="checkbox"
            checked={follow}
            onChange={(e) => setFollow(e.target.checked)}
          />{" "}
          Advance after an actionable refresh
        </label>
      </div>
      {failed && (
        <p role="alert" className="text-red">
          {failed.error}
        </p>
      )}
      <div ref={section} className="simple-stage-content">
        {stage === 1 && (
          <>
            <ForecastSummary
              forecast={f}
              risk={r}
              supply={supply}
              updating={!!active}
            />
            {f && (
              <div className="next-action">
                <strong>
                  {active
                    ? "Reassessing whether a search is needed…"
                    : searchNeeded
                      ? gate?.kind === "donor_search"
                        ? "Next: find stock for the projected shortage."
                        : "Next: find a hospital that can use the expiring stock."
                      : "Analysis complete. No search is needed."}
                </strong>
                {searchNeeded && (
                  <Button
                    disabled={!searchFinished || !!active}
                    onClick={() => setStage(2)}
                  >
                    View search results <ArrowRight size={15} />
                  </Button>
                )}
                {!searchNeeded && canApprove && (
                  <Button variant="outline" onClick={() => setStage(3)}>
                    Review existing partner proposals
                  </Button>
                )}
              </div>
            )}
          </>
        )}
        {stage === 2 && (
          <>
            <Card
              title={
                gate?.kind === "recipient_search"
                  ? "Who can use this stock?"
                  : "Where can we safely get stock?"
              }
              sub={gate?.reason}
            >
              <div className="search-summary">
                <span>
                  Supply: <strong>{supply?.name}</strong>
                </span>
                <span>
                  {gate?.kind === "recipient_search"
                    ? "Unused expiring stock: "
                    : "Projected unmet demand: "}
                  <strong>
                    {fmt(
                      gate?.kind === "recipient_search"
                        ? gate?.unused_expiring_units
                        : gate?.shortage_units,
                    )}{" "}
                    {supply?.unit}s
                  </strong>
                </span>
              </div>
              {offers.length ? (
                <div className="candidate-list">
                  {offers.map((n) => (
                    <article key={n.id}>
                      <div>
                        <strong>
                          {NAME[n.donor]} → {NAME[n.recipient]}
                        </strong>
                        <p>{n.reason}</p>
                      </div>
                      <b>
                        {fmt(n.quantity)} {supply?.unit}s
                      </b>
                    </article>
                  ))}
                </div>
              ) : (
                <p>
                  No safe match was found. No negotiation or inventory movement
                  has been invented.
                </p>
              )}
              <details>
                <summary>Why were other candidates excluded?</summary>
                {network.allocation?.rejected
                  .filter((x) => x.supply_id === sid)
                  .map((x, i) => (
                    <p key={i}>
                      <strong>{NAME[x.facility_id]}</strong>: {x.reason}
                    </p>
                  ))}
              </details>
              <Button variant="ghost" onClick={() => setShowMap(!showMap)}>
                {showMap ? "Hide outbreak map" : "Show outbreak checks and map"}
              </Button>
              {showMap && <NetworkMap data={network} supply={sid} />}
            </Card>
            <div className="next-action">
              <strong>
                {canApprove
                  ? "A proposal is available for hospital review."
                  : "Search complete. No feasible transfer to approve."}
              </strong>
              {canApprove && (
                <Button onClick={() => setStage(3)}>
                  Review negotiation <ArrowRight size={15} />
                </Button>
              )}
            </div>
          </>
        )}
        {stage === 3 && (
          <>
            <div className="notice notice-info">
              Approve from each hospital’s dashboard. This console can show the
              conversation and simulate delivery; it cannot approve on a
              hospital’s behalf.
            </div>
            <Approvals data={data} actor="judge" act={act} busy={busy} />
            <Deliveries data={data} actor="judge" act={act} busy={busy} />
            <p>
              <Badge tone={network.reconciliation?.balanced ? "green" : "red"}>
                {network.reconciliation?.balanced
                  ? "Ledger balanced"
                  : "Review ledger"}
              </Badge>
            </p>
          </>
        )}
      </div>
      <details className="operations-tools">
        <summary>Demo tools & downloads</summary>
        <div className="file-downloads">
          {[
            "observations",
            "forecasts",
            "allocation",
            "evaluation",
            "movements",
          ].map((kind) => (
            <a key={kind} href={exportUrl(kind, "judge")}>
              {kind} ↓
            </a>
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={busy || !!active}
          onClick={() => {
            if (
              confirm(
                "Reset the synthetic demo? This clears reports, approvals, transfers and logins.",
              )
            )
              act("/demo/onboarding-reset");
          }}
        >
          Reset onboarding demo
        </Button>
      </details>
    </div>
  );
}
