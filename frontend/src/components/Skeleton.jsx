/** Skeleton shimmer placeholder components */

const shimmer = {
  background: "linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.09) 50%, rgba(255,255,255,0.04) 75%)",
  backgroundSize: "200% 100%",
  animation: "skeleton-shimmer 1.4s ease-in-out infinite",
  borderRadius: 8,
};

export function SkeletonCard() {
  return (
    <div className="glass" style={{ borderRadius: 20, padding: "22px 22px 18px" }}>
      <div style={{ ...shimmer, width: 44, height: 44, borderRadius: 12, marginBottom: 14 }} />
      <div style={{ ...shimmer, width: "55%", height: 28, marginBottom: 10 }} />
      <div style={{ ...shimmer, width: "70%", height: 12 }} />
      <style>{`
        @keyframes skeleton-shimmer {
          0%   { background-position: -200% 0; }
          100% { background-position:  200% 0; }
        }
      `}</style>
    </div>
  );
}

export function SkeletonChart({ height = 260 }) {
  return (
    <div className="glass" style={{ borderRadius: 20 }}>
      <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ ...shimmer, width: "40%", height: 16, marginBottom: 8 }} />
        <div style={{ ...shimmer, width: "28%", height: 11 }} />
      </div>
      <div style={{ padding: 20 }}>
        <div style={{ ...shimmer, width: "100%", height }} />
      </div>
      <style>{`
        @keyframes skeleton-shimmer {
          0%   { background-position: -200% 0; }
          100% { background-position:  200% 0; }
        }
      `}</style>
    </div>
  );
}

export function SkeletonRow({ width = "100%", height = 14, style = {} }) {
  return <div style={{ ...shimmer, width, height, ...style }} />;
}
