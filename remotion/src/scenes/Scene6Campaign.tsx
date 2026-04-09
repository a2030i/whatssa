import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";

export const Scene6Campaign = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const stepOp = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
  const panelSlide = spring({ frame, fps, config: { damping: 20 } });

  const progressWidth = interpolate(frame, [50, 100], [0, 100], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const statsOp = interpolate(frame, [70, 85], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", background: "linear-gradient(135deg, #0a1628, #132042)" }}>
      <div style={{ position: "absolute", top: 60, left: 80, opacity: stepOp, display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#25D366", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 700, fontSize: 18 }}>5</div>
        <span style={{ color: "white", fontSize: 24, fontWeight: 600 }}>Send Bulk Campaign via Approved Templates</span>
      </div>

      <div style={{
        transform: `translateY(${interpolate(panelSlide, [0, 1], [40, 0])}px)`,
        opacity: panelSlide,
        width: 750, padding: 40, borderRadius: 20,
        background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
      }}>
        <div style={{ fontSize: 22, fontWeight: 600, color: "white", marginBottom: 24 }}>Campaign: Eid Special Offer</div>

        <div style={{ display: "flex", gap: 24, marginBottom: 24 }}>
          {[
            { label: "Template", value: "eid_promotion" },
            { label: "Audience", value: "VIP Customers" },
            { label: "Recipients", value: "1,250" },
          ].map((item) => (
            <div key={item.label} style={{ flex: 1, background: "rgba(255,255,255,0.04)", borderRadius: 12, padding: "16px" }}>
              <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, marginBottom: 4 }}>{item.label}</div>
              <div style={{ color: "white", fontWeight: 600, fontSize: 18 }}>{item.value}</div>
            </div>
          ))}
        </div>

        {/* Progress */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 14 }}>Sending Progress</span>
            <span style={{ color: "#25D366", fontWeight: 600 }}>{Math.round(progressWidth)}%</span>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: "rgba(255,255,255,0.08)" }}>
            <div style={{ height: "100%", borderRadius: 4, width: `${progressWidth}%`, background: "linear-gradient(90deg, #25D366, #128C7E)", transition: "none" }} />
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: "flex", gap: 16, opacity: statsOp }}>
          {[
            { label: "Delivered", value: "1,180", color: "#25D366" },
            { label: "Read", value: "890", color: "#128C7E" },
            { label: "Failed", value: "12", color: "#ff6b6b" },
          ].map((s) => (
            <div key={s.label} style={{ flex: 1, textAlign: "center", padding: 12, borderRadius: 10, background: "rgba(255,255,255,0.03)" }}>
              <div style={{ color: s.color, fontSize: 28, fontWeight: 700 }}>{s.value}</div>
              <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};
