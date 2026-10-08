import {
  ReactFlow,
  Background,
  MarkerType,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { Snapshot } from "../lib/types";
const stages = [
  ["INGEST", "Incoming evidence", "ANALYSIS_STARTED"],
  ["FORECAST", "Demand forecast", "FORECAST_COMPLETED"],
  ["RISK", "Stock & expiry risk", "RISK_UPDATED"],
  ["ALLOCATE", "Safe redistribution", "ALLOCATION_CREATED"],
  ["APPROVE", "Hospital agreement", "APPROVAL_RECORDED"],
  ["DELIVER", "Transfer & receipt", "RECEIVED"],
];
export function Workflow({ data }: { data: Snapshot }) {
  const active = data.jobs.findLast(
    (j) => j.status === "running" || j.status === "queued",
  );
  const run = active?.id || data.demo.latest_run;
  const events = data.events.filter(
    (e) =>
      e.run_id === run ||
      (e.type === "REPORT_SUBMITTED" &&
        e.at >= (data.jobs.find((j) => j.id === run)?.created_at || "")),
  );
  const nodes: Node[] = stages.map(([id, label, event], i) => {
    const done = events.some((e) => e.type === event);
    return {
      id,
      position: { x: (i % 3) * 255, y: Math.floor(i / 3) * 150 },
      data: {
        label: (
          <div className="flow-node">
            <small>
              {String(i + 1).padStart(2, "0")} / {id}
            </small>
            <strong>{label}</strong>
            <span className={done ? "flow-complete" : ""}>
              {done
                ? "✓ Completed"
                : id === "FORECAST" && active
                  ? "● Processing"
                  : "○ Waiting"}
            </span>
          </div>
        ),
      },
      style: {
        border: done ? "1px solid #98cebd" : "1px solid #dce3e7",
        background: done ? "#f1faf6" : "white",
        borderRadius: 12,
        width: 210,
        padding: 0,
      },
    };
  });
  const edges: Edge[] = stages.slice(1).map((s, i) => ({
    id: "e" + i,
    source: stages[i][0],
    target: s[0],
    type: "smoothstep",
    animated: !!active && i === 0,
    style: { stroke: "#86a89e", strokeWidth: 1.5 },
    markerEnd: { type: MarkerType.ArrowClosed, color: "#86a89e" },
  }));
  return (
    <div className="workflow">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        nodesDraggable={false}
        nodesConnectable={false}
        zoomOnScroll={false}
        proOptions={{ hideAttribution: false }}
      >
        <Background color="#d9e3de" gap={20} />
      </ReactFlow>
    </div>
  );
}
