import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";

export const Scene7End = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoScale = spring({ frame, fps, config: { damping: 12 } });
  const titleOp = interpolate(frame, [15, 35], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const lineW = interpolate(frame, [30, 60], [0, 400], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const subOp = interpolate(frame, [40, 60], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", background: "linear-gradient(135deg, #0a1628, #0f1d36)" }}>
      <div style={{ transform: `scale(${logoScale})`, marginBottom: 24 }}>
        <svg width="80" height="80" viewBox="0 0 24 24" fill="#25D366">
          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
        </svg>
      </div>

      <div style={{ opacity: titleOp, fontSize: 48, fontWeight: 700, color: "white", textAlign: "center" }}>
        Respondly — Tech Provider
      </div>

      <div style={{ width: lineW, height: 3, background: "linear-gradient(90deg, #25D366, #128C7E)", borderRadius: 2, marginTop: 16, marginBottom: 16 }} />

      <div style={{ opacity: subOp, fontSize: 22, color: "rgba(255,255,255,0.6)", textAlign: "center", maxWidth: 600 }}>
        Empowering businesses with official WhatsApp Cloud API messaging
      </div>
    </AbsoluteFill>
  );
};
