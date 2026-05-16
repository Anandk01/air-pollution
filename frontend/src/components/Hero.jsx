const AQI_STATS = [
  {
    id: "stat-aqi",
    value: "AQI 142",
    label: "Current Index",
    sublabel: "Moderate Risk",
    color: "#f59e0b",
    glow: "rgba(245,158,11,0.25)",
    icon: "⏱️",
  },
  {
    id: "stat-pm25",
    value: "35.2 µg/m³",
    label: "PM2.5",
    sublabel: "Fine Particles",
    color: "#4f8ef7",
    glow: "rgba(79,142,247,0.25)",
    icon: "🔵",
  },
  {
    id: "stat-pm10",
    value: "68.7 µg/m³",
    label: "PM10",
    sublabel: "Coarse Particles",
    color: "#a855f7",
    glow: "rgba(168,85,247,0.25)",
    icon: "🌫️",
  },
  {
    id: "stat-no2",
    value: "0.04 ppm",
    label: "NO₂",
    sublabel: "Nitrogen Dioxide",
    color: "#22c55e",
    glow: "rgba(34,197,94,0.25)",
    icon: "🍃",
  },
];

const FEATURES = [
  {
    id: "feat-ml",
    title: "ML-Powered Forecasts",
    desc: "Advanced machine learning models trained on historical pollution data to deliver 7-day AQI predictions with high accuracy.",
    icon: "🤖",
    color: "#00d4ff",
  },
  {
    id: "feat-realtime",
    title: "Real-Time Monitoring",
    desc: "Live data ingestion from sensor networks and satellite sources, updated every 15 minutes for actionable insights.",
    icon: "📡",
    color: "#4f8ef7",
  },
  {
    id: "feat-health",
    title: "Health Alerts",
    desc: "Personalized notifications and recommendations based on your location and sensitivity profile to keep you safe.",
    icon: "🛡️",
    color: "#a855f7",
  },
  {
    id: "feat-geo",
    title: "Geospatial Heatmaps",
    desc: "Interactive pollution maps visualizing concentration gradients across regions, cities, and micro-zones.",
    icon: "🗺️",
    color: "#22c55e",
  },
  {
    id: "feat-report",
    title: "Smart Reports",
    desc: "Auto-generated PDF/CSV reports with trend analysis and regulatory compliance summaries.",
    icon: "📊",
    color: "#f59e0b",
  },
  {
    id: "feat-api",
    title: "Open API Access",
    desc: "RESTful API endpoints for seamless integration with third-party platforms and environmental dashboards.",
    icon: "⚡",
    color: "#ef4444",
  },
];

function StatCard({ stat, delay }) {
  return (
    <div
      id={stat.id}
      className="animate-slide-up"
      style={{
        animationDelay: `${delay}ms`,
        background: "rgba(255,255,255,0.05)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        border: `1px solid ${stat.color}33`,
        borderRadius: 16,
        padding: "20px",
        display: "flex",
        alignItems: "center",
        gap: 16,
        boxShadow: `0 8px 32px ${stat.glow}`,
        transition: "transform 0.3s ease",
        cursor: "default",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.04)")}
      onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 12,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          fontSize: 22,
          background: `${stat.color}18`,
          border: `1px solid ${stat.color}30`,
        }}
      >
        {stat.icon}
      </div>
      <div>
        <div style={{ fontSize: 20, fontWeight: 700, color: stat.color }}>
          {stat.value}
        </div>
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "var(--color-text-primary)",
          }}
        >
          {stat.label}
        </div>
        <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
          {stat.sublabel}
        </div>
      </div>
    </div>
  );
}

