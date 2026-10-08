import { useEffect, useState } from "react";
import CareMascot from "./CareMascot";
import type { Snapshot } from "../lib/types";
export type ImportProgress = {
  busy: boolean;
  imported: boolean;
  error: string;
  records: number;
};
export default function DashboardPip({
  data,
  tab,
  progress,
  usageGuidance,
  inventoryGuidance,
}: {
  data: Snapshot;
  tab: string;
  progress: ImportProgress;
  usageGuidance?: { title: string; text: string };
  inventoryGuidance?: { title: string; text: string };
}) {
  const [mapVisible, setMapVisible] = useState(false);
  useEffect(() => {
    setMapVisible(false);
    const section = document.querySelector(".nearby-hospitals");
    if (tab !== "Onboarding" || !section) return;
    const observer = new IntersectionObserver(
      ([entry]) => setMapVisible(entry.isIntersecting),
      { threshold: 0, rootMargin: "0px 0px -50% 0px" },
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, [tab]);
  let guidance = {
    title: "Let’s connect your hospital.",
    text: "Choose or drop your hospital CSV, then press Import hospital. I’ll help you follow the upload, validation, and inventory setup.",
  };
  if (tab === "Onboarding") {
    if (progress.busy)
      guidance = {
        title: "Your file is being connected.",
        text: "Your CSV import is in progress. We’re connecting your hospital profile, inventory batches, past usage, and scheduled deliveries. I’ll show confirmation when it’s ready.",
      };
    else if (mapVisible) {
      const labels = {
        high: "red — high shortage risk",
        moderate: "yellow — moderate risk",
        adequate: "green — adequate stock",
        unknown: "grey — awaiting a complete forecast",
      };
      guidance = {
        title: "Here’s your hospital network.",
        text:
          data.facilities
            .map(
              (f) =>
                `${f.name}: ${labels[data.network_status?.[f.id] || "unknown"]}.`,
            )
            .join(" ") +
          " Colours show the highest forecast risk across each hospital’s supplies.",
      };
    } else if (progress.error)
      guidance = {
        title: "The file needs attention.",
        text: "The import could not complete. Check the error shown in the upload card, correct your CSV, and try again. A rejected file is not a successful import.",
      };
    else if (progress.imported)
      guidance = {
        title: "Your inventory is connected!",
        text: `${progress.records.toLocaleString()} consumption records were imported with your inventory and scheduled deliveries. Open Inventory management to review stock, or scroll down to see nearby hospitals and their supply risks.`,
      };
  } else if (tab === "Inventory management")
    guidance = {
      title: "Manage your hospital’s stock.",
      text: "Review your batches and update quantities or expiry dates here. Saved changes affect stock-risk calculations. Refresh the operations console to follow analysis and any eligible donor search.",
    };
  else if (tab === "Past usage")
    guidance = {
      title: "Your history powers forecasts.",
      text: "These are the past consumption records connected to this hospital. They help the forecasting engine estimate future demand; they are not predictions themselves.",
    };
  else if (tab === "Approvals") {
    const pending = data.negotiations.filter(
      (n) => n.status === "Awaiting approvals",
    ).length;
    guidance = {
      title: "Review before supplies move.",
      text: `${pending} transfer proposal${pending === 1 ? " is" : "s are"} awaiting approvals. Review the quantities, batches, and negotiation evidence. Both hospitals must approve the same terms before stock can be reserved and delivered.`,
    };
  }
  if (tab === "Past usage" && usageGuidance) guidance = usageGuidance;
  if (tab === "Inventory management" && inventoryGuidance)
    guidance = inventoryGuidance;
  return <CareMascot context="dashboard" guidance={guidance} />;
}
