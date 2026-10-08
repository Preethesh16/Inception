import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  History,
  SlidersHorizontal,
  Bike,
  PackageCheck,
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
  const [selected, setSelected] = useState(
    new URLSearchParams(location.search).get("login") || "A",
  );
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
      window.location.href =
        "/hospital/" +
        selected +
        (new URLSearchParams(location.search).get("tab") === "approvals"
          ? "?tab=approvals"
          : "");
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
  ["Onboarding", Upload],
  ["Past usage", History],
  ["Inventory management", SlidersHorizontal],
  ["Approvals", CheckCircle2],
] as const;
export default function TrioApp() {
  const consoleMode =
    window.location.port === "5174" ||
    new URLSearchParams(location.search).get("view") === "console";
  const actor = consoleMode ? "judge" : location.pathname.split("/")[2] || "A";
  const [tab, setTab] = useState(
    new URLSearchParams(location.search).get("tab") === "approvals"
      ? "Approvals"
      : "Onboarding",
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState(false);
  const qc = useQueryClient();
  const authenticated =
    consoleMode || !!sessionStorage.getItem("inception-session-" + actor);
  useEffect(() => {
    if (!authenticated)
      location.href =
        "/?login=" +
        actor +
        (new URLSearchParams(location.search).get("tab") === "approvals"
          ? "&tab=approvals"
          : "");
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
                : tab === "Onboarding"
                  ? "Your hospital. Your supplies."
                  : tab}
            </h1>
          </div>
          {!consoleMode && (
            <Button
              variant="outline"
              disabled={!data?.supplies.length}
              onClick={() => setReport(true)}
            >
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
                  {!data.supplies.length
                    ? "Awaiting CSV"
                    : running
                      ? "Analysis " + running.status
                      : "Connected"}
                </Badge>
                <span>
                  Scenario date {date(data.demo.as_of)} · refresh every 5
                  minutes
                </span>
              </div>
            )}
            {consoleMode ? (
              <Operations data={data} act={act} busy={busy} />
            ) : (
              <>
                {tab === "Onboarding" && (
                  <>
                    <SingleImport actor={actor} data={data} />
                  </>
                )}
                {tab === "Inventory management" && (
                  <>
                    <Manage data={data} act={act} busy={busy} />
                    <details>
                      <summary>Forecast-based inventory summary</summary>
                      <Inventory data={data} />
                    </details>
                  </>
                )}{" "}
                {tab === "Past usage" && <Records data={data} actor={actor} />}{" "}
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
          ? `${hospital.history_rows} consumption records imported. Your inventory and scheduled deliveries are connected. Use Inventory management to update quantities or expiry dates.`
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
      ![
        "Needs re-evaluation",
        "Expired",
        "Rejected",
        "Cancelled",
        "Received",
      ].includes(n.status),
  );
  return (
    <Card
      title="Transfer approvals"
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
          No approvals waiting. A recommendation appears here only when the
          analysis finds a safe, useful transfer.
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
  const products = network.supplies.filter((s) =>
    (network.facility_supplies?.[facility] || []).includes(s.id),
  );
  const [sid, setSid] = useState("ORS");
  useEffect(() => {
    if (!products.length) {
      Object.keys(sessionStorage)
        .filter((k) => k.startsWith("forecast-checkpoint-" + facility + ":"))
        .forEach((k) => sessionStorage.removeItem(k));
    }
    if (!products.some((s) => s.id === sid)) {
      setSid(products[0]?.id || "");
      setStage(1);
      setWalking(false);
      setRequested(false);
    }
  }, [facility, products.map((s) => s.id).join(","), sid]);
  const [stage, setStage] = useState(1);
  const [follow, setFollow] = useState(true);
  const [walking, setWalking] = useState(false);
  const [requested, setRequested] = useState(false);
  const priorRun = useRef(network.demo.latest_run);
  const priorJob = useRef<string | undefined>(undefined);
  const panels = useRef<(HTMLElement | null)[]>([]);
  const active = network.jobs.findLast((j) =>
    ["queued", "running"].includes(j.status),
  );
  const risks = network.allocation?.risks
    ? Object.values(network.allocation.risks)
    : network.risks;
  const forecast = network.forecasts.find(
    (f) => f.facility_id === facility && f.supply_id === sid,
  );
  const risk = risks.find(
    (r) => r.facility_id === facility && r.supply_id === sid,
  );
  const supply = network.supplies.find((s) => s.id === sid);
  const gate = network.allocation?.searches?.[facility + ":" + sid];
  const searchNeeded = !!gate && gate.kind !== "none";
  const searchDone =
    searchNeeded &&
    network.events.some(
      (e) =>
        e.type === "SEARCH_COMPLETED" &&
        e.run_id === forecast?.run_id &&
        e.facilities.includes(facility) &&
        e.details.supply_id === sid,
    );
  const scoped: Snapshot = {
    ...network,
    forecasts: forecast ? [forecast] : [],
    risks: risk ? [risk] : [],
    negotiations: network.negotiations.filter(
      (n) =>
        n.supply_id === sid &&
        (n.donor === facility || n.recipient === facility),
    ),
    transfers: network.transfers.filter(
      (t) =>
        t.supply_id === sid &&
        (t.donor === facility || t.recipient === facility),
    ),
  };
  const offers = scoped.negotiations.filter(
    (n) =>
      ![
        "Needs re-evaluation",
        "Expired",
        "Cancelled",
        "Rejected",
        "Received",
      ].includes(n.status),
  );
  const threads = offers.length
    ? offers
    : scoped.negotiations.filter((n) => n.status === "Received");
  const briefed =
    threads.length > 0 &&
    threads.every((n) =>
      [n.donor, n.recipient].every((id) =>
        n.messages.some((m) => m.type === "agent briefing" && m.actor === id),
      ),
    );
  const deliveries = scoped.transfers.filter(
    (t) => !["Cancelled", "Rejected", "Expired"].includes(t.status),
  );
  const approvalComplete =
    threads.length > 0 &&
    threads.every((n) => deliveries.some((t) => t.id === n.id));
  const latestJob = network.jobs.at(-1);
  const failed = latestJob?.status === "failed";
  const ready = [
    true,
    !!searchDone,
    threads.length > 0,
    briefed || deliveries.length > 0,
    deliveries.length > 0,
  ];
  const titles = [
    "Demand forecast",
    gate?.kind === "recipient_search"
      ? "Find a recipient"
      : "Find a nearby donor",
    "AI negotiation",
    "Hospital approvals",
    "Delivery & stock update",
  ];
  const complete = [
    !!forecast && !active,
    !!searchDone,
    briefed,
    approvalComplete,
    deliveries.length > 0 && deliveries.every((t) => t.status === "Received"),
  ];

  function select(next: number, manual = false) {
    if (manual) setWalking(false);
    setStage(next);
  }
  useEffect(() => {
    if (!requested) return;
    if (failed && latestJob?.id !== priorJob.current) {
      setRequested(false);
      setWalking(false);
      return;
    }
    if (!active && network.demo.latest_run !== priorRun.current) {
      setRequested(false);
      setWalking(true);
    }
  }, [requested, active?.id, network.demo.latest_run, failed, latestJob?.id]);
  useEffect(() => {
    if (!walking || !follow || active || requested) return;
    let next = 0;
    if (stage === 1 && searchDone) next = 2;
    if (stage === 2 && offers.length) next = 3;
    if (stage === 3 && briefed) next = 4;
    if (stage === 4 && approvalComplete) next = 5;
    if (!next) return;
    // Results already exist; these pauses pace their presentation, not computation.
    const timer = setTimeout(() => setStage(next), stage === 3 ? 6000 : 2500);
    return () => clearTimeout(timer);
  }, [
    walking,
    follow,
    stage,
    active?.id,
    requested,
    searchDone,
    offers.length,
    briefed,
    deliveries.length,
    approvalComplete,
  ]);
  useEffect(() => {
    if (stage > 1)
      panels.current[stage - 1]?.scrollIntoView({
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
        block: "start",
      });
  }, [stage]);
  useEffect(() => {
    if (stage > 1 && !ready[stage - 1]) setStage(1);
  }, [stage, searchDone, threads.length, briefed, deliveries.length]);
  function changeSelection(kind: "hospital" | "product", value: string) {
    if (kind === "hospital") setFacility(value);
    else setSid(value);
    setStage(1);
    setWalking(false);
    setRequested(false);
  }
  return (
    <div className="guided-workflow">
      <div className="workflow-controls">
        <label>
          Hospital
          <select
            aria-label="Controlled hospital"
            value={facility}
            onChange={(e) => changeSelection("hospital", e.target.value)}
          >
            {network.facilities.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Product
          <select
            aria-label="Product"
            disabled={!products.length}
            value={sid}
            onChange={(e) => changeSelection("product", e.target.value)}
          >
            {!products.length && (
              <option value="">No products — upload CSV</option>
            )}
            {products.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <Button
          disabled={busy || !!active || requested || !forecast}
          onClick={async () => {
            priorRun.current = network.demo.latest_run;
            priorJob.current = latestJob?.id;
            setStage(1);
            setWalking(false);
            setRequested(true);
            if (!(await act("/analysis-runs", { force: true })))
              setRequested(false);
          }}
        >
          {!products.length
            ? "Awaiting CSV"
            : active || requested
              ? "Recalculating…"
              : "Refresh workflow"}
        </Button>
      </div>
      {!products.length ? (
        <section className="trio-card empty-hospital" style={{ marginTop: 24 }}>
          <h2>No hospital data imported</h2>
          <p>
            Upload this hospital’s CSV to add its products and consumption
            history. Forecasts and workflow stages will appear after import.
          </p>
          <a
            href={"http://localhost:5173/hospital/" + facility}
            target="_blank"
            rel="noreferrer"
          >
            Open hospital onboarding ↗
          </a>
        </section>
      ) : (
        <>
          <div className="workflow-caption">
            <p>
              Edit inventory in the hospital dashboard, then refresh here to
              follow the result.
            </p>
            <label>
              <input
                type="checkbox"
                checked={follow}
                onChange={(e) => {
                  setFollow(e.target.checked);
                  if (e.target.checked) setWalking(true);
                }}
              />{" "}
              Follow stages automatically
            </label>
          </div>
          {failed && (
            <p role="alert" className="notice notice-danger">
              Analysis failed: {latestJob.error}. Refresh to retry.
            </p>
          )}
          <div className="workflow-rail" aria-label="Workflow stages">
            {titles.map((title, index) => (
              <section
                key={index}
                ref={(el) => {
                  panels.current[index] = el;
                }}
                className={
                  "workflow-stop " + (stage === index + 1 ? "is-current" : "")
                }
              >
                <button
                  className="workflow-stop-heading"
                  disabled={!ready[index]}
                  aria-expanded={stage === index + 1}
                  aria-current={stage === index + 1 ? "step" : undefined}
                  onClick={() => select(index + 1, true)}
                >
                  <span className="stage-number">{index + 1}</span>
                  <strong>{title}</strong>
                  <small>
                    {index === 0 && (active || requested)
                      ? "Calculating"
                      : !ready[index]
                        ? "Waiting"
                        : complete[index]
                          ? [
                              "Calculated",
                              "Complete",
                              "Complete",
                              "Approved",
                              "Delivered",
                            ][index]
                          : index === 3
                            ? "Awaiting approval"
                            : "In progress"}
                  </small>
                </button>
                {stage === index + 1 && (
                  <div className="workflow-stop-body">
                    {stage === 1 && (
                      <>
                        <ForecastSummary
                          forecast={forecast}
                          risk={risk}
                          supply={supply}
                          updating={!!active || requested}
                        />
                        <p className="stage-result">
                          {active || requested
                            ? "Running the forecast and checking current batches, expiry and arrivals…"
                            : gate?.kind === "none"
                              ? "No transfer needed. This workflow stops here."
                              : gate?.reason ||
                                "Upload the hospital CSV to begin."}
                        </p>
                        {searchDone && !active && !requested && (
                          <Button
                            onClick={() => {
                              setWalking(true);
                              select(2);
                            }}
                          >
                            Continue to hospital search <ArrowRight size={15} />
                          </Button>
                        )}
                      </>
                    )}
                    {stage === 2 && (
                      <>
                        <p className="stage-result">
                          Search complete. Eligibility was calculated from the
                          connected hospitals’ forecasts, usable stock, expiry
                          and outbreak restrictions.
                        </p>
                        <div className="scan-map">
                          <NetworkMap
                            data={{ ...network, negotiations: offers }}
                            supply={sid}
                            focus={facility}
                          />
                          <div className="scan-map-caption">
                            Geographic search results ·{" "}
                            {offers.length
                              ? "safe match found"
                              : "no safe match"}
                          </div>
                        </div>
                        <div className="scan-results">
                          {network.facilities
                            .filter((h) => h.id !== facility)
                            .map((h) => {
                              const matches = offers.filter(
                                (n) => n.donor === h.id || n.recipient === h.id,
                              );
                              const reasons =
                                network.allocation?.rejected.filter(
                                  (x) =>
                                    x.facility_id === h.id &&
                                    x.supply_id === sid,
                                ) || [];
                              const inZone = network.incidents.some(
                                (i) =>
                                  i.supply_id === sid &&
                                  Math.hypot(
                                    (h.lat - i.center.lat) * 111,
                                    (h.lng - i.center.lng) *
                                      111 *
                                      Math.cos((h.lat * Math.PI) / 180),
                                  ) <= i.radius_km,
                              );
                              return (
                                <article key={h.id}>
                                  <div>
                                    <strong>{h.name}</strong>
                                    <p>
                                      {matches.length
                                        ? matches
                                            .map(
                                              (n) =>
                                                `${fmt(n.quantity)} ${supply?.unit}s available for this transfer · ${n.travel_hours} h simulated travel`,
                                            )
                                            .join("; ")
                                        : reasons.length
                                          ? [
                                              ...new Set(
                                                reasons.map((x) => x.reason),
                                              ),
                                            ].join(" · ")
                                          : inZone
                                            ? "Inside the operational planning zone; excluded from automatic donation."
                                            : "No feasible allocation selected for this hospital."}
                                    </p>
                                  </div>
                                  <Badge
                                    tone={matches.length ? "green" : "neutral"}
                                  >
                                    {matches.length
                                      ? "Selected"
                                      : "Not selected"}
                                  </Badge>
                                </article>
                              );
                            })}
                        </div>
                        <p className="microcopy">
                          The backend selects the nearest feasible hospital
                          using the demo travel-time matrix. Lines show
                          connections, not road navigation.
                        </p>
                        {offers.length ? (
                          <Button
                            onClick={() => {
                              setWalking(true);
                              select(3);
                            }}
                          >
                            View negotiation <ArrowRight size={15} />
                          </Button>
                        ) : (
                          <p className="stage-result">
                            No safe transfer is possible. The unmet requirement
                            remains open; no approval has been created.
                          </p>
                        )}
                      </>
                    )}
                    {stage === 3 && (
                      <>
                        <p className="microcopy">
                          Messages below are stored outputs from the hospital
                          agents and constrained allocation engine. Live OpenAI
                          messages appear when the backend API key is
                          configured; fallback messages are labelled.
                        </p>
                        {threads.map((n) => (
                          <article key={n.id} className="negotiation-thread">
                            <h3>
                              {NAME[n.donor]} → {NAME[n.recipient]}
                            </h3>
                            <p>
                              {fmt(n.quantity)} {supply?.unit}s · safe limit{" "}
                              {fmt(n.max_quantity)} · version {n.version}
                            </p>
                            {n.messages.map((m, i) => (
                              <div
                                key={i}
                                className={
                                  "agent-bubble " +
                                  (m.actor === n.donor ? "donor-message" : "")
                                }
                              >
                                <strong>
                                  {NAME[m.actor] || m.actor} · {m.type}
                                </strong>
                                <p>{m.text}</p>
                                <small>
                                  {m.mode || "Deterministic allocation message"}{" "}
                                  · {new Date(m.at).toLocaleTimeString()}
                                </small>
                              </div>
                            ))}
                          </article>
                        ))}
                        {!briefed ? (
                          <p role="status">
                            Waiting for both hospital agents to finish
                            evaluating the proposal…
                          </p>
                        ) : (
                          <Button
                            onClick={() => {
                              setWalking(true);
                              select(4);
                            }}
                          >
                            Continue to approvals <ArrowRight size={15} />
                          </Button>
                        )}
                      </>
                    )}
                    {stage === 4 && (
                      <>
                        <p>
                          Both hospital administrators must approve the same
                          terms. Stock is reserved only after both approvals
                          pass validation.
                        </p>
                        {threads.map((n) => (
                          <article
                            className="approval-wait"
                            key={n.id}
                            data-proposal-id={n.id}
                          >
                            <h3>
                              {fmt(n.quantity)} {supply?.unit}s · version{" "}
                              {n.version}
                            </h3>
                            <p>{n.reason}</p>
                            <div className="approval-pair">
                              {[n.donor, n.recipient].map((id) => (
                                <div key={id}>
                                  <strong>{NAME[id]}</strong>
                                  <Badge
                                    tone={
                                      n.approvals.includes(id)
                                        ? "green"
                                        : "amber"
                                    }
                                  >
                                    {n.approvals.includes(id)
                                      ? "Approved"
                                      : "Awaiting approval"}
                                  </Badge>
                                  <a
                                    href={
                                      "http://localhost:5173/hospital/" +
                                      id +
                                      "?tab=approvals"
                                    }
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    Open hospital dashboard ↗
                                  </a>
                                </div>
                              ))}
                            </div>
                          </article>
                        ))}
                        {deliveries.length > 0 && (
                          <Button onClick={() => select(5)}>
                            Continue to delivery <ArrowRight size={15} />
                          </Button>
                        )}
                      </>
                    )}
                    {stage === 5 && (
                      <CourierSimulation
                        data={{ ...scoped, transfers: deliveries }}
                        act={act}
                        busy={busy}
                      />
                    )}
                  </div>
                )}
              </section>
            ))}
          </div>
        </>
      )}
      <details className="operations-tools">
        <summary>Data downloads & demo reset</summary>
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
function CourierSimulation({
  data,
  act,
  busy,
}: {
  data: Snapshot;
  act: (p: string, b?: unknown) => Promise<boolean>;
  busy: boolean;
}) {
  const [simulating, setSimulating] = useState<string | null>(null);
  const states = [
    "Reserved",
    "Assigned",
    "Picked up",
    "In transit",
    "Received",
  ];
  const labels = [
    "Ready for rider",
    "Rider accepted",
    "Picked up",
    "On the way",
    "Delivered",
  ];
  return (
    <div className="courier-simulation">
      <p className="microcopy">
        Simulated courier. Each step records a real transfer event; pickup
        removes donor stock and receipt adds recipient stock.
      </p>
      {data.transfers.map((t) => {
        const progress = Math.max(0, states.indexOf(t.status));
        return (
          <article key={t.id} className="courier-trip">
            <h3>
              {NAME[t.donor]} → {NAME[t.recipient]}
            </h3>
            <p>
              {fmt(t.quantity)}{" "}
              {data.supplies.find((s) => s.id === t.supply_id)?.unit}s ·{" "}
              {t.status}
            </p>
            <div className="courier-road" aria-label={labels[progress]}>
              <span className="road-end">Pickup</span>
              <div className="road-line">
                <Bike
                  size={32}
                  className={progress === 3 ? "rider riding" : "rider"}
                  style={{ left: `${progress * 25}%` }}
                />
              </div>
              <span className="road-end">
                <PackageCheck size={24} />
                Delivery
              </span>
            </div>
            <ol className="courier-milestones">
              {labels.map((label, i) => (
                <li key={label} className={i <= progress ? "passed" : ""}>
                  {label}
                </li>
              ))}
            </ol>
            {t.status !== "Received" && (
              <Button
                disabled={busy || !!simulating}
                onClick={async () => {
                  setSimulating(t.id);
                  try {
                    for (const command of [
                      "claim",
                      "pickup",
                      "transit",
                      "receive",
                    ].slice(progress)) {
                      if (!(await act("/transfers/" + t.id + "/" + command)))
                        break;
                      await new Promise((resolve) => setTimeout(resolve, 1200));
                    }
                  } finally {
                    setSimulating(null);
                  }
                }}
              >
                {simulating === t.id
                  ? "Rider simulation running…"
                  : "Simulate delivery"}
              </Button>
            )}
            {t.status === "Received" && (
              <p className="stage-result" role="status">
                Delivery received. Both hospitals’ inventory has been updated.
              </p>
            )}
            <div className="delivery-balances">
              {[t.donor, t.recipient].map((id) => (
                <div key={id}>
                  <small>{NAME[id]} · on hand</small>
                  <strong>
                    {fmt(
                      data.inventory
                        .filter(
                          (b) =>
                            b.facility_id === id && b.supply_id === t.supply_id,
                        )
                        .reduce((sum, b) => sum + b.quantity, 0),
                    )}
                  </strong>
                </div>
              ))}
            </div>
          </article>
        );
      })}
      <details>
        <summary>Manual courier controls</summary>
        <Deliveries
          data={data}
          actor="judge"
          act={act}
          busy={busy || !!simulating}
        />
      </details>
      <Badge tone={data.reconciliation?.balanced ? "green" : "red"}>
        {data.reconciliation?.balanced ? "Ledger balanced" : "Review ledger"}
      </Badge>
    </div>
  );
}
