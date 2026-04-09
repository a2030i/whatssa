import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";

export const Scene5Chat = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const stepOp = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
  const chatSlide = spring({ frame, fps, config: { damping: 20 } });

  const msg1Op = interpolate(frame, [20, 35], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
  const msg1Y = interpolate(spring({ frame: frame - 20, fps, config: { damping: 15 } }), [0, 1], [30, 0]);
  const msg2Op = interpolate(frame, [50, 65], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
  const msg2Y = interpolate(spring({ frame: frame - 50, fps, config: { damping: 15 } }), [0, 1], [30, 0]);
  const msg3Op = interpolate(frame, [80, 95], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
  const msg3Y = interpolate(spring({ frame: frame - 80, fps, config: { damping: 15 } }), [0, 1], [30, 0]);

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", background: "linear-gradient(135deg, #0a1628, #132042)" }}>
      <div style={{ position: "absolute", top: 60, left: 80, opacity: stepOp, display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#25D366", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 700, fontSize: 18 }}>4</div>
        <span style={{ color: "white", fontSize: 24, fontWeight: 600 }}>Receive & Reply to Customer Messages</span>
      </div>

      <div style={{
        transform: `scale(${chatSlide})`,
        width: 800, borderRadius: 20,
        background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
        overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{ background: "rgba(37,211,102,0.1)", padding: "16px 24px", display: "flex", alignItems: "center", gap: 12, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ width: 42, height: 42, borderRadius: "50%", background: "#25D366", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 700 }}>A</div>
          <div>
            <div style={{ color: "white", fontWeight: 600 }}>Ahmed Mohammed</div>
            <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>+966 5x xxx xxxx • Online</div>
          </div>
          <div style={{ marginLeft: "auto", background: "rgba(37,211,102,0.2)", padding: "4px 12px", borderRadius: 6, color: "#25D366", fontSize: 13, fontWeight: 500 }}>Meta Cloud API</div>
        </div>

        {/* Messages */}
        <div style={{ padding: 24, minHeight: 300, display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Customer message */}
          <div style={{ opacity: msg1Op, transform: `translateY(${msg1Y}px)` }}>
            <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: "4px 14px 14px 14px", padding: "12px 16px", maxWidth: 400, color: "white", fontSize: 15 }}>
              Hi, I received my order but one item is missing. Can you help?
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>12:45 PM</div>
            </div>
          </div>

          {/* Agent reply */}
          <div style={{ opacity: msg2Op, transform: `translateY(${msg2Y}px)`, alignSelf: "flex-end" }}>
            <div style={{ background: "rgba(37,211,102,0.15)", borderRadius: "14px 4px 14px 14px", padding: "12px 16px", maxWidth: 400, color: "white", fontSize: 15 }}>
              Hello Ahmed! I'm sorry to hear that. Let me check your order #1234 right away. Which item is missing?
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 4, textAlign: "right" }}>12:46 PM ✓✓</div>
            </div>
          </div>

          {/* Customer reply */}
          <div style={{ opacity: msg3Op, transform: `translateY(${msg3Y}px)` }}>
            <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: "4px 14px 14px 14px", padding: "12px 16px", maxWidth: 400, color: "white", fontSize: 15 }}>
              The blue t-shirt (size M) is missing from the package.
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>12:47 PM</div>
            </div>
          </div>
        </div>

        {/* Input */}
        <div style={{ padding: "12px 24px", borderTop: "1px solid rgba(255,255,255,0.08)", display: "flex", gap: 12, alignItems: "center" }}>
          <div style={{ flex: 1, background: "rgba(255,255,255,0.06)", borderRadius: 10, padding: "10px 16px", color: "rgba(255,255,255,0.3)", fontSize: 14 }}>Type a message...</div>
          <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#25D366", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
