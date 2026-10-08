import {
  lazy,
  Suspense,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
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
  Download,
  X,
  Eye,
  EyeOff,
} from "lucide-react";
import { api, post, fmt, days, date, exportUrl, ApiError } from "./lib/api";
import type { Snapshot, Batch, Negotiation, Message } from "./lib/types";
import { Button, Badge } from "./components/ui";
import { ForecastSummary } from "./components/ForecastSummary";
import { NetworkMap } from "./components/NetworkMap";
import { CsvUpload } from "./components/CsvUpload";
import { UsageExplorer, type UsageGuidance } from "./components/UsageExplorer";
import { InventoryExplorer } from "./components/InventoryExplorer";
import { AuditExplorer } from "./components/AuditExplorer";
import { NearbyHospitals } from "./components/NearbyHospitals";
import type { ImportProgress } from "./components/DashboardPip";
const DashboardPip = lazy(() => import("./components/DashboardPip"));
const HospitalNetwork = lazy(() => import("./components/HospitalNetwork"));
const CareMascot = lazy(() => import("./components/CareMascot"));
const LoginScene = lazy(() => import("./components/LoginScene"));
const HowItWorks = lazy(() => import("./components/HowItWorks"));
const LandingInfo = lazy(() => import("./components/LandingInfo"));
const LANDING_SECTIONS = [
  ["home", "Home"],
  ["how-it-works", "How it works"],
  ["features", "Features"],
  ["faq", "FAQ"],
] as const;
const REMEMBER_KEY = "inception-remember-email";
function readRemembered() {
  try {
    return localStorage.getItem(REMEMBER_KEY) || "";
  } catch {
    return "";
  }
}
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
function OfferCalculation({ message }: { message: Message }) {
  const review = message.evidence;
  if (!review) return null;
  return (
    <details>
      <summary>
        Forecast calculation: {fmt(review.offered_quantity)} offered →{" "}
        {fmt(review.recommended_quantity)} useful units
      </summary>
      <p>
        Seven-day planning demand: {fmt(review.planning_7_days)}. Extra expiry
        waste if accepted: {fmt(review.additional_waste_if_accepted)} units.
        Existing stock and confirmed arrivals are included.
      </p>
      {review.batches.map((batch) => (
        <p key={batch.batch_id}>
          {batch.batch_id}: {fmt(batch.quantity)} offered,{" "}
          {fmt(batch.predicted_consumed)} expected to be consumed. Arrival{" "}
          {date(batch.arrives_at)} · expiry {date(batch.expires_at)}.
        </p>
      ))}
      <small>
        Forecast run {review.forecast_run_id} · earliest-expiry-first simulation
        · whole packs
      </small>
    </details>
  );
}

