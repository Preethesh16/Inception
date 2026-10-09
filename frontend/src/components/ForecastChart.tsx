import { useTranslations } from "../i18n/Language";
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
export function ForecastChart({
  forecast,
  onExplain,
}: {
  forecast?: Forecast;
  onExplain?: (guidance: { title: string; text: string }) => void;
}) {
  const labels = useTranslations([
    "Daily interval (empirically widened)",
    "Observed",
    "Raw forecast",
    "Planning demand",
    "FORECAST START",
  ]);
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
  const points = [...history, ...future];
  const explain = (index: number) => {
    const point = points[index];
    if (!point) return;
    onExplain?.({
      title: `${point.date} · Daily demand`,
      text:
        "actual" in point
          ? `${point.actual === null ? "No observed consumption was recorded on this date; this history point was imputed." : `${point.actual} units were recorded as consumed on this date. This is observed history, used to estimate future demand.`}`
          : `The model predicts ${point.forecast.toFixed(1)} units. Planning demand is ${point.planning.toFixed(1)} units after supported incident adjustments. The shaded range is ${point.range[0].toFixed(1)}–${point.range[1].toFixed(1)} units of model uncertainty, not guaranteed limits.`,
    });
  };
  return (
    <>
      {onExplain && (
        <label className="forecast-day-control">
          Explore a day · use the graph or arrow keys
          <input
            type="range"
            min={0}
            max={points.length - 1}
            defaultValue={history.length}
            aria-label="Explore forecast day"
            onChange={(event) => explain(Number(event.target.value))}
          />
        </label>
      )}
      <div className="forecast-chart">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={points}
            onMouseMove={(state) => {
              if (state.activeTooltipIndex != null)
                explain(Number(state.activeTooltipIndex));
            }}
            onClick={(state) => {
              if (state.activeTooltipIndex != null)
                explain(Number(state.activeTooltipIndex));
            }}
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
              name={labels[0]}
            />
            <Line
              isAnimationActive={false}
              type="monotone"
              dataKey="actual"
              stroke="var(--forecast-history, #40576a)"
              strokeWidth={2}
              dot={false}
              name={labels[1]}
            />
            <Line
              isAnimationActive={false}
              type="monotone"
              dataKey="forecast"
              stroke="var(--forecast-model, #8b9fb3)"
              strokeWidth={2}
              dot={false}
              strokeDasharray="4 4"
              name={labels[2]}
            />
            <Line
              isAnimationActive={false}
              type="monotone"
              dataKey="planning"
              stroke="var(--forecast-planning, #13816e)"
              strokeWidth={2.5}
              dot={false}
              name={labels[3]}
            />
            <ReferenceLine
              x={future[0]?.date}
              stroke="#bac7cc"
              strokeDasharray="3 3"
              label={{
                value: labels[4],
                position: "insideTopRight",
                fontSize: 9,
                fill: "#82909c",
              }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}