function FeatureCard({ feat, delay }) {
  return (
    <div
      id={feat.id}
      className="animate-slide-up"
      style={{
        animationDelay: `${delay}ms`,
        background: "rgba(255,255,255,0.04)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 20,
        padding: 24,
        transition: "all 0.3s ease",
        cursor: "default",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.border = `1px solid ${feat.color}44`;
        e.currentTarget.style.boxShadow = `0 16px 48px ${feat.color}18`;
        e.currentTarget.style.transform = "scale(1.03)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.border = "1px solid rgba(255,255,255,0.07)";
        e.currentTarget.style.boxShadow = "none";
        e.currentTarget.style.transform = "scale(1)";
      }}
    >
      <div
        style={{
          fontSize: 32,
          marginBottom: 16,
          width: 56,
          height: 56,
          borderRadius: 14,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: `${feat.color}18`,
        }}
      >
        {feat.icon}
      </div>
      <h3
        style={{
          fontSize: 17,
          fontWeight: 600,
          marginBottom: 10,
          color: "var(--color-text-primary)",
        }}
      >
        {feat.title}
      </h3>
      <p
        style={{
          fontSize: 14,
          lineHeight: 1.65,
          color: "var(--color-text-muted)",
        }}
      >
        {feat.desc}
      </p>
    </div>
  );
}