export function TrioLanding({ page = "home" }: { page?: "home" | "login" }) {
  const [logoutNotice] = useState(() =>
    sessionStorage.getItem("inception-logout-notice"),
  );
  useEffect(() => {
    sessionStorage.removeItem("inception-logout-notice");
  }, []);
  // Highlight the nav link for the section currently in view.
  const [currentSection, setCurrentSection] = useState("home");
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const line = innerHeight * 0.4;
      let current: string = LANDING_SECTIONS[0][0];
      for (const [id] of LANDING_SECTIONS) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= line) current = id;
      }
      setCurrentSection(current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onScroll);
    update();
    return () => {
      cancelAnimationFrame(frame);
      removeEventListener("scroll", onScroll);
      removeEventListener("resize", onScroll);
    };
  }, []);
  // The sign-in dialog opens over the landing page; /login (used by approval
  // links and logout) opens it directly, prefilled for the linked hospital.
  const [open, setOpen] = useState(page === "login");
  const [email, setEmail] = useState(
    () =>
      EMAILS[new URLSearchParams(location.search).get("login") || ""] ||
      readRemembered(),
  );
  const [remember, setRemember] = useState(() => !!readRemembered());
  function openLogin() {
    setOpen(true);
    if (location.pathname !== "/login")
      history.pushState(null, "", "/login" + location.search);
  }
  function closeLogin() {
    setOpen(false);
    setError("");
    history.pushState(null, "", "/");
  }
  useEffect(() => {
    const sync = () => setOpen(location.pathname === "/login");
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeLogin();
    addEventListener("popstate", sync);
    if (open) addEventListener("keydown", onKey);
    return () => {
      removeEventListener("popstate", sync);
      removeEventListener("keydown", onKey);
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const controls = [
        ...document.querySelectorAll<HTMLElement>(
          ".login-backdrop a[href], .login-backdrop button:not(:disabled), .login-backdrop input:not(:disabled)",
        ),
      ].filter((el) => el.getClientRects().length > 0);
      const first = controls[0],
        last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", trapFocus);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", trapFocus);
      document.querySelector<HTMLElement>(".hero-login-link")?.focus();
    };
  }, [open]);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function login() {
    setBusy(true);
    setError("");
    try {
      const r = await post<{ session: string; facility_id: string }>(
        "/auth/login",
        "judge",
        { email: email.trim(), password },
      );
      sessionStorage.setItem("inception-session-" + r.facility_id, r.session);
      try {
        if (remember) localStorage.setItem(REMEMBER_KEY, email.trim());
        else localStorage.removeItem(REMEMBER_KEY);
      } catch {
        /* storage unavailable: remembering is a convenience only */
      }
      window.location.href =
        "/hospital/" +
        r.facility_id +
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
      {!open && (
        <Suspense fallback={null}>
          <CareMascot onOpenLogin={openLogin} />
        </Suspense>
      )}
      <header className="landing-nav">
        <a className="brand" href="/">
          <Activity />
          inception.
        </a>
        <nav className="landing-nav-links" aria-label="Primary">
          {LANDING_SECTIONS.map(([id, label]) => (
            <a
              key={id}
              href={"#" + id}
              aria-current={currentSection === id ? "location" : undefined}
            >
              {label}
            </a>
          ))}
        </nav>
        <button type="button" className="landing-nav-cta" onClick={openLogin}>
          Sign in
        </button>
      </header>
      <main>
        {
          <section className="network-hero" id="home">
            <div className="network-hero-copy">
              <span className="eyebrow">
                <span className="hero-eyebrow-line" /> MEDICAL SUPPLY
                INTELLIGENCE
              </span>
              <h1>
                One network.
                <br />
                Better prepared.
              </h1>
              <p className="landing-lead">
                The right supplies. The right hospital. Before they’re needed.
              </p>
              <p className="hero-description">
                Turn everyday inventory into shared foresight. Anticipate
                shortages, connect nearby hospitals, and coordinate transfers
                with confidence.
              </p>
              <a
                className="hero-login-link"
                href="/login"
                onClick={(e) => {
                  e.preventDefault();
                  openLogin();
                }}
              >
                Enter your hospital <ArrowRight size={16} />
              </a>
            </div>
            <Suspense
              fallback={
                <div className="hospital-network network-loading" role="status">
                  Preparing the hospital network…
                </div>
              }
            >
              <HospitalNetwork />
            </Suspense>
          </section>
        }
        <Suspense fallback={null}>
          <HowItWorks />
          <LandingInfo onTryDemo={openLogin} />
        </Suspense>
        {open && (
          <div
            className="login-backdrop"
            role="dialog"
            aria-modal="true"
            aria-labelledby="login-title"
            onMouseDown={(e) => e.target === e.currentTarget && closeLogin()}
          >
            <div className="login-modal">
              <div className="login-visual">
                <Suspense fallback={null}>
                  <LoginScene />
                </Suspense>
                <div className="login-visual-brand">
                  <Activity size={20} />
                  inception.
                </div>
                <div className="login-visual-copy">
                  <strong>One network. Better prepared.</strong>
                  <span>
                    The right supplies. The right hospital. Before they’re
                    needed.
                  </span>
                </div>
              </div>
              <div className="login-panel">
                <button
                  type="button"
                  className="login-close"
                  aria-label="Close sign in"
                  onClick={closeLogin}
                >
                  <X size={18} />
                </button>
                <div className="login-logo">
                  <Activity size={22} />
                </div>
                <h2 id="login-title">Sign in to your hospital</h2>
                <p className="login-sub">
                  Enter your hospital credentials to open your workspace.
                </p>
                {logoutNotice && (
                  <p role="status" className="login-notice">
                    {logoutNotice}
                  </p>
                )}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    login();
                  }}
                >
                  <label className="login-field">
                    <span>Email</span>
                    <input
                      aria-label="Email"
                      type="email"
                      placeholder="Hospital email"
                      autoComplete="username"
                      autoFocus={!email}
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </label>
                  <label className="login-field">
                    <span>Password</span>
                    <span className="login-password">
                      <input
                        aria-label="Password"
                        placeholder="Password"
                        type={showPassword ? "text" : "password"}
                        autoComplete="current-password"
                        autoFocus={!!email}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                      <button
                        type="button"
                        className="login-eye"
                        aria-label={
                          showPassword ? "Hide characters" : "Show characters"
                        }
                        onClick={() => setShowPassword((v) => !v)}
                      >
                        {showPassword ? (
                          <EyeOff size={16} />
                        ) : (
                          <Eye size={16} />
                        )}
                      </button>
                    </span>
                  </label>
                  <label className="login-remember">
                    <input
                      type="checkbox"
                      checked={remember}
                      onChange={(e) => setRemember(e.target.checked)}
                    />
                    <span>Remember me</span>
                  </label>
                  {error && (
                    <p className="login-error" role="alert">
                      {error}
                    </p>
                  )}
                  <button
                    type="submit"
                    className="login-submit"
                    disabled={busy}
                  >
                    {busy ? "Signing in…" : "Log in"}
                  </button>
                </form>
                <p className="login-footnote">
                  Demo accounts: admin@kaveri.demo · admin@chamundi.demo ·
                  admin@mandya.demo — password <code>Demo@2026</code>
                </p>
              </div>
            </div>
            <Suspense fallback={null}>
              <CareMascot onOpenLogin={openLogin} context="login" />
            </Suspense>
          </div>
        )}
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
  const [usageGuidance, setUsageGuidance] = useState<UsageGuidance>();
  const [inventoryGuidance, setInventoryGuidance] = useState<UsageGuidance>();
  const [importProgress, setImportProgress] = useState<ImportProgress>({
    busy: false,
    imported: false,
    error: "",
    records: 0,
  });
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
        "/login?login=" +
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
  const sessionExpired = q.error instanceof ApiError && q.error.status === 401;
  useEffect(() => {
    if (!consoleMode && sessionExpired) {
      sessionStorage.removeItem("inception-session-" + actor);
      location.replace("/login?login=" + actor);
    }
  }, [sessionExpired, consoleMode, actor]);
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
  async function logoutHospital() {
    setBusy(true);
    setError("");
    try {
      await post("/auth/logout", actor, {});
      sessionStorage.removeItem("inception-session-" + actor);
      if (actor === "A") {
        Object.keys(sessionStorage)
          .filter((key) => key.startsWith("forecast-checkpoint-A:"))
          .forEach((key) => sessionStorage.removeItem(key));
      }
      if (actor === "A")
        sessionStorage.setItem(
          "inception-logout-notice",
          "Kaveri’s CSV import, inventory and forecasts have been cleared. Log in and upload the CSV to begin again.",
        );
      location.replace("/login");
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  }
  const [pipelineTarget, setPipelineTarget] = useState<HTMLDivElement | null>(null);
  const data = sessionExpired ? undefined : q.data;
  return (
    <div className={"app-shell trio-shell" + (consoleMode ? " backend-theme" : "")}>
      <aside className="sidebar">
        <a
          className="brand"
          href="/"
          aria-label={
            consoleMode ? "Inception home" : "Log out and return to login"
          }
          onClick={(event) => {
            if (!consoleMode) {
              event.preventDefault();
              if (!busy) void logoutHospital();
            }
          }}
        >
          <Activity /> <span>inception.</span>
        </a>
        {consoleMode ? (
          <div className="backend-sidebar-content">
            <div className="workspace-label">Backend workflow</div>
            <div ref={setPipelineTarget} />
          </div>
        ) : (
          <>
            <div className="workspace-label">HOSPITAL WORKSPACE</div>
            <div className="trio-identity"><strong>{NAME[actor]}</strong><small>{EMAILS[actor]}</small></div>
          </>
        )}
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
        {!consoleMode && <div className="sidebar-bottom">
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
          <small>Local synthetic demonstration</small>
        </div>}
      </aside>
      <main className="trio-main">
        <header className="trio-header">
          <div>
            {consoleMode && (
              <span className="eyebrow">INCEPTION / LIVE WORKFLOW</span>
            )}
            <h1>
              {consoleMode
                ? "Backend workflow"
                : tab === "Onboarding"
                  ? "Your hospital. Your supplies."
                  : tab}
            </h1>
          </div>
          {!consoleMode && (
            <Button
              variant="danger"
              disabled={!data?.supplies.length}
              onClick={() => setReport(true)}
            >
              <AlertTriangle size={15} />
              Report outbreak
            </Button>
          )}
          {!consoleMode && (
            <Button variant="ghost" disabled={busy} onClick={logoutHospital}>
              <LogOut size={15} />
              Log out
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
            {consoleMode ? (
              <Operations data={data} act={act} busy={busy} pipelineTarget={pipelineTarget} />
            ) : (
              <>
                {tab === "Onboarding" && (
                  <>
                    <SingleImport
                      actor={actor}
                      data={data}
                      onProgress={setImportProgress}
                    />
                    <Card
                      title="Nearby hospitals"
                      sub="Live supply-risk overview across your hospital network."
                    >
                      <NearbyHospitals data={data} />
                    </Card>
                  </>
                )}
                {tab === "Inventory management" && (
                  <>
                    <Manage
                      data={data}
                      act={act}
                      busy={busy}
                      onExplain={setInventoryGuidance}
                    />
                    <details>
                      <summary>Forecast-based inventory summary</summary>
                      <Inventory data={data} />
                    </details>
                  </>
                )}{" "}
                {tab === "Past usage" && (
                  <Records data={data} onExplain={setUsageGuidance} />
                )}{" "}
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
      {!consoleMode && data && !report && (
        <Suspense fallback={null}>
          <DashboardPip
            data={data}
            tab={tab}
            progress={importProgress}
            usageGuidance={usageGuidance}
            inventoryGuidance={inventoryGuidance}
          />
        </Suspense>
      )}
    </div>
  );
}
function SingleImport({
  actor,
  data,
  onProgress,
}: {
  actor: string;
  data: Snapshot;
  onProgress: (progress: ImportProgress) => void;
}) {
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
  const showImported = !!hospital?.onboarded && !busy;
  useEffect(() => {
    onProgress({
      busy,
      imported: showImported,
      error,
      records: hospital?.history_rows || 0,
    });
  }, [busy, showImported, error, hospital?.history_rows, onProgress]);
  async function upload() {
    if (!file || busy) return;
    const startedAt = performance.now();
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      body.append("file", file);
      await api("/onboarding/csv", actor, { method: "POST", body });
      await qc.invalidateQueries();
      // Keep the presentation visible without delaying the backend import.
      await new Promise((resolve) =>
        setTimeout(
          resolve,
          Math.max(0, 3500 - (performance.now() - startedAt)),
        ),
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card
      title={
        showImported
          ? "Hospital data connected"
          : "Start with your hospital CSV"
      }
      sub={
        showImported
          ? `${hospital?.history_rows} consumption records imported. Your inventory and scheduled deliveries are connected. Use Inventory management to update quantities or expiry dates.`
          : "One file contains the hospital profile, supply definitions, inventory batches, consumption history and scheduled replenishments. All rows are validated together."
      }
    >
      <CsvUpload
        file={file}
        busy={busy}
        imported={showImported}
        records={hospital?.history_rows || 0}
        templateUrl={fileUrl("/onboarding/template/" + actor, actor)}
        onSelect={(next) => {
          setFile(next);
          setError("");
        }}
        onError={(message) => {
          setFile(undefined);
          setError(message);
        }}
        onImport={upload}
      />
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
  onExplain,
}: {
  data: Snapshot;
  act: (p: string, b: unknown) => Promise<boolean>;
  busy: boolean;
  onExplain: (value: UsageGuidance) => void;
}) {
  const [editing, setEditing] = useState<Batch | null>(null);
  const [qty, setQty] = useState(0);
  const [expiry, setExpiry] = useState("");
  const [reason, setReason] = useState("Demo inventory correction");
  return (
    <>
      <InventoryExplorer
        data={data}
        busy={busy}
        onExplain={onExplain}
        onEdit={(batch) => {
          setEditing(batch);
          setQty(batch.quantity);
          setExpiry(batch.expires_at.slice(0, 10));
        }}
      />
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
    </>
  );
}
function Records({
  data,
  onExplain,
}: {
  data: Snapshot;
  onExplain: (value: UsageGuidance) => void;
}) {
  const [usage, setUsage] = useState<UsageGuidance>();
  const [audit, setAudit] = useState<UsageGuidance>();
  const [active, setActive] = useState("usage");
  const auditRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = auditRef.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) =>
        setActive(
          entry.isIntersecting || element.contains(document.activeElement)
            ? "audit"
            : "usage",
        ),
      { rootMargin: "0px 0px -40% 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const guidance = active === "audit" ? audit : usage;
    if (guidance) onExplain(guidance);
  }, [active, audit, usage, onExplain]);
  return (
    <>
      <section
        className="trio-card usage-card"
        aria-label="Historical consumption"
        onPointerDownCapture={() => setActive("usage")}
        onFocusCapture={() => setActive("usage")}
      >
        <UsageExplorer data={data} onExplain={setUsage} />
      </section>
      <div
        ref={auditRef}
        onPointerDownCapture={() => setActive("audit")}
        onFocusCapture={() => setActive("audit")}
      >
        <Card title="Inventory journey">
          <AuditExplorer data={data} onExplain={setAudit} />
        </Card>
      </div>
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
  const [selected, setSelected] = useState(data.supplies[0]?.id || "");
  return (
    <div className="trio-modal-backdrop">
      <section
        className="trio-modal demand-surge-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="demand-surge-title"
      >
        <h2 id="demand-surge-title">Report demand surge</h2>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy || !selected) return;
            if (
              await act("/outbreak-reports", {
                onset_at: data.demo.as_of,
                category: "Suspected demand surge",
                supply_ids: [selected],
                additional_units: {},
                note: "",
              })
            )
              close();
          }}
        >
          <label>
            Product
            <select
              aria-label="Product"
              required
              value={selected}
              disabled={busy}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="" disabled>
                Select a product
              </option>
              {data.supplies.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <div className="trio-actions">
            <Button disabled={busy || !selected} variant="danger">
              {busy ? "Reporting…" : "Report demand surge"}
            </Button>
            <Button
              variant="outline"
              type="button"
              disabled={busy}
              onClick={close}
            >
              Cancel
            </Button>
          </div>
        </form>
        <Suspense fallback={null}>
          <CareMascot
            context="dashboard"
            guidance={{
              title: busy
                ? "I’m reporting the surge."
                : "Seeing higher demand?",
              text: busy
                ? "Your report is being saved and the hospital’s supply risks will be reassessed."
                : "Choose the product with increased demand, then press Report demand surge. This records a signal and triggers reassessment using your usage history and stock. It won’t invent extra demand quantities or guarantee a transfer.",
            }}
          />
        </Suspense>
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
      sub="Review the transfer terms and recommendation. Both hospitals must approve the same agreement before supplies move."
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
  const supply = data.supplies.find((s) => s.id === n.supply_id);
  const briefing = [...n.messages].reverse().find((m) =>
    m.briefing_for === actor && m.version === n.version && m.quantity === n.quantity);
  useEffect(() => setQuantity(n.quantity), [n.quantity, n.version]);
  return (
    <article className="trio-proposal transfer-contract" data-proposal-id={n.id}>
      <div className="contract-reference">TRANSFER AGREEMENT · {n.id} · VERSION {n.version}</div>
      <div className="entry-top">
        <h3>{supply?.name || n.supply_id}</h3>
        <Badge tone={n.status === "Reserved" ? "green" : "amber"}>
          {n.status}
        </Badge>
      </div>
      <div className="contract-parties">
        <div><small>Supplying hospital</small><strong>{NAME[n.donor]}</strong></div>
        <span aria-hidden="true">→</span>
        <div><small>Receiving hospital</small><strong>{NAME[n.recipient]}</strong></div>
      </div>
      <dl className="contract-terms">
        <div><dt>Agreed quantity</dt><dd>{fmt(n.quantity)} {supply?.unit}</dd></div>
        <div><dt>Maximum safe offer</dt><dd>{fmt(n.max_quantity)} {supply?.unit}</dd></div>
        <div><dt>Estimated arrival · demo time</dt><dd>{new Date(n.eta).toLocaleString()}</dd></div>
      </dl>
      <div className="contract-batches">
        {n.lines.map((line, i) => <div key={line.batch_id || i}>
          <strong>{line.lot || line.batch_id || "Allocated batch"}</strong>
          <span>{fmt(line.quantity)} {supply?.unit}</span>
          <span>Expiry: {line.expires_at ? new Date(line.expires_at).toLocaleDateString() : "Not supplied"}</span>
        </div>)}
      </div>
      <section className="contract-explanation" aria-label="Decision explanation">
        <small>WHY THIS TRANSFER IS RECOMMENDED</small>
        <h4>{n.purpose === "expiry_rescue" ? "Use supplies before they expire." : "Help cover the receiving hospital’s forecast demand."}</h4>
        <p>{n.purpose === "expiry_rescue"
          ? `The forecast indicates ${NAME[n.recipient]} can use these ${fmt(n.quantity)} ${supply?.unit} before expiry. The supplying hospital keeps its protected demand and reserve.`
          : `The forecast identified a supply gap at ${NAME[n.recipient]}. This offer provides ${fmt(n.quantity)} ${supply?.unit} while protecting the supplying hospital’s forecast demand and reserve. ${n.remaining_unmet > 0 ? `${fmt(n.remaining_unmet)} units of forecast demand still need another source.` : "The evaluated forecast gap is covered by the planned allocations."}`}</p>
        <p className="microcopy">These are planning estimates. Stock moves only after both hospitals approve this version.</p>
        {briefing && <div className="contract-agent"><strong>Your hospital agent’s recommendation</strong><p>{briefing.text}</p><small>{briefing.mode}</small></div>}
      </section>
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
            <OfferCalculation message={m} />
            <small>
              {(m as typeof m & { mode?: string }).mode ||
                "Deterministic constrained negotiation"}{" "}
              · {new Date(m.at).toLocaleTimeString()}
            </small>
          </div>
        ))}
      </details>
      <div className="contract-signatures">
        {[n.donor, n.recipient].map((id) => <div key={id}>
          <small>{id === n.donor ? "Supplier approval" : "Recipient approval"}</small>
          <strong>{NAME[id]}</strong>
          <span>{n.approvals.includes(id) ? `Approved · version ${n.version}` : "Awaiting administrator approval"}</span>
        </div>)}
      </div>
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
  pipelineTarget,
  data: network,
  act,
  busy,
}: {
  pipelineTarget: HTMLDivElement | null;
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
    if (manual) setWalking(follow);
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
  const canAdvance =
    walking &&
    follow &&
    !active &&
    !requested &&
    stage < 5 &&
    complete[stage - 1] &&
    ready[stage];
  useEffect(() => {
    if (!canAdvance) return;
    // A completed, visible stage gets its own full six-second hold.
    // Unrelated polling updates must not restart that hold.
    const timer = setTimeout(() => setStage(stage + 1), 6000);
    return () => clearTimeout(timer);
  }, [stage, canAdvance]);
  useLayoutEffect(() => {
    // Keep completed panels mounted so the next stage stays below them.
    // Scroll after the new panel has expanded and its layout is committed.
    const frame = requestAnimationFrame(() => {
      const heading = panels.current[
        stage - 1
      ]?.querySelector<HTMLButtonElement>(".workflow-stop-heading");
      heading?.focus({ preventScroll: true });
      heading?.scrollIntoView({
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
        block: "start",
      });
    });
    return () => cancelAnimationFrame(frame);
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
      {pipelineTarget && createPortal(
        <nav className="backend-pipeline" aria-label="Backend workflow pipeline">
          {titles.map((title, index) => (
            <button key={index} disabled={!products.length || !ready[index]}
              aria-current={stage === index + 1 ? "step" : undefined}
              className={(complete[index] ? "is-complete " : "") + (stage === index + 1 ? "is-active" : "")}
              onClick={() => select(index + 1, true)}>
              <span className="pipeline-node">{complete[index] ? <CheckCircle2 size={16} /> : String(index + 1).padStart(2, "0")}</span>
              <span><strong>{title}</strong><small>{!products.length ? "Awaiting CSV" : index === 0 && (active || requested) ? "Calculating" : complete[index] ? "Complete" : !ready[index] ? "Waiting" : index === 3 ? "Awaiting approval" : "Ready"}</small></span>
            </button>
          ))}
        </nav>, pipelineTarget)}
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
              follow the result. Each completed stage stays visible for six
              seconds before the next available stage opens.
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
                  aria-expanded={index + 1 <= stage && ready[index]}
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
                {index + 1 <= stage && ready[index] && (
                  <div className="workflow-stop-body">
                    {index === 0 && (
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
                              ? gate.reason || "No transfer needed. This workflow stops here."
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
                    {index === 1 && (
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
                                    x.supply_id === sid &&
                                    (!x.recipient_id ||
                                      x.recipient_id === facility),
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
                            No safe transfer is possible with the current stock
                            and reserve rules. The unmet requirement remains
                            open; consider expedited replenishment. Green map
                            markers indicate adequate own stock, not
                            transferable surplus.
                          </p>
                        )}
                      </>
                    )}
                    {index === 2 && (
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
                                <OfferCalculation message={m} />
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
                    {index === 3 && (
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
                    {index === 4 && (
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
      <section className="trio-card" style={{ marginTop: 24 }}>
        <h2>Finished your demo?</h2>
        <p>
          Reset all inventory changes, outbreak reports, approvals and
          deliveries. All three hospitals return to their original CSV inventory
          amounts and expiry dates. Hospital administrators will need to log in
          again.
        </p>
        <Button
          variant="outline"
          disabled={busy || !!active}
          onClick={async () => {
            if (!(await act("/demo/finish"))) return;
            setWalking(false);
            setRequested(false);
            setStage(1);
            setFacility("A");
            setSid("");
            Object.keys(sessionStorage)
              .filter((key) => key.startsWith("forecast-checkpoint-"))
              .forEach((key) => sessionStorage.removeItem(key));
          }}
        >
          Done — reset demo
        </Button>
      </section>
      <details className="operations-tools">
        <summary>Data downloads</summary>
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
