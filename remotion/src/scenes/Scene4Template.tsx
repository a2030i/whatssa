import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";

export const Scene4Template = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const stepOp = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
  const cardSlide = spring({ frame, fps, config: { damping: 20 } });
  const previewSlide = spring({ frame: frame - 25, fps, config: { damping: 20 } });
  const sendPulse = spring({ frame: frame - 70, fps, config: { damping: 8 } });
  const sentOp = interpolate(frame, [85, 100], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", background: "linear-gradient(135deg, #0a1628, #132042)" }}>
      <div style={{ position: "absolute", top: 60, left: 80, opacity: stepOp, display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#25D366", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 700, fontSize: 18 }}>3</div>
        <span style={{ color: "white", fontSize: 24, fontWeight: 600 }}>Send Approved Template Message</span>
      </div>

      <div style={{ display: "flex", gap: 40, alignItems: "flex-start" }}>
        {/* Template selector */}
        <div style={{
          transform: `translateY(${interpolate(cardSlide, [0, 1], [40, 0])}px)`,
          opacity: cardSlide,
          width: 420, padding: 32, borderRadius: 16,
          background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
        }}>
          <div style={{ fontSize: 18, fontWeight: 600, color: "white", marginBottom: 16 }}>Select Template</div>
          {["order_confirmation", "shipping_update", "welcome_message"].map((t, i) => (
            <div key={t} style={{
              padding: "12px 16px", borderRadius: 10, marginBottom: 8,
              background: i === 0 ? "rgba(37,211,102,0.15)" : "rgba(255,255,255,0.03)",
              border: i === 0 ? "1px solid rgba(37,211,102,0.4)" : "1px solid rgba(255,255,255,0.05)",
              color: i === 0 ? "#25D366" : "rgba(255,255,255,0.6)",
              fontSize: 15, fontWeight: i === 0 ? 600 : 400,
            }}>
              {t}
              {i === 0 && <span style={{ marginLeft: 8, fontSize: 12, background: "#25D366", color: "white", padding: "2px 8px", borderRadius: 6 }}>APPROVED</span>}
            </div>
          ))}

          <div style={{
            marginTop: 16, padding: "12px", borderRadius: 10, textAlign: "center",
            background: sendPulse > 0 ? "#25D366" : "rgba(37,211,102,0.6)",
            color: "white", fontWeight: 600,
            transform: `scale(${sendPulse > 0 ? 0.95 + sendPulse * 0.05 : 1})`,
            boxShadow: sendPulse > 0 ? `0 0 ${sendPulse * 20}px rgba(37,211,102,0.3)` : "none",
          }}>
            Send Template
          </div>
        </div>

        {/* Phone preview */}
        <div style={{
          transform: `translateY(${interpolate(previewSlide, [0, 1], [60, 0])}px)`,
          opacity: previewSlide,
          width: 320, borderRadius: 28,
          background: "#e5ddd5",
          padding: 20, minHeight: 400,
          position: "relative",
          overflow: "hidden",
        }}>
          <div style={{ background: "#075e54", margin: "-20px -20px 20px", padding: "16px 20px", borderRadius: "28px 28px 0 0" }}>
            <span style={{ color: "white", fontWeight: 600 }}>+966 5x xxx xxxx</span>
          </div>

          {frame > 80 && (
            <div style={{
              opacity: sentOp,
              background: "#dcf8c6", borderRadius: "12px 12px 0 12px",
              padding: "12px 16px", maxWidth: 260,
              marginLeft: "auto", fontSize: 14, color: "#333",
            }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Order Confirmation</div>
              <div>Hi Ahmed! Your order #1234 has been confirmed. Thank you for shopping with us! 🛍️</div>
              <div style={{ fontSize: 11, color: "#999", textAlign: "right", marginTop: 4 }}>12:30 ✓✓</div>
            </div>
          )}
        </div>
      </div>
    </AbsoluteFill>
  );
};
