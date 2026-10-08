import { useEffect, useState } from "react";
import {
  CircleMarker,
  MapContainer,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import type { Snapshot } from "../lib/types";
import "leaflet/dist/leaflet.css";

const levels = {
  adequate: { color: "#16846b", label: "Adequate stock" },
  moderate: { color: "#eab308", label: "Moderate risk" },
  high: { color: "#dc2626", label: "High shortage risk" },
  unknown: { color: "#89969c", label: "Awaiting forecast" },
};
function FitHospitals({ facilities }: { facilities: Snapshot["facilities"] }) {
  const map = useMap();
  const coordinates = facilities.map((f) => `${f.lat},${f.lng}`).join(";");
  useEffect(() => {
    if (!coordinates) return;
    const points = coordinates
      .split(";")
      .map((p) => p.split(",").map(Number) as [number, number]);
    map.fitBounds(points, { padding: [65, 65], maxZoom: 13 });
  }, [map, coordinates]);
  return null;
}
export function NearbyHospitals({ data }: { data: Snapshot }) {
  const [failed, setFailed] = useState(false);
  const status = (id: string) => levels[data.network_status?.[id] || "unknown"];
  return (
    <div className="nearby-hospitals">
      <div className="nearby-map">
        <MapContainer center={[12.32, 76.6]} zoom={10} scrollWheelZoom={false}>
          <FitHospitals facilities={data.facilities} />
          <TileLayer
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution={
              '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            }
            eventHandlers={{ tileerror: () => setFailed(true) }}
          />
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
        {Object.entries(levels).map(([key, value]) => (
          <span key={key}>
            <i style={{ background: value.color }} />
            {value.label}
          </span>
        ))}
      </div>
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
