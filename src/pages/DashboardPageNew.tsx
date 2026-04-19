import { useDashboardData } from "@/hooks/useDashboardData";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const DashboardPageNew = () => {
  const data = useDashboardData();
  const { profile } = useAuth();

  if (data.isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const sentToday = data.messageStats.sentToday;
  const openConvs = data.openConversations;
  const totalConvs = data.totalConversations;
  const deliveredRate = sentToday > 0 ? Math.round((data.messageStats.deliveredToday / sentToday) * 100) : 0;
  const failRate = sentToday > 0 ? Math.round((data.messageStats.failedToday / sentToday) * 100) : 0;
  const orgName = data.orgName || "المنظمة";
  const planName = data.planName || "غير محدد";
  const isTrial = data.subscriptionStatus === "trial";
  const wallet = data.walletBalance;
  const automations = data.automationCount;
  const firstChannel = data.channels[0] || null;
  const isConnected = firstChannel?.waStatus?.isConnected || false;
  const displayPhone = firstChannel?.waStatus?.displayPhone || "—";
  const channelType = firstChannel?.channelType;
  const agentName = profile?.full_name || orgName;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "صباح الخير" : hour < 17 ? "مساء الخير" : "مساء النور";

  return (
    <div dir="rtl" style={{ fontFamily: "'Tajawal', sans-serif", background: "#f4f6f8", minHeight: "100vh" }}>
      <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap" rel="stylesheet" />
      <style>{`
        @keyframes fadeUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        .wu-card { animation: fadeUp .4s ease both; background:#fff; border-radius:20px; border:1px solid #e8ecf0; }
        .wu-card:nth-child(1){animation-delay:.05s}
        .wu-card:nth-child(2){animation-delay:.10s}
        .wu-card:nth-child(3){animation-delay:.15s}
        .wu-card:nth-child(4){animation-delay:.20s}
        .live-dot { animation: pulse 1.8s infinite; }
        .stat-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
        @media(min-width:768px){ .stat-grid { grid-template-columns:repeat(4,1fr); } }
        .row-2 { display:grid; grid-template-columns:1fr; gap:12px; }
        @media(min-width:768px){ .row-2 { grid-template-columns:repeat(3,1fr); } }
        .row-3 { display:grid; grid-template-columns:1fr; gap:12px; }
        @media(min-width:768px){ .row-3 { grid-template-columns:2fr 1fr; } }
      `}</style>

      {/* ── Hero Header ── */}
      <div style={{
        background: "linear-gradient(135deg, #0d5c3a 0%, #25D366 100%)",
        padding: "28px 20px 80px",
        position: "relative",
        overflow: "hidden",
      }}>
        {/* Background circles */}
        <div style={{ position:"absolute", top:-40, left:-40, width:180, height:180, borderRadius:"50%", background:"rgba(255,255,255,.05)" }} />
        <div style={{ position:"absolute", bottom:-60, right:-20, width:240, height:240, borderRadius:"50%", background:"rgba(255,255,255,.04)" }} />

        <div style={{ position:"relative", zIndex:1 }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
            <div>
              <p style={{ color:"rgba(255,255,255,.7)", fontSize:13, margin:0 }}>{greeting} 👋</p>
              <h1 style={{ color:"#fff", fontSize:22, fontWeight:800, margin:"4px 0 0", lineHeight:1.2 }}>{agentName}</h1>
            </div>
            <div style={{ background:"rgba(255,255,255,.15)", borderRadius:14, padding:"8px 14px", backdropFilter:"blur(10px)" }}>
              <p style={{ color:"#fff", fontSize:11, margin:0, opacity:.8 }}>الخطة</p>
              <p style={{ color:"#fff", fontSize:13, fontWeight:700, margin:0 }}>{planName}</p>
            </div>
          </div>

          {/* Live Status Bar */}
          <div style={{ background:"rgba(255,255,255,.12)", borderRadius:14, padding:"12px 16px", backdropFilter:"blur(10px)", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <span className="live-dot" style={{ width:8, height:8, borderRadius:"50%", background: isConnected ? "#4ade80" : "#f87171", display:"inline-block" }} />
              <span style={{ color:"#fff", fontSize:13, fontWeight:600 }}>
                {isConnected ? "متصل — " + (displayPhone || channelType) : "غير متصل"}
              </span>
            </div>
            <span style={{ color:"rgba(255,255,255,.7)", fontSize:11 }}>
              {isTrial ? "🟡 تجريبية" : "🟢 فعّال"}
            </span>
          </div>
        </div>
      </div>

      {/* ── Content pulled up over hero ── */}
      <div style={{ padding:"0 16px 24px", marginTop:-52, position:"relative", zIndex:2 }}>

        {/* ── Stat Cards 2×2 on mobile ── */}
        <div className="stat-grid" style={{ marginBottom:16 }}>
          {[
            { icon:"💬", val: sentToday,         label:"أُرسل اليوم",       sub: `${data.messageStats.sent7Days} هذا الأسبوع`, color:"#dcfce7", accent:"#16a34a" },
            { icon:"📂", val: openConvs,          label:"محادثة مفتوحة",     sub: `${totalConvs} إجمالي`,                         color:"#dbeafe", accent:"#2563eb" },
            { icon:"✅", val: `${deliveredRate}%`, label:"معدل التوصيل",     sub: `${data.messageStats.deliveredToday} وصلت`,      color:"#fef3c7", accent:"#d97706" },
            { icon:"💰", val: `${wallet}ر`,       label:"رصيد المحفظة",      sub: `${automations} أتمتة`,                          color:"#fce7f3", accent:"#db2777" },
          ].map((s, i) => (
            <div key={i} className="wu-card" style={{ padding:"16px", position:"relative", overflow:"hidden" }}>
              <div style={{ width:38, height:38, borderRadius:12, background:s.color, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, marginBottom:10 }}>{s.icon}</div>
              <div style={{ fontSize:24, fontWeight:800, color:"#0f172a", lineHeight:1 }}>{s.val}</div>
              <div style={{ color:"#64748b", fontSize:12, marginTop:3 }}>{s.label}</div>
              <div style={{ marginTop:8, background:s.color, borderRadius:20, padding:"2px 8px", display:"inline-block" }}>
                <span style={{ fontSize:10, fontWeight:700, color:s.accent }}>{s.sub}</span>
              </div>
            </div>
          ))}
        </div>

        {/* ── Performance Card (full width) ── */}
        <div className="wu-card" style={{ padding:0, overflow:"hidden", marginBottom:16, background:"linear-gradient(135deg,#0d5c3a,#128C7E)", border:"none" }}>
          <div style={{ padding:"20px 20px 0" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
              <div>
                <p style={{ color:"rgba(255,255,255,.6)", fontSize:12, margin:0 }}>أداء المنظمة</p>
                <p style={{ color:"rgba(255,255,255,.4)", fontSize:10, margin:"2px 0 0" }}>بيانات حية</p>
              </div>
              <div style={{ background:"rgba(255,255,255,.15)", borderRadius:10, padding:"6px 12px" }}>
                <span style={{ color:"#fff", fontSize:12, fontWeight:600 }}>{orgName} ✦</span>
              </div>
            </div>
            <div style={{ fontSize:56, fontWeight:800, color:"#fff", lineHeight:1, margin:"12px 0 4px" }}>
              {deliveredRate}<span style={{ fontSize:24 }}>%</span>
            </div>
            <p style={{ color:"rgba(255,255,255,.6)", fontSize:13, margin:"0 0 16px" }}>معدل التوصيل الكلي</p>
          </div>

          {/* Progress bar */}
          <div style={{ margin:"0 20px 16px", height:6, background:"rgba(255,255,255,.15)", borderRadius:99, overflow:"hidden" }}>
            <div style={{ height:"100%", width:`${deliveredRate}%`, background:"#4ade80", borderRadius:99, transition:"width .6s ease" }} />
          </div>

          {/* Stats row */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", borderTop:"1px solid rgba(255,255,255,.1)", padding:"14px 20px" }}>
            {[
              [sentToday, "أُرسل اليوم"],
              [data.messageStats.deliveredToday, "وصل"],
              [data.messageStats.failedToday, "فشل"],
            ].map(([v, l]) => (
              <div key={String(l)} style={{ textAlign:"center" }}>
                <div style={{ fontSize:20, fontWeight:800, color:"#fff" }}>{v}</div>
                <div style={{ fontSize:11, color:"rgba(255,255,255,.5)", marginTop:2 }}>{l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Health Vitals ── */}
        <div className="wu-card" style={{ padding:20, marginBottom:16 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
            <div>
              <p style={{ fontSize:15, fontWeight:700, color:"#0f172a", margin:0 }}>مؤشرات الصحة</p>
              <p style={{ fontSize:11, color:"#64748b", margin:"2px 0 0" }}>مقاييس الأداء</p>
            </div>
            <span style={{ fontSize:20 }}>❤️</span>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
            {[
              { val:`${deliveredRate}%`, lbl:"معدل التوصيل", pct:deliveredRate, clr:"#25D366" },
              { val:`${data.messageStats.sent7Days}`, lbl:"رسائل 7 أيام", pct:Math.min(100, data.messageStats.sent7Days/10), clr:"#6366f1" },
              { val:`${openConvs}`, lbl:"محادثات مفتوحة", pct:Math.min(100,(openConvs/Math.max(totalConvs,1))*100), clr:"#f59e0b" },
              { val:`${data.messageStats.totalReceived}`, lbl:"مستلمة 30 يوم", pct:60, clr:"#0ea5e9" },
            ].map(v => (
              <div key={v.lbl}>
                <div style={{ fontSize:20, fontWeight:800, color:v.clr }}>{v.val}</div>
                <div style={{ fontSize:11, color:"#64748b", marginTop:2 }}>{v.lbl}</div>
                <div style={{ height:4, background:"#f1f5f9", borderRadius:99, marginTop:8, overflow:"hidden" }}>
                  <div style={{ height:"100%", width:`${Math.max(3,v.pct)}%`, background:v.clr, borderRadius:99 }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── API Status ── */}
        <div className="wu-card" style={{ padding:20, marginBottom:16 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
            <div>
              <p style={{ fontSize:15, fontWeight:700, color:"#0f172a", margin:0 }}>حالة الاتصالات</p>
              <p style={{ fontSize:11, color:"#64748b", margin:"2px 0 0" }}>مراقبة مستمرة</p>
            </div>
            <span className="live-dot" style={{ width:8, height:8, borderRadius:"50%", background: isConnected ? "#25D366" : "#ef4444", display:"inline-block", boxShadow:`0 0 0 3px ${isConnected ? "rgba(37,211,102,.2)" : "rgba(239,68,68,.2)"}` }} />
          </div>
          {[
            { name: channelType === "official" ? "WhatsApp Meta API" : "Evolution API", sub: displayPhone, ok: isConnected, status: isConnected ? "🟢 نشط" : "🔴 منقطع" },
            { name: "Webhook الاستقبال", sub: "مراقبة مستمرة", ok: isConnected, status: isConnected ? "🟢 نشط" : "🔴 غير نشط" },
            { name: "حالة الخطة", sub: planName, ok: !isTrial, status: isTrial ? "🟡 تجريبية" : "🟢 فعّالة" },
            { name: "المحفظة", sub: `${wallet} ريال`, ok: Number(wallet) > 0, status: Number(wallet) > 0 ? "🟢 نشطة" : "🔴 فارغة" },
          ].map((a, i) => (
            <div key={i} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 0", borderBottom: i < 3 ? "1px solid #f1f5f9" : "none" }}>
              <div>
                <p style={{ fontSize:13, fontWeight:600, color:"#0f172a", margin:0 }}>{a.name}</p>
                <p style={{ fontSize:11, color:"#64748b", margin:"2px 0 0" }}>{a.sub}</p>
              </div>
              <span style={{ fontSize:11, fontWeight:700, padding:"4px 10px", borderRadius:20, background: a.ok ? "#dcfce7" : "#fef3c7", color: a.ok ? "#16a34a" : "#d97706" }}>
                {a.status}
              </span>
            </div>
          ))}
        </div>

        {/* ── Channels ── */}
        <div className="wu-card" style={{ padding:20, marginBottom:16 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
            <p style={{ fontSize:15, fontWeight:700, color:"#0f172a", margin:0 }}>القنوات المتصلة</p>
            <span style={{ fontSize:12, color:"#64748b" }}>{data.channels.length} قناة</span>
          </div>
          {data.channels.length === 0 ? (
            <div style={{ textAlign:"center", padding:"20px 0", color:"#64748b" }}>
              <div style={{ fontSize:32, marginBottom:8 }}>📵</div>
              <p style={{ fontSize:13, margin:0 }}>لا توجد قنوات متصلة</p>
            </div>
          ) : data.channels.map((ch, i) => (
            <div key={i} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 0", borderBottom: i < data.channels.length-1 ? "1px solid #f1f5f9" : "none" }}>
              <div style={{ width:40, height:40, borderRadius:12, background: ch.waStatus.isConnected ? "#dcfce7" : "#fee2e2", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0 }}>
                {ch.channelType === "official" ? "📱" : "💻"}
              </div>
              <div style={{ flex:1 }}>
                <p style={{ fontSize:13, fontWeight:600, color:"#0f172a", margin:0 }}>{ch.channelLabel || ch.waStatus.displayPhone || `قناة ${i+1}`}</p>
                <p style={{ fontSize:11, color:"#64748b", margin:"2px 0 0" }}>{ch.channelType === "official" ? "Meta API" : "Evolution API"}</p>
              </div>
              <span style={{ fontSize:11, fontWeight:700, padding:"4px 10px", borderRadius:20, background: ch.waStatus.isConnected ? "#dcfce7" : "#fee2e2", color: ch.waStatus.isConnected ? "#16a34a" : "#dc2626" }}>
                {ch.waStatus.isConnected ? "✅ متصل" : "❌ منقطع"}
              </span>
            </div>
          ))}
        </div>

        {/* ── Summary Grid ── */}
        <div className="wu-card" style={{ padding:20 }}>
          <p style={{ fontSize:15, fontWeight:700, color:"#0f172a", margin:"0 0 16px" }}>ملخص النشاط</p>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12 }}>
            {[
              { icon:"📨", val: data.messageStats.sent30Days, lbl:"رسائل 30 يوم" },
              { icon:"📥", val: data.messageStats.totalReceived, lbl:"مستلمة 30 يوم" },
              { icon:"📂", val: totalConvs, lbl:"إجمالي المحادثات" },
              { icon:"🔓", val: openConvs, lbl:"مفتوحة الآن" },
              { icon:"🤖", val: automations, lbl:"أتمتة" },
              { icon:"💰", val: `${wallet}ر`, lbl:"رصيد" },
            ].map((s, i) => (
              <div key={i} style={{ background:"#f8fafc", borderRadius:14, padding:"12px", textAlign:"center" }}>
                <div style={{ fontSize:22, marginBottom:4 }}>{s.icon}</div>
                <div style={{ fontSize:18, fontWeight:800, color:"#0f172a" }}>{s.val}</div>
                <div style={{ fontSize:10, color:"#64748b", marginTop:2 }}>{s.lbl}</div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
};

export default DashboardPageNew;