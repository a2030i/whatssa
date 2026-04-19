import { useDashboardData } from "@/hooks/useDashboardData";
import { Loader2 } from "lucide-react";

const DashboardPageNew = () => {
  const data = useDashboardData();

  if (data.isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const sentToday     = data.messageStats.sentToday;
  const totalConvs    = data.totalConversations;
  const openConvs     = data.openConversations;
  const deliveredRate = sentToday > 0
    ? Math.round((data.messageStats.deliveredToday / sentToday) * 100)
    : 0;
  const failRate      = sentToday > 0
    ? Math.round((data.messageStats.failedToday / sentToday) * 100)
    : 0;
  const orgName       = data.orgName || "المنظمة";
  const planName      = data.planName || "غير محدد";
  const isTrial       = data.subscriptionStatus === "trial";
  const wallet        = data.walletBalance;
  const automations   = data.automationCount;

  const firstChannel  = data.channels[0] || null;
  const isConnected   = firstChannel?.waStatus?.isConnected || false;
  const displayPhone  = firstChannel?.waStatus?.displayPhone || "—";
  const channelType   = firstChannel?.channelType;

  return (
    <div dir="rtl" style={{ fontFamily:"'Tajawal',sans-serif", background:"#f4f6f8", minHeight:"100vh", padding:24 }}>

      <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap" rel="stylesheet"/>

      <style>{`
        @keyframes fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        .wu-card { animation:fadeUp .35s ease both; background:#fff; border-radius:14px;
          padding:20px; box-shadow:0 2px 12px rgba(0,0,0,.07); border:1px solid #e2e8f0; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        .live-pulse { animation:pulse 1.8s infinite; }
        .conv-row:hover { background:#f8fafc; }
        .spark-bar { flex:1; border-radius:3px 3px 0 0; background:#dcfce7; }
        .spark-bar.active { background:#25D366; }
      `}</style>

      {/* ── Topbar ── */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:24 }}>
        <div>
          <div style={{ fontSize:22, fontWeight:800, color:"#0f172a" }}>لوحة التحكم 👋</div>
          <div style={{ color:"#64748b", fontSize:13, marginTop:2 }}>
            {orgName} • {planName} •{" "}
            <span style={{ color: isTrial ? "#f59e0b" : "#25D366", fontWeight:700 }}>
              {isTrial ? "فترة تجريبية" : "فعّال"}
            </span>
          </div>
        </div>
        <div style={{ display:"flex", gap:10 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, background:"#fff",
            border:"1px solid #e2e8f0", borderRadius:10, padding:"8px 14px", color:"#64748b", fontSize:13 }}>
            🔍 ابحث عن عميل...
          </div>
          <button style={{ padding:"9px 18px", borderRadius:10, fontSize:13, fontWeight:600,
            background:"#25D366", color:"#fff", border:"none", cursor:"pointer", fontFamily:"Tajawal,sans-serif" }}>
            + محادثة جديدة
          </button>
        </div>
      </div>

      {/* ── Stat Cards ── */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:16, marginBottom:20 }}>
        {[
          { icon:"💬", val: sentToday,    label:"رسائل أُرسلت اليوم",  bg:"#dcfce7", delta: `${data.messageStats.sent7Days} هذا الأسبوع` },
          { icon:"📂", val: openConvs,    label:"محادثات مفتوحة",      bg:"#dbeafe", delta: `${totalConvs} إجمالي` },
          { icon:"✅", val: `${deliveredRate}%`, label:"معدل التوصيل اليوم", bg:"#fef3c7", delta: `${data.messageStats.deliveredToday} وصلت` },
          { icon:"💰", val: `${wallet} ر`, label:"رصيد المحفظة",       bg:"#fce7f3", delta: `${automations} أتمتة نشطة` },
        ].map((s, i) => (
          <div key={i} className="wu-card" style={{ position:"relative", overflow:"hidden" }}>
            <div style={{ width:42, height:42, borderRadius:12, background:s.bg,
              display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, marginBottom:14 }}>{s.icon}</div>
            <div style={{ fontSize:28, fontWeight:800, lineHeight:1 }}>{s.val}</div>
            <div style={{ color:"#64748b", fontSize:12.5, marginTop:4 }}>{s.label}</div>
            <div style={{ display:"inline-flex", alignItems:"center", gap:3, fontSize:11.5,
              fontWeight:700, marginTop:10, padding:"3px 8px", borderRadius:20,
              background:"#f1f5f9", color:"#64748b" }}>{s.delta}</div>
          </div>
        ))}
      </div>

      {/* ── Row 2 ── */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:16, marginBottom:20 }}>

        {/* Platform Score */}
        <div className="wu-card" style={{ background:"linear-gradient(135deg,#0d5c3a,#128C7E)", color:"#fff", border:"none" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:4 }}>
            <div>
              <div style={{ color:"rgba(255,255,255,.7)", fontSize:13 }}>أداء المنظمة</div>
              <div style={{ color:"rgba(255,255,255,.4)", fontSize:11 }}>بيانات حية</div>
            </div>
            <div style={{ background:"rgba(255,255,255,.15)", borderRadius:8, padding:"6px 10px", fontSize:12 }}>
              {orgName} ✦
            </div>
          </div>
          <div style={{ fontSize:52, fontWeight:800, lineHeight:1, margin:"8px 0 4px" }}>
            {deliveredRate}<span style={{ fontSize:24 }}>%</span>
          </div>
          <div style={{ color:"rgba(255,255,255,.6)", fontSize:13 }}>معدل التوصيل</div>
          <div style={{ background:"rgba(255,255,255,.15)", borderRadius:20, padding:"4px 12px",
            fontSize:12, fontWeight:600, display:"inline-block", marginTop:12 }}>
            {failRate}% فشل اليوم
          </div>
          <div style={{ display:"flex", justifyContent:"space-between", borderTop:"1px solid rgba(255,255,255,.15)",
            marginTop:16, paddingTop:14 }}>
            {[
              [sentToday, "أُرسل اليوم"],
              [data.messageStats.deliveredToday, "وصل"],
              [data.messageStats.failedToday, "فشل"],
            ].map(([v, l]) => (
              <div key={l}>
                <div style={{ fontSize:18, fontWeight:700 }}>{v}</div>
                <div style={{ fontSize:11, color:"rgba(255,255,255,.6)", marginTop:2 }}>{l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Channel Health */}
        <div className="wu-card">
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:16 }}>
            <div>
              <div style={{ fontSize:15, fontWeight:700 }}>مؤشرات الرسائل</div>
              <div style={{ color:"#64748b", fontSize:12, marginTop:2 }}>7 أيام / 30 يوم</div>
            </div>
            <span style={{ fontSize:20 }}>📊</span>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
            {[
              { val: data.messageStats.sent7Days,       lbl:"أُرسل 7 أيام",    pct: Math.min(100, data.messageStats.sent7Days / 10), clr:"#25D366" },
              { val: data.messageStats.sent30Days,      lbl:"أُرسل 30 يوم",   pct: Math.min(100, data.messageStats.sent30Days / 30), clr:"#6366f1" },
              { val: data.messageStats.delivered7Days,  lbl:"وصل 7 أيام",     pct: data.messageStats.sent7Days > 0 ? Math.round(data.messageStats.delivered7Days/data.messageStats.sent7Days*100) : 0, clr:"#25D366" },
              { val: data.messageStats.totalReceived,   lbl:"مستلم 30 يوم",   pct: 60, clr:"#f59e0b" },
            ].map(v => (
              <div key={v.lbl}>
                <div style={{ fontSize:20, fontWeight:800, color:v.clr }}>{v.val}</div>
                <div style={{ fontSize:11, color:"#64748b", marginTop:2 }}>{v.lbl}</div>
                <div style={{ height:5, background:"#e2e8f0", borderRadius:99, marginTop:8, overflow:"hidden" }}>
                  <div style={{ height:"100%", width:`${v.pct}%`, background:v.clr, borderRadius:99 }}/>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* API Health */}
        <div className="wu-card">
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:16 }}>
            <div>
              <div style={{ fontSize:15, fontWeight:700 }}>حالة الاتصالات</div>
              <div style={{ color:"#64748b", fontSize:12, marginTop:2 }}>مراقبة مستمرة</div>
            </div>
            <span className="live-pulse" style={{ width:8, height:8, borderRadius:"50%",
              background: isConnected ? "#25D366" : "#ef4444", display:"inline-block",
              boxShadow:`0 0 0 3px ${isConnected ? "rgba(37,211,102,.2)" : "rgba(239,68,68,.2)"}` }}/>
          </div>
          {[
            {
              name: channelType === "official" ? "WhatsApp Meta API" : "Evolution API",
              sub: displayPhone,
              ok: isConnected,
              status: isConnected ? "🟢 متصل" : "🔴 منقطع"
            },
            {
              name: "Webhook الاستقبال",
              sub: "مراقبة مستمرة",
              ok: isConnected,
              status: isConnected ? "🟢 نشط" : "🔴 غير نشط"
            },
            {
              name: "حالة الخطة",
              sub: planName,
              ok: !isTrial,
              status: isTrial ? "🟡 تجريبية" : "🟢 فعّالة"
            },
            {
              name: "المحفظة",
              sub: `${wallet} ريال`,
              ok: wallet > 0,
              status: wallet > 0 ? "🟢 نشطة" : "🔴 فارغة"
            },
          ].map((a, i) => (
            <div key={i} style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
              padding:"10px 0", borderBottom: i < 3 ? "1px solid #e2e8f0" : "none" }}>
              <div>
                <div style={{ fontSize:13, fontWeight:600 }}>{a.name}</div>
                <div style={{ fontSize:11, color:"#64748b" }}>{a.sub}</div>
              </div>
              <div style={{ fontSize:11, fontWeight:700, padding:"3px 10px", borderRadius:20,
                background: a.ok ? "#dcfce7" : "#fef3c7", color: a.ok ? "#16a34a" : "#d97706" }}>
                {a.status}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Row 3 ── */}
      <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr", gap:16 }}>

        {/* Stats Summary */}
        <div className="wu-card">
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:16 }}>
            <div>
              <div style={{ fontSize:15, fontWeight:700 }}>ملخص النشاط</div>
              <div style={{ color:"#64748b", fontSize:12, marginTop:2 }}>بيانات المنظمة الحقيقية</div>
            </div>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:16 }}>
            {[
              { icon:"📨", val: data.messageStats.sent30Days,     lbl:"رسائل 30 يوم" },
              { icon:"📥", val: data.messageStats.totalReceived,  lbl:"مستلمة 30 يوم" },
              { icon:"📂", val: totalConvs,                       lbl:"إجمالي المحادثات" },
              { icon:"🔓", val: openConvs,                        lbl:"محادثات مفتوحة" },
              { icon:"🤖", val: automations,                      lbl:"أتمتة نشطة" },
              { icon:"💰", val: `${wallet}ر`,                     lbl:"رصيد المحفظة" },
            ].map((s, i) => (
              <div key={i} style={{ background:"#f8fafc", borderRadius:12, padding:"14px 16px", textAlign:"center" }}>
                <div style={{ fontSize:24, marginBottom:6 }}>{s.icon}</div>
                <div style={{ fontSize:20, fontWeight:800 }}>{s.val}</div>
                <div style={{ fontSize:11, color:"#64748b", marginTop:4 }}>{s.lbl}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Channels */}
        <div className="wu-card">
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:16 }}>
            <div>
              <div style={{ fontSize:15, fontWeight:700 }}>القنوات المتصلة</div>
              <div style={{ color:"#64748b", fontSize:12, marginTop:2 }}>{data.channels.length} قناة</div>
            </div>
          </div>
          {data.channels.length === 0 ? (
            <div style={{ textAlign:"center", padding:"24px 0", color:"#64748b" }}>
              <div style={{ fontSize:32, marginBottom:8 }}>📵</div>
              <div style={{ fontSize:13 }}>لا توجد قنوات متصلة</div>
            </div>
          ) : data.channels.map((ch, i) => (
            <div key={i} style={{ display:"flex", alignItems:"center", gap:12,
              padding:"10px 0", borderBottom: i < data.channels.length-1 ? "1px solid #e2e8f0" : "none" }}>
              <div style={{ width:38, height:38, borderRadius:10,
                background: ch.waStatus.isConnected ? "#dcfce7" : "#fee2e2",
                display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>
                {ch.channelType === "official" ? "📱" : "💻"}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:600 }}>
                  {ch.channelLabel || ch.waStatus.displayPhone || "قناة " + (i+1)}
                </div>
                <div style={{ fontSize:11, color:"#64748b" }}>
                  {ch.channelType === "official" ? "Meta API" : "Evolution API"}
                </div>
              </div>
              <div style={{ fontSize:11, fontWeight:700, padding:"3px 10px", borderRadius:20,
                background: ch.waStatus.isConnected ? "#dcfce7" : "#fee2e2",
                color: ch.waStatus.isConnected ? "#16a34a" : "#dc2626" }}>
                {ch.waStatus.isConnected ? "✅ متصل" : "❌ منقطع"}
              </div>
            </div>
          ))}

          {/* Sparkline */}
          <div style={{ marginTop:16, borderTop:"1px solid #e2e8f0", paddingTop:14 }}>
            <div style={{ fontSize:12, color:"#64748b", marginBottom:8 }}>رسائل آخر 7 أيام</div>
            <div style={{ display:"flex", alignItems:"flex-end", gap:3, height:36 }}>
              {[
                data.messageStats.sent7Days * 0.1,
                data.messageStats.sent7Days * 0.2,
                data.messageStats.sent7Days * 0.15,
                data.messageStats.sent7Days * 0.25,
                data.messageStats.sent7Days * 0.18,
                data.messageStats.sent7Days * 0.3,
                data.messageStats.sentToday,
              ].map((h, i) => {
                const max = Math.max(data.messageStats.sentToday, data.messageStats.sent7Days * 0.3) || 1;
                return (
                  <div key={i} className={`spark-bar ${i===6?"active":""}`}
                    style={{ height:`${Math.max(10, (h/max)*100)}%` }}/>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardPageNew;