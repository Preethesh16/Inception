import { useEffect, useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, LockKeyhole } from "lucide-react";
import type { Snapshot } from "../lib/types";
import type { UsageGuidance } from "./UsageExplorer";
const fmt = (n: number) => n.toLocaleString();
const time = (at: string) =>
  new Date(at).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
export function AuditExplorer({
  data,
  onExplain,
}: {
  data: Snapshot;
  onExplain: (value: UsageGuidance) => void;
}) {
  const [product, setProduct] = useState("");
  const [selectedId, setSelectedId] = useState<string>();
  const supplyId = product || data.supplies[0]?.id;
  const supply = data.supplies.find((s) => s.id === supplyId);
  const unit = supply?.unit || "unit";
  const movements = useMemo(
    () =>
      data.movements
        .filter(
          (m) =>
            (m.supply_id ||
              data.inventory.find((b) => b.id === m.batch_id)?.supply_id) ===
            supplyId,
        )
        .slice()
        .sort(
          (a, b) =>
            b.at.localeCompare(a.at) ||
            (b.recorded_at || "").localeCompare(a.recorded_at || ""),
        ),
    [data.movements, data.inventory, supplyId],
  );
  const selected = movements.find((m) => m.id === selectedId) || movements[0];
  useEffect(() => {
    if (!selected) {
      onExplain({
        title: "No movements in this view.",
        text: `There are no matching ${supply?.name || "product"} events. Choose another product. Events appear when stock is imported, adjusted, reserved, dispatched, or received.`,
      });
      return;
    }
    const effect =
      selected.quantity > 0
        ? `${fmt(selected.quantity)} ${unit} were added to on-hand inventory.`
        : selected.quantity < 0
          ? `${fmt(-selected.quantity)} ${unit} left on-hand inventory.`
          : selected.kind === "reservation"
            ? "Stock was reserved for a transfer. On-hand stock did not change, but available stock decreased."
            : selected.kind === "release"
              ? "A reservation was released. On-hand stock did not change, but those units became available again."
              : "This event did not change on-hand quantity.";
    onExplain({
      title: `${selected.kind.replaceAll("_", " ")} · ${supply?.name || supplyId}`,
      text: `${time(selected.at)}: ${effect} Batch ${selected.batch_id}. Recorded reason: ${selected.reason}. These are ledger events, not forecast consumption.`,
    });
  }, [selected, supply, supplyId, unit, onExplain]);
  return (
    <div className="audit-explorer">
      <div className="usage-controls">
        <label>
          Product
          <select
            aria-label="Audit product"
            value={supplyId || ""}
            onChange={(e) => {
              setProduct(e.target.value);
              setSelectedId(undefined);
            }}
          >
            {data.supplies.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <span className="audit-hint">Tap a stop. Pip tells the story.</span>
      </div>
      <div
        className="audit-timeline"
        role="group"
        aria-label="Inventory movement timeline"
      >
        {movements.map((m) => (
          <button
            key={m.id}
            className={`audit-event ${m.quantity > 0 ? "stock-in" : m.quantity < 0 ? "stock-out" : "stock-held"}`}
            aria-pressed={selected?.id === m.id}
            aria-label={`${m.kind} · ${m.batch_id} · ${fmt(m.quantity)} ${unit} · ${time(m.at)}`}
            onClick={() => setSelectedId(m.id)}
            onFocus={() => setSelectedId(m.id)}
          >
            <span className="audit-event-icon">
              {m.quantity > 0 ? (
                <ArrowDownLeft />
              ) : m.quantity < 0 ? (
                <ArrowUpRight />
              ) : (
                <LockKeyhole />
              )}
            </span>
            <strong>{m.kind.replaceAll("_", " ")}</strong>
            <b>
              {m.quantity > 0 ? "+" : ""}
              {fmt(m.quantity)} {unit}
            </b>
            <time>{time(m.at)}</time>
          </button>
        ))}
        {!movements.length && <p>No matching movements yet.</p>}
      </div>
    </div>
  );
}
