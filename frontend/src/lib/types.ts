export type Facility = {
  id: string;
  name: string;
  area: string;
  lat: number;
  lng: number;
  patient_load: number;
  emergency_share: number;
  lead_days: number;
};
export type Supply = {
  id: string;
  name: string;
  unit: string;
  pack_size: number;
  critical: boolean;
  alternative: boolean;
  storage: string;
};
export type Batch = {
  id: string;
  facility_id: string;
  supply_id: string;
  lot: string;
  quantity: number;
  reserved: number;
  expires_at: string;
  storage: string;
  quarantined: boolean;
};
export type Risk = {
  timeline: { day: number; stock: number; unmet: number }[];
  id: string;
  facility_id: string;
  supply_id: string;
  stock: number;
  reserved: number;
  demand_7: number;
  stockout_days: number | null;
  stress_stockout_days: number | null;
  before_replenishment: boolean;
  lead_days: number;
  expiry_units: number;
  unmet: number;
  tier: number;
  model: string;
  run_id: string;
};
export type Forecast = {
  id: string;
  facility_id: string;
  supply_id: string;
  run_id: string;
  cutoff: string;
  model: string;
  source: string;
  p10: number[];
  p50: number[];
  p90: number[];
  planning: number[];
  stress: number[];
  normal_daily: number;
  adjustments: string[];
  history: {
    date: string;
    quantity: number;
    imputed: boolean;
    model_input: number;
  }[];
  fallback_reason: string | null;
  computed_at: string;
  input_hash: string;
};
export type Message = {
  mode?: string;
  actor: string;
  type: string;
  quantity: number;
  text: string;
  at: string;
};
export type Negotiation = {
  created_at?: string;
  id: string;
  donor: string;
  recipient: string;
  supply_id: string;
  quantity: number;
  max_quantity: number;
  status: string;
  version: number;
  approvals: string[];
  round: number;
  reason: string;
  run_id: string;
  before: number;
  after: number | null;
  remaining_unmet: number;
  eta: string;
  travel_hours: number;
  tier?: number;
  messages: Message[];
  lines: {
    batch_id?: string;
    quantity: number;
    expires_at?: string;
    lot?: string;
  }[];
};
export type Incident = {
  id: string;
  supply_id: string;
  facilities: string[];
  status: string;
  center: { lat: number; lng: number };
  radius_km: number;
  label: string;
  evidence: {
    facility_id: string;
    supply_id: string;
    evidence: {
      score: number;
      quantity: number;
      baseline: number;
      date: string;
    }[];
  }[];
};
export type Event = {
  id: number;
  type: string;
  at: string;
  details: Record<string, unknown>;
  facilities: string[];
  run_id: string | null;
  entity_id: string | null;
};
export type Job = {
  id: string;
  status: string;
  error?: string;
  created_at: string;
};
export type Evaluation = {
  model: string;
  horizon: number;
  holdout_offset: number;
  mae: number;
  wape: number | null;
  observations: number;
};
export type Report = {
  id: string;
  facility_id: string;
  category: string;
  status: string;
  note: string;
  onset_at: string;
};
export type Snapshot = {
  actor: string;
  demo: {
    generation: string;
    as_of: string;
    day: number;
    seed: number;
    revision: number;
    phase: string;
    latest_run: string | null;
  };
  facilities: Facility[];
  supplies: Supply[];
  inventory: Batch[];
  risks: Risk[];
  forecasts: Forecast[];
  incidents: Incident[];
  reports: Report[];
  negotiations: Negotiation[];
  transfers: Negotiation[];
  jobs: Job[];
  events: Event[];
  replenishments: {
    id: string;
    supply_id: string;
    quantity: number;
    arrives_at: string;
    confirmed: boolean;
  }[];
  movements: {
    id: string;
    kind: string;
    quantity: number;
    batch_id: string;
    at: string;
    reason: string;
  }[];
  run: {
    id: string;
    evaluation: {
      evaluation: Evaluation[];
      selected: string;
      error: string | null;
    };
  } | null;
  allocation: {
    risks?: Record<string, Risk>;
    searches?: Record<
      string,
      {
        facility_id: string;
        supply_id: string;
        kind: string;
        reason: string;
        shortage_units: number;
        unused_expiring_units: number;
      }
    >;
    rejected: { facility_id: string; supply_id: string; reason: string }[];
    deficits: {
      facility_id: string;
      supply_id: string;
      unmet: number;
      action: string;
    }[];
  } | null;
  reconciliation: Record<string, unknown> | null;
};
