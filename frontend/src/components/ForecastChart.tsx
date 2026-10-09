import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";
import type { Forecast } from "../lib/types";
export function ForecastChart({ forecast }: { forecast?: Forecast }) {
  if (!forecast)
    return (
      <div className="chart-loading">
        Forecast will appear after the analysis completes.
      </div>
    );
  const history = forecast.history
    .slice(-14)
    .map((h) => ({
      date: h.date.slice(5, 10),
      actual: h.imputed ? null : h.quantity,
    }));
  const future = forecast.planning.map((p, i) => {
    const d = new Date(forecast.cutoff);
    d.setUTCDate(d.getUTCDate() + i);
    return {
      date: d.toISOString().slice(5, 10),
      forecast: forecast.p50[i],
      planning: p,
      range: [forecast.p10[i], forecast.p90[i]],
    };
  });
  return (
    <div className="forecast-chart">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={[...history, ...future]}
          margin={{ top: 12, right: 10, left: -20, bottom: 0 }}
        >
          <CartesianGrid vertical={false} stroke="#eef0f2" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: "#82909c" }}
            axisLine={false}
            tickLine={false}
            minTickGap={35}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "#82909c" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              borderRadius: 10,
              border: "1px solid #e2e8e8",
              fontSize: 12,
            }}
          />
          <Area
            isAnimationActive={false}
            type="monotone"
            dataKey="range"
            stroke="none"
            fill="var(--forecast-band, #dceae7)"
            fillOpacity={0.65}
            name="Daily interval (empirically widened)"
          />
          <Line
            isAnimationActive={false}
            type="monotone"
            dataKey="actual"
            stroke="var(--forecast-history, #40576a)"
            strokeWidth={2}
            dot={false}
            name="Observed"
          />
          <Line
            isAnimationActive={false}
            type="monotone"
            dataKey="forecast"
            stroke="var(--forecast-model, #8b9fb3)"
            strokeWidth={2}
            dot={false}
            strokeDasharray="4 4"
            name="Raw forecast"
          />
          <Line
            isAnimationActive={false}
            type="monotone"
            dataKey="planning"
            stroke="var(--forecast-planning, #13816e)"
            strokeWidth={2.5}
            dot={false}
            name="Planning demand"
          />
          <ReferenceLine
            x={future[0]?.date}
            stroke="#bac7cc"
            strokeDasharray="3 3"
            label={{
              value: "FORECAST START",
              position: "insideTopRight",
              fontSize: 9,
              fill: "#82909c",
            }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
