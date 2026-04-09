import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";

export const Scene2Login = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const cardScale = spring({ frame, fps, config: { damping: 15, stiffness: 120 } });
  const stepOp = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });

  const cursorX = interpolate(frame, [40, 55], [400, 0], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
  const cursorY = interpolate(frame, [40, 55], [200, 85], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
  const cursorOp = interpolate(frame, [35, 40], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });

  const btnGlow = frame > 60 ? interpolate(frame, [60, 70], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" }) : 0;

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", background: "linear-gradient(135deg, #0a1628, #132042)" }}>
      {/* Step indicator */}
      <div style={{ position: "absolute", top: 60, left: 80, opacity: stepOp, display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#25D366", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 700, fontSize: 18 }}>1</div>
        <span style={{ color: "white", fontSize: 24, fontWeight: 600 }}>User Login</span>
      </div>

      {/* Login card */}
      <div style={{
        transform: `scale(${cardScale})`,
        width: 480, padding: 48, borderRadius: 20,
        background: "rgba(255,255,255,0.06)", backdropFilter: "none",
        border: "1px solid rgba(255,255,255,0.1)",
        display: "flex", flexDirection: "column", gap: 20,
      }}>
        <div style={{ fontSize: 28, fontWeight: 700, color: "white", textAlign: "center", marginBottom: 8 }}>Sign In</div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 14 }}>Email</span>
          <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: 10, padding: "12px 16px", color: "white", fontSize: 16 }}>admin@business.com</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 14 }}>Password</span>
          <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: 10, padding: "12px 16px", color: "white", fontSize: 16 }}>••••••••</div>
        </div>

        <div style={{
          background: btnGlow > 0 ? `linear-gradient(90deg, #25D366, #128C7E)` : "rgba(37,211,102,0.8)",
          borderRadius: 10, padding: "14px", textAlign: "center",
          color: "white", fontWeight: 600, fontSize: 18,
          boxShadow: btnGlow > 0 ? `0 0 ${btnGlow * 30}px rgba(37,211,102,0.4)` : "none",
        }}>
          Login →
        </div>
      </div>

      {/* Cursor */}
      <div style={{
        position: "absolute",
        left: `calc(50% + ${cursorX}px)`,
        top: `calc(50% + ${cursorY}px)`,
        opacity: cursorOp,
        width: 20, height: 20,
        borderLeft: "3px solid white",
        borderTop: "3px solid white",
        transform: "rotate(-45deg)",
      }} />
    </AbsoluteFill>
  );
};
