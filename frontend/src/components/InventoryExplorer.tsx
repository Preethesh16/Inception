import { useEffect, useState } from "react";
import { Clock3, Package, LockKeyhole } from "lucide-react";
import type { Batch, Snapshot } from "../lib/types";
import type { UsageGuidance } from "./UsageExplorer";
const groups = [
  { id: "expired", label: "Expired", color: "#dc2626" },
  { id: "week", label: "Within 7 days", color: "#dd8630" },
  { id: "month", label: "8–30 days", color: "#c5a13e" },
];
export function InventoryExplorer({
  data,
  busy,
  onEdit,
  onExplain,
}: {
  data: Snapshot;
  busy: boolean;
  onEdit: (batch: Batch) => void;
  onExplain: (value: UsageGuidance) => void;
}) {
  const [bucket, setBucket] = useState("all");
  const [product, setProduct] = useState("");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string>();
  const days = (b: Batch) =>
    (Date.parse(b.expires_at) - Date.parse(data.demo.as_of)) / 86400000;
  const group = (b: Batch) =>
    days(b) <= 0
      ? "expired"
      : days(b) <= 7
        ? "week"
        : days(b) <= 30
          ? "month"
          : "later";
  const name = (b: Batch) =>
    data.supplies.find((s) => s.id === b.supply_id)?.name || b.supply_id;
  const unit = (b: Batch) =>
    data.supplies.find((s) => s.id === b.supply_id)?.unit || "unit";
  const countdown = (b: Batch) =>
    days(b) <= 0
      ? "Expired"
      : days(b) < 1
        ? "Less than 1 day"
        : `${Math.ceil(days(b))} days left`;
  const near = data.inventory
    .filter((b) => b.quantity > 0 && group(b) !== "later")
    .sort((a, b) => a.expires_at.localeCompare(b.expires_at));
  const visibleNear = near.filter(
    (b) => bucket === "all" || group(b) === bucket,
  );
  const inventory = data.inventory
    .filter(
      (b) =>
        (!product || b.supply_id === product) &&
        `${name(b)} ${b.lot} ${b.id}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort((a, b) => a.expires_at.localeCompare(b.expires_at));
  const selected = data.inventory.find((b) => b.id === selectedId);
  useEffect(() => {
    if (selected) {
      const left =
        (Date.parse(selected.expires_at) - Date.parse(data.demo.as_of)) /
        86400000;
      const supply = data.supplies.find((s) => s.id === selected.supply_id);
      onExplain({
        title: `${supply?.name || selected.supply_id} · ${selected.lot}`,
        text: `${selected.quantity.toLocaleString()} ${supply?.unit || "unit"} on hand, with ${selected.reserved} reserved. ${left <= 0 ? "This batch has expired and is not usable." : `Expiry is in ${Math.ceil(left)} days on the scenario clock.`} ${selected.quarantined ? "This batch is quarantined and cannot be used." : ""} ${selected.reserved ? "Release its reservations before editing." : "Use Edit to update quantity or expiry with an audit reason."} Near expiry does not automatically mean waste; forecast consumption determines how much may remain unused.`,
      });
    } else
      onExplain({
        title: "Watch expiry before stock is wasted.",
        text: `${near.length} stocked batches expire within 30 days or have already expired. Tap an expiry card to inspect it, or use the inventory below to find and edit a batch. Expiry timing follows the scenario date; empty batches are excluded from the expiry watch.`,
      });
  }, [selected, data.demo.as_of, data.supplies, near.length, onExplain]);
  return (
    <>
      <section className="trio-card inventory-watch">
        <div className="inventory-workspace">
          <div className="inventory-section-title">
            <h2>Expiry watch</h2>
            <span>
              As of{" "}
              {new Date(data.demo.as_of).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                timeZone: "UTC",
              })}
            </span>
          </div>
          <div className="expiry-filters" aria-label="Expiry window">
            <button
              aria-pressed={bucket === "all"}
              onClick={() => setBucket("all")}
            >
              All upcoming <b>{near.length}</b>
            </button>
            {groups.map((g) => (
              <button
                key={g.id}
                aria-pressed={bucket === g.id}
                onClick={() => setBucket(g.id)}
              >
                <i style={{ background: g.color }} />
                {g.label}
                <b>{near.filter((b) => group(b) === g.id).length}</b>
              </button>
            ))}
          </div>
          <div className="expiry-shelf">
            {visibleNear.map((b) => (
              <button
                key={b.id}
                className={`expiry-tile expiry-${group(b)}`}
                aria-pressed={selectedId === b.id}
                onClick={() => setSelectedId(b.id)}
                onFocus={() => setSelectedId(b.id)}
              >
                <span className="expiry-clock">
                  <Clock3 size={18} />
                  {countdown(b)}
                </span>
                <Package className="expiry-package" size={32} />
                <strong>{name(b)}</strong>
                <span>
                  {b.quantity.toLocaleString()} {unit(b)} · {b.lot}
                </span>
                <small>
                  {b.quarantined
                    ? "Quarantined"
                    : b.reserved
                      ? `${b.reserved} reserved`
                      : "Tap to inspect"}
                </small>
              </button>
            ))}
            {!visibleNear.length && (
              <p className="microcopy">
                No stocked batches in this expiry window.
              </p>
            )}
          </div>
          {selected && (
            <div className="expiry-inspect">
              <span>
                <strong>{name(selected)}</strong> · {selected.lot} ·{" "}
                {countdown(selected)}
              </span>
              <button
                className="button button-outline"
                disabled={busy || !!selected.reserved}
                onClick={() => onEdit(selected)}
              >
                {selected.reserved
                  ? "Reserved — editing locked"
                  : "Manage selected batch"}
              </button>
            </div>
          )}
        </div>
      </section>
      <section className="trio-card">
        <div className="inventory-workspace">
          <div className="inventory-section-title">
            <h2>Your inventory</h2>
            <span>{inventory.length} batches · earliest expiry first</span>
          </div>
          <div className="inventory-filters">
            <label>
              Product
              <select
                aria-label="Inventory product"
                value={product}
                onChange={(e) => setProduct(e.target.value)}
              >
                <option value="">All products</option>
                {data.supplies.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Find a batch
              <input
                aria-label="Find inventory batch"
                placeholder="Search product, lot or batch…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
          </div>
          <div className="inventory-bar-charts">
            {data.supplies
              .filter((s) => inventory.some((b) => b.supply_id === s.id))
              .map((s) => {
                const batches = inventory.filter((b) => b.supply_id === s.id);
                const scale = Math.max(
                  1,
                  ...data.inventory
                    .filter((b) => b.supply_id === s.id)
                    .map((b) => b.quantity),
                );
                return (
                  <section
                    className="inventory-product-chart"
                    key={s.id}
                    aria-label={`${s.name} stock chart`}
                  >
                    <div className="stock-chart-heading">
                      <strong>{s.name}</strong>
                      <span>
                        0–{scale.toLocaleString()} {s.unit} per batch
                      </span>
                    </div>
                    {batches.map((b, index) => (
                      <div
                        key={b.id}
                        className={`inventory-bar-row ${selectedId === b.id ? "is-selected" : ""}`}
                      >
                        <button
                          className="stock-bar-select"
                          aria-label={`Inspect ${b.id}: ${b.quantity} ${s.unit}, ${countdown(b)}`}
                          aria-pressed={selectedId === b.id}
                          onClick={() => setSelectedId(b.id)}
                          onFocus={() => setSelectedId(b.id)}
                        >
                          <span className="stock-bar-label">
                            <span>{b.lot}</span>
                            <strong>
                              {b.quantity.toLocaleString()}{" "}
                              <small>{s.unit}</small>
                            </strong>
                          </span>
                          <span className="stock-bar-track">
                            <span
                              className={`stock-bar-fill expiry-${group(b)}`}
                              style={{
                                width: `${(b.quantity / scale) * 100}%`,
                                animationDelay: `${index * 90}ms`,
                              }}
                            >
                              {b.quantity > 0 && b.reserved > 0 && (
                                <span
                                  className="stock-bar-reserved"
                                  style={{
                                    width: `${Math.min(100, (b.reserved / b.quantity) * 100)}%`,
                                  }}
                                />
                              )}
                            </span>
                          </span>
                          <span className="stock-bar-meta">
                            <span
                              className={`inventory-expiry expiry-${group(b)}`}
                            >
                              {countdown(b)} ·{" "}
                              {new Date(b.expires_at).toLocaleDateString(
                                "en-IN",
                                {
                                  day: "numeric",
                                  month: "short",
                                  timeZone: "UTC",
                                },
                              )}
                            </span>
                            <span>
                              {b.quarantined
                                ? "Quarantined"
                                : group(b) === "expired"
                                  ? "Not usable"
                                  : `${Math.max(0, b.quantity - b.reserved).toLocaleString()} unreserved`}
                              {b.reserved ? ` · ${b.reserved} reserved` : ""}
                            </span>
                          </span>
                        </button>
                        <button
                          className="button button-outline button-sm stock-edit"
                          disabled={busy || !!b.reserved}
                          onClick={() => {
                            setSelectedId(b.id);
                            onEdit(b);
                          }}
                        >
                          {b.reserved ? <LockKeyhole size={14} /> : null}Edit{" "}
                          {b.id}
                        </button>
                      </div>
                    ))}
                  </section>
                );
              })}
            {!inventory.length && (
              <p className="microcopy">No matching inventory batches.</p>
            )}
            {inventory.length > 0 && (
              <div className="stock-bar-key">
                <span>Bar length = quantity, not demand coverage</span>
                <span>Colour = expiry only: amber within 30 days, red expired</span>
                <span>Striped portion = reserved</span>
                <span>Each product has its own scale</span>
              </div>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
