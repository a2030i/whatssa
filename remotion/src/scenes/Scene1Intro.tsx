import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";

export const Scene1Intro = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoScale = spring({ frame, fps, config: { damping: 12, stiffness: 100 } });
  const titleY = interpolate(spring({ frame: frame - 15, fps, config: { damping: 20 } }), [0, 1], [60, 0]);
  const titleOp = interpolate(frame, [15, 35], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const subOp = interpolate(frame, [30, 50], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const subY = interpolate(spring({ frame: frame - 30, fps, config: { damping: 20 } }), [0, 1], [40, 0]);

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", background: "linear-gradient(135deg, #0a1628, #132042)" }}>
      {/* WhatsApp icon */}
      <div style={{ transform: `scale(${logoScale})`, marginBottom: 30 }}>
        <svg width="120" height="120" viewBox="0 0 24 24" fill="none">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" fill="#25D366"/>
          <path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z" fill="#25D366" opacity="0.2"/>
        </svg>
      </div>

      <div style={{ opacity: titleOp, transform: `translateY(${titleY}px)`, fontSize: 64, fontWeight: 700, color: "white", textAlign: "center" }}>
        Respondly Platform
      </div>

      <div style={{ opacity: subOp, transform: `translateY(${subY}px)`, fontSize: 28, fontWeight: 400, color: "rgba(255,255,255,0.7)", marginTop: 16, textAlign: "center" }}>
        WhatsApp Business Messaging — App Review Demo
      </div>

      {/* Accent line */}
      <div style={{
        width: interpolate(frame, [40, 70], [0, 300], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        height: 3,
        background: "linear-gradient(90deg, #25D366, #128C7E)",
        borderRadius: 2,
        marginTop: 30,
      }} />
    </AbsoluteFill>
  );
};
