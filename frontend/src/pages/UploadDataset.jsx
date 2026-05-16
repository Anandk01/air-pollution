import { useState, useRef, useCallback } from "react";
import axios from "axios";
import PageHeader from "../components/PageHeader";
import { useToast } from "../context/ToastContext";

// ── Helpers ───────────────────────────────────────────────────────────────────

function Spinner({ label = "Processing…" }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12, padding: "28px 0" }}>
      <div style={{
        width: 32, height: 32, borderRadius: "50%",
        border: "3px solid rgba(79,142,247,0.2)",
        borderTopColor: "var(--blue)",
        animation: "spin 0.75s linear infinite",
      }} />
      <span style={{ fontSize: 14, color: "var(--muted)" }}>{label}</span>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Upload success card ───────────────────────────────────────────────────────
function UploadCard({ data }) {
  return (
    <div className="glass animate-slide-up" style={{
      borderRadius: 20, overflow: "hidden",
      border: "1px solid rgba(34,197,94,0.25)",
      boxShadow: "0 12px 40px rgba(34,197,94,0.10)",
    }}>
      <div style={{
        padding: "16px 22px", background: "rgba(34,197,94,0.08)",
        borderBottom: "1px solid rgba(34,197,94,0.15)",
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <span style={{ fontSize: 20 }}>✅</span>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#22c55e" }}>Upload Successful</div>
          <div style={{ fontSize: 11, color: "var(--muted)" }}>CSV parsed and validated</div>
        </div>
      </div>

      <div style={{ padding: "18px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 10 }}>
          {[
            { label: "Filename",   value: data.filename,              icon: "📄" },
            { label: "Total Rows", value: data.rows.toLocaleString(), icon: "📋" },
            { label: "Columns",    value: `${data.columns.length} fields`, icon: "🗂️" },
          ].map(item => (
            <div key={item.label} style={{
              background: "rgba(255,255,255,0.04)", borderRadius: 12,
              padding: "12px 14px", border: "1px solid var(--border)",
            }}>
              <div style={{ fontSize: 18, marginBottom: 6 }}>{item.icon}</div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 2 }}>{item.label}</div>
              <div style={{ fontSize: 13, fontWeight: 700, wordBreak: "break-all" }}>{item.value}</div>
            </div>
          ))}
        </div>

        {/* Column pills */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", letterSpacing: "0.06em",
            textTransform: "uppercase", marginBottom: 8 }}>Detected Columns</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {data.columns.map((col, i) => (
              <span key={i} style={{
                padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 500,
                background: "rgba(79,142,247,0.12)", border: "1px solid rgba(79,142,247,0.25)",
                color: "var(--blue)", fontFamily: "monospace",
              }}>{col}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Model training result card ─────────────────────────────────────────────────
function TrainCard({ data }) {
  const COLORS = ["#4f8ef7", "#a855f7", "#00d4ff", "#22c55e"];
  return (
    <div className="glass animate-slide-up" style={{
      borderRadius: 20, overflow: "hidden",
      border: "1px solid rgba(168,85,247,0.25)",
      boxShadow: "0 12px 40px rgba(168,85,247,0.10)",
      animationDelay: "80ms",
    }}>
      <div style={{
        padding: "16px 22px", background: "rgba(168,85,247,0.08)",
        borderBottom: "1px solid rgba(168,85,247,0.15)",
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <span style={{ fontSize: 20 }}>🤖</span>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#a855f7" }}>Model Trained Successfully</div>
          <div style={{ fontSize: 11, color: "var(--muted)" }}>
            Best model: <strong style={{ color: "#a855f7" }}>{data.best_model}</strong>
            {" "}· RMSE {data.best_rmse}
          </div>
        </div>
        {/* Best badge */}
        <span style={{
          marginLeft: "auto", fontSize: 11, fontWeight: 700,
          padding: "3px 10px", borderRadius: 999,
          background: "rgba(168,85,247,0.15)", color: "#a855f7",
          border: "1px solid rgba(168,85,247,0.35)", flexShrink: 0,
        }}>🏆 Auto-Trained</span>
      </div>

      <div style={{ padding: "18px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Top stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 10 }}>
          {[
            { label: "Train Rows",  value: data.train_rows?.toLocaleString() ?? "—", icon: "📊" },
            { label: "Test Rows",   value: data.test_rows?.toLocaleString()  ?? "—", icon: "🧪" },
            { label: "Best RMSE",   value: data.best_rmse,                            icon: "🎯" },
            { label: "Models Run",  value: data.metrics?.length ?? "—",               icon: "⚙️" },
          ].map(item => (
            <div key={item.label} style={{
              background: "rgba(255,255,255,0.04)", borderRadius: 12,
              padding: "12px 14px", border: "1px solid var(--border)",
            }}>
              <div style={{ fontSize: 18, marginBottom: 6 }}>{item.icon}</div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 2 }}>{item.label}</div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{item.value}</div>
            </div>
          ))}
        </div>

        {/* Per-model metrics table */}
        {data.metrics?.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", letterSpacing: "0.06em",
              textTransform: "uppercase", marginBottom: 10 }}>Model Comparison</div>
            {data.metrics.map((m, i) => (
              <div key={m.model} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "9px 12px", borderRadius: 10, marginBottom: 6,
                background: m.model === data.best_model
                  ? "rgba(168,85,247,0.08)" : "rgba(255,255,255,0.03)",
                border: m.model === data.best_model
                  ? "1px solid rgba(168,85,247,0.25)" : "1px solid var(--border)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {/* Color dot */}
                  <div style={{ width: 8, height: 8, borderRadius: "50%",
                    background: COLORS[i % COLORS.length], flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: m.model === data.best_model ? 700 : 400 }}>
                    {m.model}
                  </span>
                  {m.model === data.best_model && (
                    <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 999,
                      background: "rgba(168,85,247,0.15)", color: "#a855f7",
                      fontWeight: 700, border: "1px solid rgba(168,85,247,0.3)" }}>BEST</span>
                  )}
                </div>
                <div style={{ display: "flex", gap: 16, fontSize: 12 }}>
                  <span style={{ color: "var(--cyan)" }}>RMSE <strong>{m.rmse}</strong></span>
                  <span style={{ color: "var(--muted)" }}>MAE {m.mae}</span>
                  {m.r2 != null && <span style={{ color: "var(--muted)" }}>R² {m.r2}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Train error card ──────────────────────────────────────────────────────────
function TrainErrorCard({ message }) {
  return (
    <div className="glass animate-slide-up" style={{
      borderRadius: 16, padding: "16px 20px",
      border: "1px solid rgba(245,158,11,0.3)",
      background: "rgba(245,158,11,0.06)",
      animationDelay: "80ms",
      display: "flex", alignItems: "flex-start", gap: 12,
    }}>
      <span style={{ fontSize: 20, flexShrink: 0 }}>⚠️</span>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#f59e0b", marginBottom: 4 }}>
          Auto-training skipped
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.6 }}>
          {message}
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

const REQUIRED_COLS = ["timestamp","pm2_5","pm10","no2","so2","co","temperature","humidity","wind_speed"];
const MAX_MB        = 50;

export default function UploadDataset() {
  const [drag,       setDrag]      = useState(false);
  const [file,       setFile]      = useState(null);
  const [phase,      setPhase]     = useState(null);   // null | "uploading" | "training"
  const [uploadData, setUploadData]= useState(null);
  const [trainData,  setTrainData] = useState(null);
  const [trainErr,   setTrainErr]  = useState(null);
  const fileRef                    = useRef();
  const { addToast }               = useToast();

  const clearState = () => {
    setUploadData(null); setTrainData(null);
    setTrainErr(null);   setPhase(null);
  };

  const handleFile = useCallback((f) => {
    if (!f) return;
    if (f.size > MAX_MB * 1024 * 1024) {
      addToast(`File too large. Max ${MAX_MB} MB.`, "error");
      return;
    }
    clearState();
    setFile(f);
  }, [addToast]); // eslint-disable-line react-hooks/exhaustive-deps

  const onDrop = (e) => {
    e.preventDefault(); setDrag(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  // ── Upload → then auto-train ───────────────────────────────────────────────
  const upload = async () => {
    if (!file) { addToast("Please select a CSV file first.", "error"); return; }
    if (!file.name.toLowerCase().endsWith(".csv")) {
      addToast("Only .csv files are accepted.", "error"); return;
    }

    // — Step 1: Upload —
    setPhase("uploading");
    setUploadData(null); setTrainData(null); setTrainErr(null);

    const formData = new FormData();
    formData.append("file", file);

    let uploaded;
    try {
      const { data } = await axios.post("/api/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 60_000,
      });
      if (!data.success) {
        addToast(data.message || "Upload failed.", "error");
        setPhase(null); return;
      }
      uploaded = data;
      setUploadData(data);
      addToast(`"${data.filename}" uploaded — ${data.rows.toLocaleString()} rows.`, "success");
    } catch (err) {
      const msg = err.response?.data?.message
        ?? (err.code === "ECONNABORTED" ? "Request timed out." : "Server unreachable. Is Flask running?");
      addToast(msg, "error");
      setPhase(null); return;
    }

    // — Step 2: Auto-train —
    setPhase("training");
    try {
      const { data } = await axios.post("/api/train", {}, { timeout: 180_000 });
      if (data.success) {
        setTrainData(data);
        addToast(`Model trained ✓ — Best: ${data.best_model} (RMSE ${data.best_rmse})`, "success", 6000);
      } else {
        setTrainErr(data.message || "Training failed.");
        addToast(data.message || "Training failed.", "warning");
      }
    } catch (err) {
      const msg = err.response?.data?.message ?? "Training error. Dataset may not have required PM2.5 columns.";
      setTrainErr(msg);
      addToast(msg, "warning", 6000);
    } finally {
      setPhase(null);
    }
  };

  return (
    <div className="page-shell" style={{ background: "var(--bg-base)" }}>
      <div className="admin-main">
        <PageHeader
          title="Upload Dataset"
          subtitle="Upload a CSV file — the model will be automatically trained after upload"
        />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 24, alignItems: "start" }}
             className="upload-grid">

          {/* ── Left: Drop zone + results ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Drop zone */}
            <div
              onDragOver={e => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={onDrop}
              onClick={() => !phase && fileRef.current.click()}
              className="glass"
              style={{
                borderRadius: 20,
                border: `2px dashed ${drag ? "var(--cyan)" : file ? "rgba(79,142,247,0.4)" : "rgba(255,255,255,0.14)"}`,
                padding: "48px 40px", textAlign: "center",
                cursor: phase ? "not-allowed" : "pointer",
                transition: "all 0.25s ease",
                background: drag ? "rgba(0,212,255,0.04)" : file ? "rgba(79,142,247,0.04)" : undefined,
              }}
            >
              <input ref={fileRef} type="file" accept=".csv"
                style={{ display: "none" }}
                onChange={e => handleFile(e.target.files[0])} />

              {file ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                  <div style={{ fontSize: 48 }}>📄</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "var(--blue)" }}>{file.name}</div>
                  <div style={{ fontSize: 13, color: "var(--muted)" }}>
                    {(file.size / 1024).toFixed(1)} KB · CSV
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); setFile(null); clearState(); }}
                    style={{
                      marginTop: 4, fontSize: 12, padding: "5px 14px", borderRadius: 8,
                      background: "rgba(239,68,68,0.1)", color: "#ef4444",
                      border: "1px solid rgba(239,68,68,0.25)", cursor: "pointer",
                    }}
                  >✕ Remove file</button>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                  <div style={{ fontSize: 52 }}>📂</div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>Drag &amp; drop your CSV here</div>
                  <div style={{ fontSize: 13, color: "var(--muted)" }}>or click to browse · Max {MAX_MB} MB</div>
                  <button className="btn-secondary"
                    onClick={e => e.stopPropagation()}
                    style={{ marginTop: 6, pointerEvents: "none" }}>
                    Browse Files
                  </button>
                </div>
              )}
            </div>

            {/* Upload & Train button */}
            <button
              className="btn-primary"
              onClick={upload}
              disabled={!!phase || !file}
              style={{
                width: "100%", padding: "15px", fontSize: 15,
                opacity: phase || !file ? 0.6 : 1,
                cursor: phase || !file ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
              }}
            >
              {phase ? (
                <>
                  <div style={{
                    width: 18, height: 18, borderRadius: "50%",
                    border: "2px solid rgba(255,255,255,0.3)",
                    borderTopColor: "#fff",
                    animation: "spin 0.75s linear infinite", flexShrink: 0,
                  }} />
                  {phase === "uploading" ? "Uploading…" : "Training model…"}
                </>
              ) : "⬆ Upload & Train Model"}
            </button>

            {/* Phase status panels */}
            {phase === "uploading" && (
              <div className="glass" style={{ borderRadius: 16 }}>
                <Spinner label="Uploading & validating CSV…" />
              </div>
            )}
            {phase === "training" && (
              <div className="glass" style={{ borderRadius: 16 }}>
                <Spinner label="Training ML models — this may take 30–60 seconds…" />
              </div>
            )}

            {/* Upload result */}
            {uploadData && !phase && <UploadCard data={uploadData} />}

            {/* Train result */}
            {trainData && !phase && <TrainCard data={trainData} />}

            {/* Train skipped / error */}
            {trainErr && !phase && <TrainErrorCard message={trainErr} />}
          </div>

          {/* ── Right: Info sidebar ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Required columns */}
            <div className="glass" style={{ borderRadius: 16, padding: "20px" }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>📋 Required Columns</div>
              {REQUIRED_COLS.map(col => (
                <div key={col} style={{
                  display: "flex", alignItems: "center", gap: 8, fontSize: 13,
                  padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.05)",
                }}>
                  <span style={{ color: "#22c55e", fontSize: 12 }}>✓</span>
                  <code style={{ color: "var(--cyan)", fontFamily: "monospace", fontSize: 12 }}>{col}</code>
                </div>
              ))}
            </div>

            {/* How it works */}
            <div className="glass" style={{ borderRadius: 16, padding: "20px" }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>⚡ What happens on upload</div>
              {[
                ["1. Validate", "CSV is parsed and column names are checked"],
                ["2. Auto-Train", "Linear Regression, Random Forest & XGBoost are trained"],
                ["3. Save Model", "Best model saved to backend/models/best_model.pkl"],
                ["4. Ready", "Predict & Dashboard pages use the new model"],
              ].map(([step, desc]) => (
                <div key={step} style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                  <span style={{ color: "var(--blue)", fontWeight: 700, fontSize: 12, flexShrink: 0, minWidth: 80 }}>{step}</span>
                  <span style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>{desc}</span>
                </div>
              ))}
            </div>

            {/* Download template */}
            <div className="glass" style={{ borderRadius: 16, padding: "20px" }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>📥 Template</div>
              <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.6, marginBottom: 14 }}>
                Download a sample CSV with all required columns pre-filled.
              </div>
              <button
                className="btn-secondary"
                style={{ width: "100%", fontSize: 13 }}
                onClick={() => {
                  const header = REQUIRED_COLS.join(",");
                  const sample = "2024-01-01,35.2,68.4,40.1,20.3,0.8,28.5,65.0,12.3";
                  const blob   = new Blob([header + "\n" + sample], { type: "text/csv" });
                  const url    = URL.createObjectURL(blob);
                  const a      = document.createElement("a");
                  a.href = url; a.download = "air_quality_template.csv";
                  a.click(); URL.revokeObjectURL(url);
                }}
              >⬇ Download Template</button>
            </div>
          </div>
        </div>

        <style>{`
          @media (max-width: 860px) {
            .upload-grid { grid-template-columns: 1fr !important; }
          }
        `}</style>
      </div>
    </div>
  );
}
