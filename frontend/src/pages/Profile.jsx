import { useState } from "react";
import PageHeader from "../components/PageHeader";
import { useProfile } from "../context/ProfileContext";
import ActivityLocations from "../components/ActivityLocations";

export default function Profile() {
  const { profile, updateProfile } = useProfile();
  const [editing, setEditing] = useState(false);

  // Derived BMI
  const bmi = (profile.weight / Math.pow(profile.height / 100, 2)).toFixed(1);

  const toggleCondition = (condition) => {
    const isSelected = profile.healthConditions.includes(condition);
    const newConditions = isSelected 
      ? profile.healthConditions.filter(c => c !== condition)
      : [...profile.healthConditions, condition];
    updateProfile({ healthConditions: newConditions });
  };

  const ALL_CONDITIONS = ["Asthma", "Heart disease", "Diabetes", "COPD", "Pregnant", "Allergies"];

  return (
    <div className="admin-main" style={{ maxWidth: "800px", margin: "0 auto", paddingBottom: "40px" }}>
        
        {/* Header Profile Card */}
        <div className="glass animate-slide-up" style={{ 
          borderRadius: 20, padding: 24, marginBottom: 20, 
          display: "flex", alignItems: "center", gap: 20,
          background: "rgba(255,255,255,0.03)"
        }}>
          <div style={{
            width: 70, height: 70, borderRadius: "50%", background: "var(--blue)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 24, fontWeight: 700, color: "white", boxShadow: "0 0 20px rgba(79,142,247,0.3)"
          }}>
            RK
          </div>
          <div>
            <h1 style={{ margin: "0 0 6px 0", fontSize: 24, fontWeight: 800 }}>{profile.name}</h1>
            <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 10 }}>Member since {profile.memberSince}</div>
            <div style={{ display: "flex", gap: 10 }}>
              <span style={{ padding: "4px 10px", borderRadius: 12, fontSize: 11, fontWeight: 700, background: "rgba(239, 68, 68, 0.15)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.3)" }}>
                High risk profile
              </span>
              <span style={{ padding: "4px 10px", borderRadius: 12, fontSize: 11, fontWeight: 700, background: "rgba(34, 197, 94, 0.15)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.3)" }}>
                Verified
              </span>
            </div>
          </div>
        </div>

        {/* Personal Info */}
        <div className="glass animate-slide-up" style={{ borderRadius: 16, marginBottom: 20, animationDelay: "50ms" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", fontSize: 13, fontWeight: 800, color: "var(--muted)", letterSpacing: "1px" }}>
            👤 PERSONAL INFO
          </div>
          <div style={{ padding: "10px 20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "14px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
              <span style={{ color: "var(--muted)", width: "150px" }}>Age</span>
              <div style={{ flex: 1, fontWeight: 600 }}>{profile.age} years</div>
              <span style={{ fontSize: 11, color: "#f97316", background: "rgba(249,115,22,0.1)", padding: "2px 8px", borderRadius: 8 }}>Risk multiplier</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "14px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
              <span style={{ color: "var(--muted)", width: "150px" }}>Gender</span>
              <div style={{ flex: 1, fontWeight: 600 }}>{profile.gender}</div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "14px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
              <span style={{ color: "var(--muted)", width: "150px" }}>Weight / height</span>
              <div style={{ flex: 1, fontWeight: 600 }}>{profile.weight} kg · {profile.height} cm (BMI {bmi})</div>
              <span style={{ fontSize: 11, color: "var(--purple)", background: "rgba(168,85,247,0.1)", padding: "2px 8px", borderRadius: 8 }}>Health tips</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "14px 0" }}>
              <span style={{ color: "var(--muted)", width: "150px" }}>Smoker</span>
              <div style={{ flex: 1, fontWeight: 600 }}>{profile.smoker ? "Yes" : "No"}</div>
            </div>
          </div>
        </div>

        {/* Health Conditions */}
        <div className="glass animate-slide-up" style={{ borderRadius: 16, marginBottom: 20, animationDelay: "100ms" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", fontSize: 13, fontWeight: 800, color: "var(--muted)", letterSpacing: "1px" }}>
            🩺 HEALTH CONDITIONS
          </div>
          <div style={{ padding: "20px" }}>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
              {ALL_CONDITIONS.map(cond => {
                const isSelected = profile.healthConditions.includes(cond);
                return (
                  <button key={cond} onClick={() => toggleCondition(cond)} style={{
                    padding: "10px 16px", borderRadius: 12, fontSize: 14, fontWeight: 500, cursor: "pointer",
                    background: isSelected ? "rgba(239, 68, 68, 0.1)" : "rgba(255,255,255,0.05)",
                    color: isSelected ? "#ef4444" : "var(--muted)",
                    border: isSelected ? "1px solid rgba(239, 68, 68, 0.5)" : "1px solid var(--border)",
                    transition: "all 0.2s"
                  }}>
                    {isSelected ? "✅ " : "◻️ "} {cond}
                  </button>
                );
              })}
            </div>

            {/* Threshold Bar */}
            <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 16, padding: "20px", border: "1px solid rgba(255,255,255,0.05)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 13, color: "var(--muted)" }}>Personal AQI threshold</div>
                  <div style={{ fontSize: 36, fontWeight: 900, color: "#ef4444", lineHeight: 1.2 }}>{profile.aqiThreshold}</div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>Alert fires above this (normal: 150)</div>
                </div>
                <div style={{ flex: 1, maxWidth: "300px", marginTop: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 6, color: "var(--muted)" }}>
                    <span>Safe</span>
                    <span>Moderate</span>
                    <span>Dangerous</span>
                  </div>
                  <div style={{ position: "relative", height: 6, borderRadius: 3, background: "linear-gradient(90deg, #22c55e, #f59e0b, #ef4444)" }}>
                    <div style={{ 
                      position: "absolute", left: `${(profile.aqiThreshold / 300) * 100}%`, top: -4, 
                      width: 4, height: 14, background: "white", borderRadius: 2, boxShadow: "0 0 4px rgba(0,0,0,0.5)" 
                    }} />
                  </div>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 8 }}>Threshold lowered due to asthma + heart disease</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Locations */}
        <div className="glass animate-slide-up" style={{ borderRadius: 16, marginBottom: 20, animationDelay: "150ms" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", fontSize: 13, fontWeight: 800, color: "var(--muted)", letterSpacing: "1px" }}>
            📍 LOCATIONS
          </div>
          <div style={{ padding: "20px" }}>
            <ActivityLocations />
          </div>
        </div>

        {/* Automated Features */}
        <div className="glass animate-slide-up" style={{ borderRadius: 16, animationDelay: "200ms" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", fontSize: 13, fontWeight: 800, color: "var(--muted)", letterSpacing: "1px" }}>
            ⚡ WHAT THIS PROFILE POWERS AUTOMATICALLY
          </div>
          <div style={{ padding: "20px" }}>
            {[
              { icon: "🔔", title: "Smart alerts", desc: `fires at AQI ${profile.aqiThreshold} instead of default 150 because of asthma + heart conditions. Alert says "dangerous for your profile" not just "moderate".` },
              { icon: "🗺️", title: "Safe route planner", desc: "automatically uses current GPS location as start point, office as destination. No need to type anything." },
              { icon: "🤖", title: "Gemini chatbot context", desc: "chatbot already knows \"34M, asthma, heart disease\" and gives personalised advice without the user having to explain their situation." },
              { icon: "⏱️", title: "Activity scheduler", desc: "checks AQI during 6–7am walk slot automatically each morning. Sends \"safe to walk today\" or \"postpone — AQI too high for asthma\"." },
              { icon: "📊", title: "Daily report card", desc: "pre-filled with home location. Shows personalised risk score for the day, not just raw AQI numbers." },
              { icon: "⏳", title: "Exposure history", desc: "tracks cumulative daily pollution exposure over weeks. Shows \"you were exposed to unhealthy air for 4.2 hrs today\"." }
            ].map((feature, i) => (
              <div key={i} style={{ display: "flex", gap: 16, marginBottom: i !== 5 ? 20 : 0, paddingBottom: i !== 5 ? 20 : 0, borderBottom: i !== 5 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
                <div style={{ fontSize: 20 }}>{feature.icon}</div>
                <div style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.6 }}>
                  <strong style={{ color: "var(--text)" }}>{feature.title}</strong> — {feature.desc}
                </div>
              </div>
            ))}
          </div>
        </div>

    </div>
  );
}
