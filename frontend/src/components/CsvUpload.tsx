import { useRef, useState } from "react";
import {
  Check,
  Download,
  FileSpreadsheet,
  LoaderCircle,
  Upload,
} from "lucide-react";
import { Button } from "./ui";

type Props = {
  file?: File;
  busy: boolean;
  imported: boolean;
  records: number;
  templateUrl: string;
  onSelect: (file?: File) => void;
  onError: (message: string) => void;
  onImport: () => void;
};
export function CsvUpload({
  file,
  busy,
  imported,
  records,
  templateUrl,
  onSelect,
  onError,
  onImport,
}: Props) {
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const state = imported
    ? "complete"
    : busy
      ? "uploading"
      : file
        ? "ready"
        : "idle";
  function select(files: FileList | null) {
    setDragging(false);
    dragDepth.current = 0;
    if (busy || imported || !files?.length) return;
    if (files.length !== 1) {
      onError("Choose one hospital CSV at a time.");
      return;
    }
    const candidate = files[0];
    if (!candidate.name.toLowerCase().endsWith(".csv")) {
      onError("Please choose a .csv file.");
      return;
    }
    if (candidate.size > 2_000_000) {
      onError("The CSV must be 2 MB or smaller.");
      return;
    }
    onSelect(candidate);
  }
  return (
    <div
      className={`csv-upload is-${state} ${dragging ? "is-dragging" : ""}`}
      aria-busy={busy}
      onDragEnter={(event) => {
        event.preventDefault();
        if (!busy && !imported) {
          dragDepth.current++;
          setDragging(true);
        }
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = busy || imported ? "none" : "copy";
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        dragDepth.current--;
        if (dragDepth.current <= 0) setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        select(event.dataTransfer.files);
      }}
    >
      <div className="csv-upload-visual" aria-hidden="true">
        <div className="csv-paper paper-back">
          <FileSpreadsheet size={25} />
        </div>
        <div className="csv-paper paper-front">
          <FileSpreadsheet size={25} />
          <span>CSV</span>
        </div>
        <div className="csv-folder-back" />
        <div className="csv-folder-front">
          <span>{imported ? <Check size={26} /> : <Upload size={24} />}</span>
        </div>
        {imported && (
          <span className="csv-success-badge">
            <Check size={15} />
          </span>
        )}
      </div>
      <div className="csv-upload-copy" role="status" aria-live="polite">
        <h3>
          {imported
            ? "Import successful"
            : busy
              ? "Uploading & validating"
              : dragging
                ? "Drop your hospital CSV here"
                : file
                  ? "Ready to import"
                  : "Upload your hospital CSV"}
        </h3>
        <p>
          {imported
            ? `${records.toLocaleString()} consumption records connected to your hospital.`
            : busy
              ? "Checking your file and saving validated hospital records…"
              : file
                ? file.name
                : "Drag and drop your file here, or choose a file below."}
        </p>
      </div>
      {busy && (
        <div className="csv-upload-progress" aria-label="Import in progress">
          <span />
        </div>
      )}
      {!imported && (
        <div className="csv-upload-actions">
          <label className={`csv-file-picker ${busy ? "is-disabled" : ""}`}>
            <FileSpreadsheet size={16} />
            {file ? "Change CSV" : "Choose CSV"}
            <input
              type="file"
              aria-label="Hospital CSV"
              accept=".csv,text/csv"
              disabled={busy}
              onChange={(event) => {
                select(event.target.files);
                event.target.value = "";
              }}
            />
          </label>
          {file && (
            <Button disabled={busy} onClick={onImport}>
              {busy ? (
                <LoaderCircle className="csv-spinner" size={16} />
              ) : (
                <Upload size={16} />
              )}{" "}
              {busy ? "Validating…" : "Import hospital"}
            </Button>
          )}
        </div>
      )}
      <div className="csv-upload-footer">
        <span>
          {imported
            ? "Inventory, usage history & replenishments"
            : "CSV only · up to 2 MB · one hospital per file"}
        </span>
        {!busy && !imported && (
          <a href={templateUrl}>
            <Download size={14} />
            Download hospital CSV
          </a>
        )}
      </div>
    </div>
  );
}
