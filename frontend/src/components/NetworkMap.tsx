import { useState, useEffect } from "react";
import {
  MapContainer,
  TileLayer,
  Circle,
  CircleMarker,
  Polyline,
  Tooltip,
  useMap,
} from "react-leaflet";
import { Layers, MapPin } from "lucide-react";
import type { Snapshot } from "../lib/types";
import "leaflet/dist/leaflet.css";
function FitNetwork({ coordinates }: { coordinates: string }) {
  const map = useMap();
  useEffect(() => {
    const points = coordinates
      .split(";")
      .map((p) => p.split(",").map(Number) as [number, number]);
    map.fitBounds(points, { padding: [30, 30], animate: false });
  }, [map, coordinates]);
  return null;
}
export function NetworkMap({
  data,
  supply = "ORS",
  focus,
  onFacility,
}: {
  data: Snapshot;
  supply?: string;
  focus?: string;
  onFacility?: (id: string) => void;
}) {
  const [heat, setHeat] = useState(false);
  const [failed, setFailed] = useState(false);
  const key = import.meta.env.VITE_CARTO_KEY;
  const colors = (id: string) => {
    const r = data.risks.find(
      (r) => r.facility_id === id && r.supply_id === supply,
    );
    return r?.before_replenishment
      ? "#dc2626"
      : data.incidents.some(
            (i) => i.supply_id === supply && i.facilities.includes(id),
          )
        ? "#d97706"
        : r ||
            data.negotiations.some(
              (n) =>
                n.donor === id &&
                n.supply_id === supply &&
                ![
                  "Rejected",
                  "Cancelled",
                  "Needs re-evaluation",
                  "Expired",
                ].includes(n.status),
            )
          ? "#16846b"
          : "#8b969b";
  };
  return (
    <div className="network-map">
      <MapContainer
        center={[12.32, 76.6]}
        zoom={10}
        scrollWheelZoom={false}
        zoomControl={true}
      >
        <FitNetwork
          coordinates={data.facilities
            .map((f) => `${f.lat},${f.lng}`)
            .join(";")}
        />
        {key && !failed && (
          <TileLayer
            url={`https://basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}.png?key=${key}`}
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attribution">CARTO</a>'
            eventHandlers={{ tileerror: () => setFailed(true) }}
          />
        )}
        {data.incidents
          .filter((i) => i.supply_id === supply)
          .map((i) => (
            <Circle
              key={i.id}
              center={[i.center.lat, i.center.lng]}
              radius={i.radius_km * 1000}
              pathOptions={{
                color: "#dc2626",
                weight: 1.5,
                fillColor: "#ef4444",
                fillOpacity: 0.1,
                dashArray: "5 5",
              }}
            >
              <Tooltip>{i.status} · operational planning zone</Tooltip>
            </Circle>
          ))}
        {heat &&
          data.incidents
            .filter((i) => i.supply_id === supply)
            .flatMap((i) =>
              i.evidence.map((e) => {
                const f = data.facilities.find((f) => f.id === e.facility_id)!;
                return [1, 2, 3].map((r) => (
                  <Circle
                    key={e.facility_id + r}
                    center={[f.lat, f.lng]}
                    radius={r * 1000}
                    pathOptions={{
                      stroke: false,
                      fillColor: "#f97316",
                      fillOpacity: 0.13,
                    }}
                  />
                ));
              }),
            )}
        {data.negotiations
          .filter(
            (n) =>
              n.supply_id === supply &&
              !["Rejected", "Needs re-evaluation", "Cancelled"].includes(
                n.status,
              ),
          )
          .map((n) => {
            const a = data.facilities.find((f) => f.id === n.donor)!,
              b = data.facilities.find((f) => f.id === n.recipient)!;
            return (
              <Polyline
                key={n.id}
                positions={[
                  [a.lat, a.lng],
                  [b.lat, b.lng],
                ]}
                pathOptions={{
                  color: "#315a91",
                  weight: 2,
                  dashArray: "7 7",
                  opacity: 0.65,
                }}
              >
                <Tooltip>
                  {n.donor} → {n.recipient}: {n.quantity} units · {n.status}
                </Tooltip>
              </Polyline>
            );
          })}
        {data.facilities.map((f) => (
          <CircleMarker
            key={f.id}
            center={[f.lat, f.lng]}
            radius={focus === f.id ? 12 : 8}
            pathOptions={{
              color: "#fff",
              weight: 3,
              fillColor: colors(f.id),
              fillOpacity: 1,
            }}
            eventHandlers={{ click: () => onFacility?.(f.id) }}
          >
            <Tooltip
              permanent
              direction="right"
              offset={[12, 0]}
              className="facility-label"
            >
              <b>{f.id}</b> {f.area}
            </Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>
      <div className="map-top-label">
        <MapPin size={13} /> MYSURU REGIONAL NETWORK
      </div>
      <button
        className={`map-layer ${heat ? "active" : ""}`}
        onClick={() => setHeat(!heat)}
        title="Toggle observed demand intensity"
      >
        <Layers size={16} /> {heat ? "Demand intensity" : "Layers"}
      </button>
      {(!key || failed) && (
        <div className="map-offline">
          Geographic schematic ·{" "}
          {failed ? "tiles unavailable" : "CARTO key not configured"}
        </div>
      )}
      <div className="map-legend">
        <span>
          <i className="dot red" />
          At risk
        </span>
        <span>
          <i className="dot green" />
          Adequate / offered
        </span>
        <span className="route-legend">-- Proposed transfer</span>
      </div>
      {heat && (
        <div className="heat-note">
          Intensity = observed demand deviation, not infection probability
        </div>
      )}
    </div>
  );
}
