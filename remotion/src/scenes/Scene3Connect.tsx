import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig, Sequence } from "remotion";

export const Scene3Connect = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const stepOp = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });
  const panelSlide = spring({ frame, fps, config: { damping: 20 } });
  const popupScale = spring({ frame: frame - 40, fps, config: { damping: 15 } });
  const checkScale = spring({ frame: frame - 90, fps, config: { damping: 8 } });
  const successOp = interpolate(frame, [90, 105], [0, 1], { extrapolateRight: "clamp", extrapolateLeft: "clamp" });

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", background: "linear-gradient(135deg, #0a1628, #132042)" }}>
      {/* Step */}
      <div style={{ position: "absolute", top: 60, left: 80, opacity: stepOp, display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#25D366", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontWeight: 700, fontSize: 18 }}>2</div>
        <span style={{ color: "white", fontSize: 24, fontWeight: 600 }}>Connect WhatsApp via Meta Embedded Signup</span>
      </div>

      {/* Integrations panel */}
      <div style={{
        transform: `translateX(${interpolate(panelSlide, [0, 1], [-100, 0])}px)`,
        opacity: panelSlide,
        width: 700, padding: 40, borderRadius: 20,
        background: "rgba(255,255,255,0.05)",
        border: "1px solid rgba(255,255,255,0.1)",
      }}>
        <div style={{ fontSize: 22, fontWeight: 600, color: "white", marginBottom: 24 }}>Integrations</div>

        <div style={{ display: "flex", gap: 16, alignItems: "center", padding: 20, borderRadius: 14, background: "rgba(37,211,102,0.1)", border: "1px solid rgba(37,211,102,0.3)" }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="#25D366">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
          </svg>
          <div>
            <div style={{ color: "white", fontWeight: 600, fontSize: 18 }}>WhatsApp Business (Official)</div>
            <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 14 }}>Meta Cloud API — Embedded Signup</div>
          </div>
          <div style={{ marginLeft: "auto", background: "#25D366", color: "white", padding: "10px 24px", borderRadius: 10, fontWeight: 600 }}>Connect</div>
        </div>
      </div>

      {/* Meta popup overlay */}
      {frame > 40 && (
        <div style={{
          position: "absolute",
          transform: `scale(${Math.min(popupScale, 1)})`,
          width: 500, padding: 40, borderRadius: 16,
          background: "white",
          boxShadow: "0 25px 80px rgba(0,0,0,0.5)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
            <span style={{ fontSize: 20, fontWeight: 600, color: "#1c1e21" }}>Continue with Facebook</span>
          </div>
          <div style={{ fontSize: 14, color: "#606770", marginBottom: 20 }}>Grant permissions to Respondly</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: "#25D366", fontSize: 18 }}>✓</span>
              <span style={{ color: "#333", fontSize: 14 }}>whatsapp_business_management</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: "#25D366", fontSize: 18 }}>✓</span>
              <span style={{ color: "#333", fontSize: 14 }}>whatsapp_business_messaging</span>
            </div>
          </div>
          <div style={{ background: "#1877F2", color: "white", padding: "12px", borderRadius: 8, textAlign: "center", fontWeight: 600, marginTop: 24 }}>Continue</div>
        </div>
      )}

      {/* Success check */}
      {frame > 90 && (
        <div style={{
          position: "absolute", bottom: 100,
          opacity: successOp,
          transform: `scale(${checkScale})`,
          display: "flex", alignItems: "center", gap: 12,
          background: "rgba(37,211,102,0.15)", border: "1px solid rgba(37,211,102,0.4)",
          padding: "14px 28px", borderRadius: 12,
        }}>
          <span style={{ fontSize: 24 }}>✅</span>
          <span style={{ color: "#25D366", fontWeight: 600, fontSize: 18 }}>WhatsApp Connected — +966 5x xxx xxxx</span>
        </div>
      )}
    </AbsoluteFill>
  );
};
