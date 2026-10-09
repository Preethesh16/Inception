import { zoneStyle, zoneName } from "../lib/planningZones";
import { useEffect, useState } from "react";
import {
  Circle,
  CircleMarker,
  MapContainer,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import type { Snapshot } from "../lib/types";
import "leaflet/dist/leaflet.css";
import { latLng } from "leaflet";

const levels = {
  adequate: { color: "#16846b", label: "Adequate stock" },
  moderate: { color: "#eab308", label: "Moderate risk" },
  high: { color: "#dc2626", label: "High shortage risk" },
  unknown: { color: "#89969c", label: "Awaiting forecast" },
};
function FitHospitals({ facilities, incidents }: { facilities: Snapshot["facilities"]; incidents: Snapshot["incidents"] }) {
  const map = useMap();
  const coordinates = facilities.map((f) => `${f.lat},${f.lng}`).join(";");
  const zoneBounds = JSON.stringify(incidents.map(zone => [zone.center.lat, zone.center.lng, zone.radius_km]));
  useEffect(() => {
    if (!coordinates) return;
    const points = coordinates
      .split(";")
      .map((p) => p.split(",").map(Number) as [number, number]);
    for (const [lat, lng, radius] of JSON.parse(zoneBounds) as number[][]) {
      const bounds = latLng(lat, lng).toBounds(radius * 2000);
      points.push([bounds.getSouth(), bounds.getWest()], [bounds.getNorth(), bounds.getEast()]);
    }
    map.fitBounds(points, { padding: [45, 45], maxZoom: 13 });
  }, [map, coordinates, zoneBounds]);
  return null;
}
export function NearbyHospitals({ data, onExplain }: { data: Snapshot; onExplain?: (guidance: { title: string; text: string }) => void }) {
  const [failed, setFailed] = useState(false);
  const status = (id: string) => levels[data.network_status?.[id] || "unknown"];
  const explainZone = (zone: Snapshot["incidents"][number]) => {
    const hospitals = zone.facilities.map(id => data.facilities.find(f => f.id === id)?.name || id).join(", ");
    onExplain?.({
      title: "Reported operational planning zone",
      text: `${hospitals}: ${zone.status}. The ${zone.radius_km} km radius is the backend's active planning boundary for ${zoneName(zone.supply_id)}. Hospitals inside it cannot donate this product automatically. Matching reports expand one shared zone across the reporting hospitals; the shading does not establish disease spread.`,
    });
  };
  return (
    <div className="nearby-hospitals">
      <div className="nearby-map">
        <MapContainer center={[12.32, 76.6]} zoom={10} scrollWheelZoom={false}>
          <FitHospitals facilities={data.facilities} incidents={data.incidents} />
          <TileLayer
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution={
              '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            }
            eventHandlers={{ tileerror: () => setFailed(true) }}
          />
          {data.incidents.map(zone => (
            <Circle key={zone.id} center={[zone.center.lat, zone.center.lng]} radius={zone.radius_km * 1000}
              pathOptions={{ color: zoneStyle(zone.supply_id).color, fillColor: zoneStyle(zone.supply_id).color, fillOpacity: 0.14, weight: 2, dashArray: zoneStyle(zone.supply_id).dash }}
              eventHandlers={{ click: () => explainZone(zone) }}>
              <Tooltip>{zone.status} · {zoneName(zone.supply_id)} · {zone.radius_km} km</Tooltip>
            </Circle>
          ))}
          {data.facilities.map((f) => (
            <CircleMarker
              key={f.id}
              center={[f.lat, f.lng]}
              radius={12}
              pathOptions={{
                color: "#fff",
                weight: 3,
                fillColor: status(f.id).color,
                fillOpacity: 1,
              }}
            >
              <Tooltip>
                <strong>{f.name}</strong>
                <br />
                {status(f.id).label}
              </Tooltip>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>
      {failed && (
        <p className="microcopy">
          Map tiles unavailable. Hospital locations and current statuses remain
          visible.
        </p>
      )}
      <div className="nearby-legend" aria-label="Hospital risk legend">
        {[...new Set(data.incidents.map(zone => zone.supply_id))].sort().map(id =>
          <span key={id}><i style={{ background: zoneStyle(id).color + "33", border: "2px dashed " + zoneStyle(id).color }} />{zoneName(id)} · planning zone</span>
        )}
        {Object.entries(levels).map(([key, value]) => (
          <span key={key}>
            <i style={{ background: value.color }} />
            {value.label}
          </span>
        ))}
      </div>
      {data.incidents.length > 0 && <div className="nearby-zone-list" aria-label="Active planning zones">
        {data.incidents.map(zone => <button type="button" key={zone.id} style={{ borderColor: zoneStyle(zone.supply_id).color, color: zoneStyle(zone.supply_id).color, background: zoneStyle(zone.supply_id).color + "0d" }} onClick={() => explainZone(zone)}>
          {zone.facilities.map(id => data.facilities.find(f => f.id === id)?.name || id).join(" + ")}
          {" · "}{zoneName(zone.supply_id)}{" · "}{zone.radius_km} km
        </button>)}
        <p className="microcopy">Reported planning boundaries, not confirmed disease spread. Select a zone for Pip’s explanation.</p>
      </div>}
      <div className="nearby-facilities">
        {data.facilities.map((f) => (
          <div key={f.id}>
            <strong>{f.name}</strong>
            <span>
              <i style={{ background: status(f.id).color }} />
              {status(f.id).label}
            </span>
          </div>
        ))}
      </div>
      <p className="microcopy">
        Each hospital shows its highest risk across supplies: red for a
        projected shortage before replenishment or within 48 hours; yellow for a
        later or stress-case shortage within 28 days. Grey means forecast data
        is incomplete.
      </p>
    </div>
  );
}