export default function Hero() {
  return (
    <section
      id="dashboard"
      className="mesh-bg"
      style={{
        position: "relative",
        width: "100%",
        minHeight: "100vh",
        paddingTop: 100,
        paddingBottom: 64,
        overflowX: "hidden",
      }}
    >
      {/* Decorative orbs */}
      <div
        className="animate-spin-slow"
        style={{
          position: "absolute",
          top: 80,
          left: "20%",
          width: 400,
          height: 400,
          borderRadius: "50%",
          background: "radial-gradient(circle, #00d4ff, transparent 70%)",
          filter: "blur(40px)",
          opacity: 0.08,
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: 128,
          right: "20%",
          width: 320,
          height: 320,
          borderRadius: "50%",
          background: "radial-gradient(circle, #a855f7, transparent 70%)",
          filter: "blur(40px)",
          opacity: 0.08,
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "relative",
          zIndex: 10,
          maxWidth: 1280,
          margin: "0 auto",
          padding: "0 24px",
        }}
      >
        {/* Badge */}
        <div
          style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}
        >
          <div
            id="hero-badge"
            className="animate-fade-in glass"
            style={{
              padding: "8px 16px",
              borderRadius: 999,
              display: "flex",
              alignItems: "center",
              gap: 8,
              border: "1px solid rgba(0,212,255,0.2)",
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "#22c55e",
                boxShadow: "0 0 8px #22c55e",
              }}
            />
            <span
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: "var(--color-accent-cyan)",
              }}
            >
              AI-Powered · Real-Time · Open Source
            </span>
          </div>
        </div>

        {/* Headline */}
        <div
          className="animate-slide-up"
          style={{ textAlign: "center", marginBottom: 24 }}
        >
          <h1
            style={{
              fontSize: "clamp(40px, 7vw, 80px)",
              fontWeight: 900,
              lineHeight: 1.1,
              marginBottom: 16,
            }}
          >
            <span className="gradient-text">Smart Air Pollution</span>
            <br />
            <span style={{ color: "var(--color-text-primary)" }}>
              Forecasting System
            </span>
          </h1>
          <p
            style={{
              fontSize: "clamp(16px, 2vw, 20px)",
              color: "var(--color-text-muted)",
              maxWidth: 600,
              margin: "0 auto",
              lineHeight: 1.7,
            }}
          >
            Harness the power of machine learning to predict air quality
            indices, visualize pollution patterns, and protect public health —
            one forecast at a time.
          </p>
        </div>

        {/* CTA Buttons */}
        <div
          id="hero-cta-group"
          className="animate-slide-up"
          style={{
            display: "flex",
            justifyContent: "center",
            flexWrap: "wrap",
            gap: 16,
            marginBottom: 64,
            animationDelay: "200ms",
          }}
        >
          <button
            id="hero-btn-primary"
            style={{
              padding: "16px 32px",
              borderRadius: 16,
              fontSize: 16,
              fontWeight: 600,
              color: "#fff",
              border: "none",
              cursor: "pointer",
              background: "linear-gradient(135deg, #00d4ff, #4f8ef7)",
              boxShadow: "0 8px 32px rgba(0,212,255,0.3)",
              transition: "all 0.3s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "scale(1.05)";
              e.currentTarget.style.boxShadow =
                "0 12px 40px rgba(0,212,255,0.5)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "scale(1)";
              e.currentTarget.style.boxShadow =
                "0 8px 32px rgba(0,212,255,0.3)";
            }}
          >
            🚀 Explore Dashboard
          </button>
          <button
            id="hero-btn-secondary"
            className="glass"
            style={{
              padding: "16px 32px",
              borderRadius: 16,
              fontSize: 16,
              fontWeight: 600,
              color: "var(--color-text-primary)",
              border: "1px solid rgba(255,255,255,0.15)",
              cursor: "pointer",
              transition: "all 0.3s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.05)")}
            onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
          >
            📖 View API Docs
          </button>
        </div>

        {/* Stats Grid */}
        <div
          id="stats-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 16,
            marginBottom: 80,
          }}
        >
          {AQI_STATS.map((stat, i) => (
            <StatCard key={stat.id} stat={stat} delay={100 + i * 100} />
          ))}
        </div>

        {/* Section Divider */}
        <div
          id="forecast"
          style={{ textAlign: "center", marginBottom: 48 }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 12,
            }}
          >
            <div
              style={{
                height: 1,
                width: 64,
                background: "var(--color-accent-cyan)",
                opacity: 0.4,
              }}
            />
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                color: "var(--color-accent-cyan)",
              }}
            >
              Platform Features
            </span>
            <div
              style={{
                height: 1,
                width: 64,
                background: "var(--color-accent-cyan)",
                opacity: 0.4,
              }}
            />
          </div>
          <h2
            style={{
              fontSize: "clamp(28px, 4vw, 44px)",
              fontWeight: 700,
              color: "var(--color-text-primary)",
            }}
          >
            Everything You Need to{" "}
            <span className="gradient-text">Monitor & Predict</span>
          </h2>
        </div>

        {/* Features Grid */}
        <div
          id="features-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 20,
          }}
        >
          {FEATURES.map((feat, i) => (
            <FeatureCard key={feat.id} feat={feat} delay={100 + i * 80} />
          ))}
        </div>

        {/* CTA Banner */}
        <div
          id="cta-banner"
          style={{
            marginTop: 80,
            borderRadius: 28,
            padding: "64px 40px",
            textAlign: "center",
            background:
              "linear-gradient(135deg, rgba(0,212,255,0.08), rgba(168,85,247,0.08))",
            border: "1px solid rgba(0,212,255,0.15)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
          }}
        >
          <div
            className="animate-float"
            style={{ fontSize: 48, marginBottom: 16 }}
          >
            🌍
          </div>
          <h2
            style={{
              fontSize: "clamp(24px, 3.5vw, 36px)",
              fontWeight: 700,
              marginBottom: 12,
              color: "var(--color-text-primary)",
            }}
          >
            Start Monitoring Today
          </h2>
          <p
            style={{
              fontSize: 16,
              marginBottom: 32,
              maxWidth: 500,
              margin: "0 auto 32px",
              color: "var(--color-text-muted)",
              lineHeight: 1.7,
            }}
          >
            Join thousands of researchers, policymakers, and citizens using our
            platform to make data-driven decisions for cleaner air.
          </p>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "center",
              gap: 16,
            }}
          >
            <button
              id="cta-banner-btn"
              style={{
                padding: "16px 40px",
                borderRadius: 16,
                fontWeight: 600,
                color: "#fff",
                border: "none",
                cursor: "pointer",
                fontSize: 16,
                background:
                  "linear-gradient(135deg, #00d4ff, #4f8ef7, #a855f7)",
                boxShadow: "0 8px 32px rgba(0,212,255,0.35)",
                transition: "all 0.3s ease",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.transform = "scale(1.05)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.transform = "scale(1)")
              }
            >
              Get Free Access
            </button>
            <button
              className="glass"
              style={{
                padding: "16px 40px",
                borderRadius: 16,
                fontWeight: 600,
                fontSize: 16,
                color: "var(--color-text-primary)",
                border: "1px solid rgba(255,255,255,0.15)",
                cursor: "pointer",
                transition: "all 0.3s ease",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.transform = "scale(1.05)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.transform = "scale(1)")
              }
            >
              Schedule Demo
            </button>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer
        id="about"
        style={{
          marginTop: 80,
          borderTop: "1px solid rgba(255,255,255,0.06)",
          textAlign: "center",
          padding: "24px",
          color: "var(--color-text-muted)",
          fontSize: 14,
        }}
      >
        © 2026 Smart Air Pollution Forecasting System · Built with React +
        Flask
      </footer>
    </section>
  );
}
