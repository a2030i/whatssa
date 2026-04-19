import { useDashboardData } from "@/hooks/useDashboardData";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

const DAYS_AR: Record<string, string> = {
  Sunday:"الأحد", Monday:"الاثنين", Tuesday:"الثلاثاء",
  Wednesday:"الأربعاء", Thursday:"الخميس", Friday:"الجمعة", Saturday:"السبت"
};

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

  const { agents, hourStats, dayStats, topCustomers } = data;

  const sentToday      = data.messageStats.sentToday;
  const openConvs      = data.openConversations;
  const totalConvs     = data.totalConversations;
  const deliveredToday = data.messageStats.deliveredToday;
  const deliveredRate  = sentToday>0 ? Math.round((deliveredToday/sentToday)*100) : 0;
  const failedToday    = data.messageStats.failedToday;
  const sent7          = data.messageStats.sent7Days;
  const delivered7     = data.messageStats.delivered7Days;
  const failed7        = data.messageStats.failed7Days;
  const successRate7   = sent7>0 ? Math.round(((delivered7+Math.max(0,sent7-delivered7-failed7))/sent7)*100) : 0;
  const orgName        = data.orgName||"المنظمة";
  const planName       = data.planName||"غير محدد";
  const isTrial        = data.subscriptionStatus==="trial";
  const wallet         = Number(data.walletBalance)||0;
  const isConnected    = data.channels[0]?.waStatus?.isConnected||false;
  const agentName      = profile?.full_name||orgName;
  const hour           = new Date().getHours();
  const greeting       = hour<12?"صباح الخير":hour<17?"مساء الخير":"مساء النور";
  const colors         = ["#25D366","#6366f1","#f59e0b","#0ea5e9","#ec4899","#14b8a6","#f97316","#8b5cf6"];
  const totalToday     = agents.reduce((a,b)=>a+b.messages_today,0);
  const maxHour        = Math.max(...hourStats.map(h=>h.count),1);
  const peakHour       = hourStats.reduce((a,b)=>a.count>b.count?a:b,{hour:0,count:0});
  const maxDay         = Math.max(...dayStats.map(d=>d.count),1);
  const peakDay        = dayStats.reduce((a,b)=>a.count>b.count?a:b,{day:"",day_num:0,count:0});

  const csatStars = data.csatAverage !== null ? Math.round(data.csatAverage) : null;

  return (
    <div dir="rtl" style={{fontFamily:"'Tajawal',sans-serif",background:"#f0f2f5",minHeight:"100vh"}}>
      <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800;900&display=swap" rel="stylesheet"/>
      <style>{`
        @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
        .wu{animation:fadeUp .4s ease both;background:#fff;border-radius:20px;border:1px solid #e2e8f0;box-shadow:0 1px 8px rgba(0,0,0,.06)}
        .live{animation:pulse 1.8s infinite}
        .g2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
        .g3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}
        @media(min-width:768px){.g2{grid-template-columns:repeat(4,1fr)}.row2{display:grid!important;grid-template-columns:3fr 2fr;gap:14px}.row2b{display:grid!important;grid-template-columns:1fr 1fr;gap:14px}}
        .row2{display:flex;flex-direction:column;gap:14px}
        .row2b{display:flex;flex-direction:column;gap:14px}
        .bar-h:hover{opacity:.8;cursor:pointer}
        .cust-row:hover{background:#f8fafc}
      `}</style>

      {/* ══ HERO ══ */}
      <div style={{background:"linear-gradient(135deg,#064e35 0%,#25D366 100%)",padding:"28px 20px 80px",position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",top:-60,left:-60,width:220,height:220,borderRadius:"50%",background:"rgba(255,255,255,.04)"}}/>
        <div style={{position:"absolute",bottom:-80,right:-30,width:280,height:280,borderRadius:"50%",background:"rgba(255,255,255,.03)"}}/>
        <div style={{position:"absolute",top:20,left:"40%",width:100,height:100,borderRadius:"50%",background:"rgba(255,255,255,.03)"}}/>
        <div style={{position:"relative",zIndex:1}}>
          <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:20}}>
            <div>
              <p style={{color:"rgba(255,255,255,.65)",fontSize:13,margin:0}}>{greeting} 👋</p>
              <h1 style={{color:"#fff",fontSize:24,fontWeight:900,margin:"4px 0 0",lineHeight:1.2}}>{agentName}</h1>
              <p style={{color:"rgba(255,255,255,.45)",fontSize:11,margin:"4px 0 0"}}>{orgName}</p>
            </div>
            <div style={{background:"rgba(255,255,255,.12)",borderRadius:16,padding:"10px 16px",backdropFilter:"blur(12px)",textAlign:"center",border:"1px solid rgba(255,255,255,.15)"}}>
              <p style={{color:"rgba(255,255,255,.6)",fontSize:10,margin:0,letterSpacing:1}}>الخطة</p>
              <p style={{color:"#fff",fontSize:14,fontWeight:800,margin:"2px 0 0"}}>{planName}</p>
              <p style={{color:isTrial?"#fbbf24":"#4ade80",fontSize:10,margin:"3px 0 0",fontWeight:700}}>{isTrial?"⏱ تجريبية":"✅ فعّالة"}</p>
            </div>
          </div>

          {/* Live Status */}
          <div style={{background:"rgba(255,255,255,.1)",borderRadius:16,padding:"12px 18px",backdropFilter:"blur(12px)",border:"1px solid rgba(255,255,255,.12)"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span className="live" style={{width:9,height:9,borderRadius:"50%",background:isConnected?"#4ade80":"#f87171",display:"inline-block",boxShadow:isConnected?"0 0 0 3px rgba(74,222,128,.3)":"none"}}/>
                <span style={{color:"#fff",fontSize:13,fontWeight:700}}>{isConnected?"الاتصال نشط":"غير متصل"}</span>
              </div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {data.channels.map((ch,i) => (
                  <span key={i} style={{background:"rgba(255,255,255,.15)",borderRadius:20,padding:"4px 12px",fontSize:11,color:"#fff",fontWeight:600,border:"1px solid rgba(255,255,255,.1)"}}>
                    {ch.channelType==="official"?"📱":"💻"} {ch.channelLabel||ch.waStatus.displayPhone||`قناة ${i+1}`}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{padding:"0 16px 32px",marginTop:-56,position:"relative",zIndex:2}}>

        {/* ══ KPI Cards ══ */}
        <div className="g2" style={{marginBottom:16}}>
          {[
            {icon:"💬",val:sentToday,          label:"أُرسل اليوم",   sub:`${data.messageStats.sent7Days} هذا الأسبوع`, bg:"linear-gradient(135deg,#dcfce7,#bbf7d0)", ac:"#15803d", ic:"#dcfce7"},
            {icon:"📂",val:openConvs,           label:"مفتوحة الآن",   sub:`${totalConvs} إجمالي`,                        bg:"linear-gradient(135deg,#dbeafe,#bfdbfe)", ac:"#1d4ed8", ic:"#dbeafe"},
            {icon:"✅",val:`${deliveredRate}%`, label:"توصيل اليوم",   sub:`${deliveredToday} وصلت • ${failedToday} فشلت`, bg:"linear-gradient(135deg,#fef3c7,#fde68a)", ac:"#b45309", ic:"#fef3c7"},
            {icon:"👥",val:agents.length,       label:"موظف نشط",      sub:`${totalToday} رسالة اليوم`,                   bg:"linear-gradient(135deg,#ede9fe,#ddd6fe)", ac:"#6d28d9", ic:"#ede9fe"},
          ].map((s,i) => (
            <div key={i} className="wu" style={{padding:"16px",overflow:"hidden",position:"relative"}}>
              <div style={{width:40,height:40,borderRadius:12,background:s.ic,display:"flex",alignItems:"center",justifyContent:"center",fontSize:19,marginBottom:12}}>{s.icon}</div>
              <div style={{fontSize:26,fontWeight:900,color:"#0f172a",lineHeight:1}}>{s.val}</div>
              <div style={{color:"#64748b",fontSize:11,marginTop:4,fontWeight:500}}>{s.label}</div>
              <div style={{marginTop:10,background:s.ic,borderRadius:20,padding:"3px 10px",display:"inline-flex",alignItems:"center"}}>
                <span style={{fontSize:10,fontWeight:700,color:s.ac}}>{s.sub}</span>
              </div>
            </div>
          ))}
        </div>

        {/* ══ Wallet Card (Visa Style) ══ */}
        <div style={{marginBottom:16,background:"linear-gradient(135deg,#1e3a5f 0%,#0f172a 50%,#1e3a5f 100%)",borderRadius:24,padding:"24px",position:"relative",overflow:"hidden",boxShadow:"0 8px 32px rgba(15,23,42,.35)"}}>
          <div style={{position:"absolute",top:-40,left:-40,width:160,height:160,borderRadius:"50%",background:"rgba(255,255,255,.03)"}}/>
          <div style={{position:"absolute",bottom:-60,right:-20,width:200,height:200,borderRadius:"50%",background:"rgba(255,255,255,.04)"}}/>
          <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",width:300,height:300,borderRadius:"50%",background:"radial-gradient(circle,rgba(37,211,102,.08) 0%,transparent 70%)"}}/>
          <div style={{position:"relative",zIndex:1}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:24}}>
              <div>
                <p style={{color:"rgba(255,255,255,.5)",fontSize:11,margin:0,letterSpacing:2,textTransform:"uppercase"}}>رصيد المحفظة</p>
                <p style={{color:"rgba(255,255,255,.3)",fontSize:10,margin:"2px 0 0"}}>{orgName}</p>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <div style={{width:28,height:28,borderRadius:"50%",background:"rgba(255,193,7,.8)"}}/>
                <div style={{width:28,height:28,borderRadius:"50%",background:"rgba(255,120,7,.5)",marginRight:-14}}/>
                <span style={{color:"rgba(255,255,255,.6)",fontSize:11,marginRight:8,fontWeight:600}}>whatssa</span>
              </div>
            </div>
            <div style={{marginBottom:24}}>
              <p style={{color:"rgba(255,255,255,.4)",fontSize:12,margin:"0 0 4px"}}>الرصيد المتاح</p>
              <p style={{color:"#fff",fontSize:38,fontWeight:900,margin:0,letterSpacing:-1}}>
                {wallet.toFixed(2)} <span style={{fontSize:18,fontWeight:500,color:"rgba(255,255,255,.6)"}}>ر.س</span>
              </p>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end"}}>
              <div>
                <p style={{color:"rgba(255,255,255,.4)",fontSize:10,margin:"0 0 2px",letterSpacing:2}}>الحالة</p>
                <p style={{color:isTrial?"#fbbf24":"#4ade80",fontSize:13,fontWeight:700,margin:0}}>{isTrial?"⏱ تجريبية":"✅ فعّالة"}</p>
              </div>
              <div style={{textAlign:"left"}}>
                <p style={{color:"rgba(255,255,255,.4)",fontSize:10,margin:"0 0 2px",letterSpacing:2}}>الخطة</p>
                <p style={{color:"rgba(255,255,255,.8)",fontSize:13,fontWeight:700,margin:0}}>{planName}</p>
              </div>
              <div style={{width:50,height:36,borderRadius:6,background:"linear-gradient(135deg,rgba(255,255,255,.15),rgba(255,255,255,.05))",border:"1px solid rgba(255,255,255,.1)",display:"flex",alignItems:"center",justifyContent:"center"}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:2}}>
                  {[...Array(4)].map((_,i) => (
                    <div key={i} style={{width:8,height:8,borderRadius:2,background:"rgba(255,255,255,.3)"}}/>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ══ Performance + Agents ══ */}
        <div className="row2" style={{marginBottom:16}}>

          {/* Agents */}
          <div className="wu" style={{padding:20}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <div style={{width:4,height:22,borderRadius:99,background:"#25D366"}}/>
                <div>
                  <p style={{fontSize:15,fontWeight:800,color:"#0f172a",margin:0}}>أداء الموظفين</p>
                  <p style={{fontSize:11,color:"#64748b",margin:"2px 0 0"}}>اليوم — {agents.length} موظف نشط</p>
                </div>
              </div>
              <span style={{fontSize:22}}>🏆</span>
            </div>
            {agents.map((a,i) => {
              const pct = totalToday>0 ? Math.round((a.messages_today/totalToday)*100) : 0;
              const sr  = a.messages_7days>0 ? Math.round(((a.read_msgs+a.delivered_msgs)/a.messages_7days)*100) : 0;
              return (
                <div key={i} style={{marginBottom:16,paddingBottom:16,borderBottom:i<agents.length-1?"1px solid #f1f5f9":"none"}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                    <div style={{width:38,height:38,borderRadius:"50%",background:colors[i%colors.length],display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,fontWeight:900,color:"#fff",flexShrink:0,boxShadow:`0 3px 8px ${colors[i%colors.length]}55`}}>
                      {a.full_name[0]}
                    </div>
                    <div style={{flex:1}}>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                        <span style={{fontSize:13,fontWeight:700,color:"#0f172a"}}>{a.full_name}</span>
                        <div style={{textAlign:"left"}}>
                          <span style={{fontSize:15,fontWeight:900,color:colors[i%colors.length]}}>{a.messages_today}</span>
                          <span style={{fontSize:10,color:"#64748b",marginRight:2}}> اليوم</span>
                        </div>
                      </div>
                      <div style={{display:"flex",gap:8,marginTop:3,flexWrap:"wrap"}}>
                        <span style={{fontSize:10,color:"#64748b",background:"#f1f5f9",borderRadius:20,padding:"1px 8px"}}>📂 {a.open_convs} مفتوحة</span>
                        <span style={{fontSize:10,color:"#64748b",background:"#f1f5f9",borderRadius:20,padding:"1px 8px"}}>📅 {a.messages_7days} / 7أيام</span>
                        <span style={{fontSize:10,fontWeight:700,background:sr>=80?"#dcfce7":sr>=60?"#fef3c7":"#fee2e2",color:sr>=80?"#15803d":sr>=60?"#b45309":"#dc2626",borderRadius:20,padding:"1px 8px"}}>
                          {sr>=80?"✅":"⚠️"} {sr}% نجاح
                        </span>
                      </div>
                    </div>
                  </div>
                  <div style={{height:6,background:"#f1f5f9",borderRadius:99,overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${pct}%`,background:colors[i%colors.length],borderRadius:99,transition:"width .8s ease"}}/>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",marginTop:4}}>
                    <span style={{fontSize:9,color:"#94a3b8"}}>{pct}% من رسائل اليوم</span>
                    <span style={{fontSize:9,color:"#94a3b8"}}>قُرئت {a.read_msgs} • وصلت {a.delivered_msgs}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right column */}
          <div style={{display:"flex",flexDirection:"column",gap:14}}>

            {/* 7-day stats */}
            <div className="wu" style={{padding:20}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
                <div style={{width:4,height:22,borderRadius:99,background:"#6366f1"}}/>
                <p style={{fontSize:15,fontWeight:800,color:"#0f172a",margin:0}}>آخر 7 أيام</p>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                {[
                  {icon:"📤",val:sent7,     label:"أُرسل",  color:"#0f172a"},
                  {icon:"👁", val:Math.max(0,sent7-delivered7-failed7),label:"قُرئ",color:"#6366f1"},
                  {icon:"✅",val:delivered7,label:"وصل",    color:"#16a34a"},
                  {icon:"❌",val:failed7,   label:"فشل",    color:"#dc2626"},
                ].map((s,i) => (
                  <div key={i} style={{background:"#f8fafc",borderRadius:14,padding:"12px",textAlign:"center"}}>
                    <div style={{fontSize:20,marginBottom:4}}>{s.icon}</div>
                    <div style={{fontSize:20,fontWeight:900,color:s.color}}>{s.val}</div>
                    <div style={{fontSize:10,color:"#64748b",marginTop:2}}>{s.label}</div>
                  </div>
                ))}
              </div>
              <div style={{background:successRate7>=80?"#dcfce7":successRate7>=60?"#fef3c7":"#fee2e2",borderRadius:14,padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:12,color:"#374151",fontWeight:600}}>معدل النجاح الكلي</span>
                <span style={{fontSize:20,fontWeight:900,color:successRate7>=80?"#15803d":successRate7>=60?"#b45309":"#dc2626"}}>{successRate7}%</span>
              </div>
            </div>

            {/* CSAT Card */}
            <div className="wu" style={{padding:20}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
                <div style={{width:4,height:22,borderRadius:99,background:"#f59e0b"}}/>
                <p style={{fontSize:15,fontWeight:800,color:"#0f172a",margin:0}}>رضا العملاء</p>
                <span style={{fontSize:12}}>⭐</span>
              </div>
              {data.csatAverage !== null ? (
                <div>
                  <div style={{textAlign:"center",marginBottom:12}}>
                    <div style={{fontSize:42,fontWeight:900,color:"#f59e0b",lineHeight:1}}>{data.csatAverage}</div>
                    <div style={{fontSize:11,color:"#64748b",marginTop:4}}>متوسط التقييم / 5</div>
                    <div style={{display:"flex",justifyContent:"center",gap:3,marginTop:6}}>
                      {[1,2,3,4,5].map(s => (
                        <span key={s} style={{fontSize:18,color:csatStars!==null&&s<=csatStars?"#f59e0b":"#e2e8f0"}}>★</span>
                      ))}
                    </div>
                  </div>
                  <div style={{background:"#fef3c7",borderRadius:12,padding:"10px 14px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{fontSize:11,color:"#b45309",fontWeight:600}}>عدد التقييمات</span>
                    <span style={{fontSize:18,fontWeight:900,color:"#b45309"}}>{data.csatCount}</span>
                  </div>
                  <p style={{fontSize:10,color:"#94a3b8",textAlign:"center",marginTop:8}}>آخر 30 يوم</p>
                </div>
              ) : (
                <div style={{textAlign:"center",padding:"20px 0"}}>
                  <div style={{fontSize:32,marginBottom:8}}>📊</div>
                  <p style={{fontSize:12,color:"#94a3b8"}}>لا توجد تقييمات بعد</p>
                  <p style={{fontSize:10,color:"#cbd5e1",marginTop:4}}>سيظهر المتوسط بعد أول تقييم</p>
                </div>
              )}
            </div>

            {/* Channels */}
            <div className="wu" style={{padding:20}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
                <div style={{width:4,height:22,borderRadius:99,background:"#0ea5e9"}}/>
                <p style={{fontSize:15,fontWeight:800,color:"#0f172a",margin:0}}>القنوات</p>
                <span className="live" style={{width:7,height:7,borderRadius:"50%",background:isConnected?"#25D366":"#ef4444",display:"inline-block",marginRight:"auto",boxShadow:isConnected?"0 0 0 3px rgba(37,211,102,.2)":"none"}}/>
              </div>
              {data.channels.map((ch,i) => (
                <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:i<data.channels.length-1?"1px solid #f1f5f9":"none"}}>
                  <div style={{width:38,height:38,borderRadius:12,background:ch.waStatus.isConnected?"#dcfce7":"#fee2e2",display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,flexShrink:0}}>
                    {ch.channelType==="official"?"📱":"💻"}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <p style={{fontSize:12,fontWeight:700,color:"#0f172a",margin:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                      {ch.channelLabel||ch.waStatus.displayPhone||`قناة ${i+1}`}
                    </p>
                    <p style={{fontSize:10,color:"#64748b",margin:"2px 0 0"}}>{ch.channelType==="official"?"Meta API":"Evolution API"}</p>
                  </div>
                  <span style={{fontSize:10,fontWeight:700,padding:"3px 10px",borderRadius:20,background:ch.waStatus.isConnected?"#dcfce7":"#fee2e2",color:ch.waStatus.isConnected?"#15803d":"#dc2626",flexShrink:0,whiteSpace:"nowrap"}}>
                    {ch.waStatus.isConnected?"✅ متصل":"❌ منقطع"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ══ Hour Chart ══ */}
        <div className="wu" style={{padding:20,marginBottom:16}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{width:4,height:22,borderRadius:99,background:"#f59e0b"}}/>
              <div>
                <p style={{fontSize:15,fontWeight:800,color:"#0f172a",margin:0}}>أكثر أوقات الرسائل</p>
                <p style={{fontSize:11,color:"#64748b",margin:"2px 0 0"}}>آخر 30 يوم — بتوقيت السعودية</p>
              </div>
            </div>
            <div style={{background:"#fef3c7",borderRadius:12,padding:"6px 12px",textAlign:"center"}}>
              <p style={{fontSize:10,color:"#b45309",margin:0}}>ذروة النشاط</p>
              <p style={{fontSize:14,fontWeight:800,color:"#b45309",margin:0}}>{peakHour.hour}:00</p>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"flex-end",gap:3,height:80,paddingBottom:4}}>
            {hourStats.map((h,i) => {
              const pct = maxHour>0 ? (h.count/maxHour)*100 : 0;
              const isPeak = h.count===peakHour.count;
              const isWork = h.hour>=9 && h.hour<=21;
              return (
                <div key={i} className="bar-h" title={`${h.hour}:00 — ${h.count} رسالة`}
                  style={{flex:1,height:`${Math.max(4,pct)}%`,borderRadius:"3px 3px 0 0",
                    background:isPeak?"#f59e0b":isWork?"#25D366":"#cbd5e1",
                    transition:"all .3s ease"}}
                />
              );
            })}
          </div>
          <div style={{display:"flex",justifyContent:"space-between",marginTop:6}}>
            {[0,3,6,9,12,15,18,21].map(h => (
              <span key={h} style={{fontSize:9,color:"#94a3b8",flex:1,textAlign:"center"}}>{h}</span>
            ))}
          </div>
          <div style={{display:"flex",gap:12,marginTop:10,flexWrap:"wrap"}}>
            <div style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:10,height:10,borderRadius:2,background:"#f59e0b"}}/><span style={{fontSize:10,color:"#64748b"}}>ذروة النشاط</span></div>
            <div style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:10,height:10,borderRadius:2,background:"#25D366"}}/><span style={{fontSize:10,color:"#64748b"}}>ساعات العمل</span></div>
            <div style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:10,height:10,borderRadius:2,background:"#cbd5e1"}}/><span style={{fontSize:10,color:"#64748b"}}>خارج وقت العمل</span></div>
          </div>
        </div>

        {/* ══ Day Chart ══ */}
        <div className="wu" style={{padding:20,marginBottom:16}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{width:4,height:22,borderRadius:99,background:"#8b5cf6"}}/>
              <div>
                <p style={{fontSize:15,fontWeight:800,color:"#0f172a",margin:0}}>أكثر أيام الأسبوع نشاطاً</p>
                <p style={{fontSize:11,color:"#64748b",margin:"2px 0 0"}}>آخر 30 يوم</p>
              </div>
            </div>
            <div style={{background:"#ede9fe",borderRadius:12,padding:"6px 12px",textAlign:"center"}}>
              <p style={{fontSize:10,color:"#6d28d9",margin:0}}>أنشط يوم</p>
              <p style={{fontSize:14,fontWeight:800,color:"#6d28d9",margin:0}}>{DAYS_AR[peakDay.day?.trim()]||peakDay.day}</p>
            </div>
          </div>
          <div style={{display:"flex",gap:8,alignItems:"flex-end",height:100}}>
            {dayStats.map((d,i) => {
              const pct = maxDay>0 ? (d.count/maxDay)*100 : 0;
              const isPeak = d.count===peakDay.count;
              const isWeekend = d.day_num===5||d.day_num===6;
              return (
                <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                  <span style={{fontSize:9,color:isPeak?"#6d28d9":"#94a3b8",fontWeight:isPeak?800:400}}>{d.count}</span>
                  <div className="bar-h" style={{width:"100%",height:`${Math.max(8,pct)}%`,borderRadius:"6px 6px 0 0",
                    background:isPeak?"#8b5cf6":isWeekend?"#f59e0b":"#25D366",
                    transition:"all .3s ease"}}
                  />
                  <span style={{fontSize:9,color:isPeak?"#6d28d9":"#64748b",fontWeight:isPeak?800:400,textAlign:"center",lineHeight:1.2}}>
                    {(DAYS_AR[d.day?.trim()]||d.day).slice(0,3)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ══ Top Customers ══ */}
        <div className="wu" style={{padding:20,marginBottom:16}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <div style={{width:4,height:22,borderRadius:99,background:"#ec4899"}}/>
              <div>
                <p style={{fontSize:15,fontWeight:800,color:"#0f172a",margin:0}}>أكثر العملاء تواصلاً</p>
                <p style={{fontSize:11,color:"#64748b",margin:"2px 0 0"}}>آخر 30 يوم — محادثات خاصة فقط</p>
              </div>
            </div>
            <span style={{fontSize:22}}>🏅</span>
          </div>
          {topCustomers.map((c,i) => {
            const maxC = topCustomers[0]?.msg_count||1;
            const pct  = Math.round((c.msg_count/maxC)*100);
            const lastMsg = new Date(c.last_message);
            const diffH = Math.floor((Date.now()-lastMsg.getTime())/36e5);
            const lastStr = diffH<1?"منذ أقل من ساعة":diffH<24?`منذ ${diffH} ساعة`:`منذ ${Math.floor(diffH/24)} يوم`;
            const medals = ["🥇","🥈","🥉"];
            return (
              <div key={i} className="cust-row" style={{display:"flex",alignItems:"center",gap:10,padding:"10px 8px",borderRadius:12,borderBottom:i<topCustomers.length-1?"1px solid #f1f5f9":"none",transition:"background .15s"}}>
                <div style={{width:32,height:32,borderRadius:"50%",background:i<3?"transparent":colors[i%colors.length],display:"flex",alignItems:"center",justifyContent:"center",fontSize:i<3?20:13,fontWeight:800,color:"#fff",flexShrink:0}}>
                  {i<3?medals[i]:c.customer_name[0]}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4}}>
                    <span style={{fontSize:13,fontWeight:700,color:"#0f172a",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:180}}>{c.customer_name}</span>
                    <span style={{fontSize:13,fontWeight:900,color:"#ec4899",flexShrink:0}}>{c.msg_count} رسالة</span>
                  </div>
                  <div style={{height:4,background:"#f1f5f9",borderRadius:99,overflow:"hidden",marginBottom:4}}>
                    <div style={{height:"100%",width:`${pct}%`,background:"linear-gradient(90deg,#ec4899,#f472b6)",borderRadius:99}}/>
                  </div>
                  <span style={{fontSize:10,color:"#94a3b8"}}>{lastStr}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* ══ Summary ══ */}
        <div className="wu" style={{padding:20}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
            <div style={{width:4,height:22,borderRadius:99,background:"#25D366"}}/>
            <p style={{fontSize:15,fontWeight:800,color:"#0f172a",margin:0}}>ملخص النشاط الكلي</p>
          </div>
          <div className="g3">
            {[
              {icon:"📨",val:data.messageStats.sent30Days,   lbl:"رسائل 30 يوم"},
              {icon:"📥",val:data.messageStats.totalReceived, lbl:"مستلمة 30 يوم"},
              {icon:"📂",val:totalConvs,                      lbl:"إجمالي المحادثات"},
              {icon:"🔓",val:openConvs,                       lbl:"مفتوحة الآن"},
              {icon:"👥",val:agents.length,                   lbl:"موظف نشط"},
              {icon:"⚡",val:data.automationCount,            lbl:"قواعد الأتمتة"},
            ].map((s,i) => (
              <div key={i} style={{background:"#f8fafc",borderRadius:14,padding:"14px 8px",textAlign:"center",border:"1px solid #e2e8f0"}}>
                <div style={{fontSize:22,marginBottom:6}}>{s.icon}</div>
                <div style={{fontSize:18,fontWeight:900,color:"#0f172a"}}>{s.val}</div>
                <div style={{fontSize:10,color:"#64748b",marginTop:3}}>{s.lbl}</div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
};

export default DashboardPageNew;
