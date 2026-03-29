import { useState } from "react";
import { MessageSquare, Clock, CheckCircle2, TrendingUp, AlertTriangle, Users, Download, Calendar, BarChart3, PieChart as PieChartIcon } from "lucide-react";
import KpiCard from "@/components/KpiCard";
import { analyticsData, agents } from "@/data/mockData";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell, LineChart, Line } from "recharts";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

const channelData = [
  { name: "WhatsApp", value: 68, color: "hsl(142 64% 42%)" },
  { name: "Instagram", value: 18, color: "hsl(330 80% 55%)" },
  { name: "Telegram", value: 14, color: "hsl(200 80% 50%)" },
];

const satisfactionData = [
  { day: "السبت", satisfied: 85, neutral: 10, unsatisfied: 5 },
  { day: "الأحد", satisfied: 90, neutral: 7, unsatisfied: 3 },
  { day: "الاثنين", satisfied: 78, neutral: 14, unsatisfied: 8 },
  { day: "الثلاثاء", satisfied: 88, neutral: 8, unsatisfied: 4 },
  { day: "الأربعاء", satisfied: 92, neutral: 5, unsatisfied: 3 },
  { day: "الخميس", satisfied: 80, neutral: 12, unsatisfied: 8 },
  { day: "الجمعة", satisfied: 95, neutral: 3, unsatisfied: 2 },
];

const responseTimeData = [
  { day: "السبت", time: 1.8 }, { day: "الأحد", time: 1.5 }, { day: "الاثنين", time: 2.1 },
  { day: "الثلاثاء", time: 1.2 }, { day: "الأربعاء", time: 0.9 }, { day: "الخميس", time: 1.6 },
  { day: "الجمعة", time: 1.1 },
];

const AnalyticsPage = () => {
  const [period, setPeriod] = useState("week");

  return (
    <div className="p-3 md:p-6 space-y-6 max-w-[1200px]" dir="rtl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">التحليلات والأداء</h1>
          <p className="text-sm text-muted-foreground mt-1">نظرة شاملة على أداء الفريق وحجم العمل</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[130px] text-xs bg-secondary border-0">
              <Calendar className="w-3 h-3 ml-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">اليوم</SelectItem>
              <SelectItem value="week">هذا الأسبوع</SelectItem>
              <SelectItem value="month">هذا الشهر</SelectItem>
              <SelectItem value="quarter">هذا الربع</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="gap-1 text-xs">
            <Download className="w-3.5 h-3.5" /> تصدير
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon={MessageSquare} title="إجمالي المحادثات" value="401" trend={{ value: "+12%", positive: true }} colorIndex={1} />
        <KpiCard icon={Clock} title="متوسط وقت أول رد" value="1.4 د" subtitle="الهدف: أقل من 2 دقيقة" trend={{ value: "-8%", positive: true }} colorIndex={2} />
        <KpiCard icon={CheckCircle2} title="المحادثات المغلقة" value="154" trend={{ value: "+5%", positive: true }} colorIndex={3} />
        <KpiCard icon={AlertTriangle} title="محادثات متأخرة" value="7" trend={{ value: "+2", positive: false }} colorIndex={4} />
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="bg-secondary w-full sm:w-auto overflow-x-auto">
          <TabsTrigger value="overview" className="text-xs gap-1"><BarChart3 className="w-3 h-3" /> نظرة عامة</TabsTrigger>
          <TabsTrigger value="team" className="text-xs gap-1"><Users className="w-3 h-3" /> أداء الفريق</TabsTrigger>
          <TabsTrigger value="reports" className="text-xs gap-1"><PieChartIcon className="w-3 h-3" /> تقارير</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-card rounded-lg p-5 shadow-card">
              <h3 className="font-semibold text-sm mb-4">المحادثات اليومية</h3>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={analyticsData.dailyConversations}>
                  <defs>
                    <linearGradient id="greenGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(142 64% 42%)" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="hsl(142 64% 42%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 13% 91%)" />
                  <XAxis dataKey="day" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid hsl(220 13% 91%)", fontSize: 12 }} />
                  <Area type="monotone" dataKey="count" stroke="hsl(142 64% 42%)" fill="url(#greenGrad)" strokeWidth={2} name="محادثات" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-card rounded-lg p-5 shadow-card">
              <h3 className="font-semibold text-sm mb-4">أوقات الذروة</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={analyticsData.hourlyDistribution}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 13% 91%)" />
                  <XAxis dataKey="hour" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid hsl(220 13% 91%)", fontSize: 12 }} />
                  <Bar dataKey="count" fill="hsl(217 91% 60%)" radius={[4, 4, 0, 0]} name="محادثات" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Additional charts */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="bg-card rounded-lg p-5 shadow-card">
              <h3 className="font-semibold text-sm mb-4">القنوات</h3>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={channelData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={4} dataKey="value">
                    {channelData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => `${v}%`} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex justify-center gap-4 mt-2">
                {channelData.map((c) => (
                  <div key={c.name} className="flex items-center gap-1.5 text-xs">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
                    <span className="text-muted-foreground">{c.name} {c.value}%</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-card rounded-lg p-5 shadow-card">
              <h3 className="font-semibold text-sm mb-4">متوسط وقت الرد (دقائق)</h3>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={responseTimeData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 13% 91%)" />
                  <XAxis dataKey="day" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis fontSize={10} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                  <Line type="monotone" dataKey="time" stroke="hsl(38 92% 50%)" strokeWidth={2} dot={{ r: 3 }} name="دقائق" />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-card rounded-lg p-5 shadow-card">
              <h3 className="font-semibold text-sm mb-4">رضا العملاء</h3>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={satisfactionData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 13% 91%)" />
                  <XAxis dataKey="day" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis fontSize={10} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="satisfied" fill="hsl(142 64% 42%)" radius={[2, 2, 0, 0]} stackId="a" name="راضي" />
                  <Bar dataKey="neutral" fill="hsl(38 92% 50%)" radius={[0, 0, 0, 0]} stackId="a" name="محايد" />
                  <Bar dataKey="unsatisfied" fill="hsl(0 84% 60%)" radius={[2, 2, 0, 0]} stackId="a" name="غير راضي" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="team" className="space-y-4">
          {/* Team Performance Table */}
          <div className="bg-card rounded-lg shadow-card">
            <div className="p-5 border-b border-border flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              <h3 className="font-semibold text-sm">أداء الفريق</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-right p-4 text-xs font-semibold text-muted-foreground">الموظف</th>
                    <th className="text-right p-4 text-xs font-semibold text-muted-foreground">محادثات نشطة</th>
                    <th className="text-right p-4 text-xs font-semibold text-muted-foreground">متوسط الرد</th>
                    <th className="text-right p-4 text-xs font-semibold text-muted-foreground">تم حلها</th>
                    <th className="text-right p-4 text-xs font-semibold text-muted-foreground">الرضا</th>
                  </tr>
                </thead>
                <tbody>
                  {agents.map((agent) => (
                    <tr key={agent.id} className="border-b border-border last:border-0 hover:bg-secondary/50 transition-colors">
                      <td className="p-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                            {agent.initials}
                          </div>
                          <span className="font-medium">{agent.name}</span>
                        </div>
                      </td>
                      <td className="p-4 font-semibold">{agent.activeChats}</td>
                      <td className="p-4">{agent.avgResponseTime}</td>
                      <td className="p-4 font-semibold">{agent.resolved}</td>
                      <td className="p-4">
                        <span className="text-xs font-bold px-2 py-1 rounded-full bg-success/10 text-success">
                          {agent.satisfaction}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Agent comparison chart */}
          <div className="bg-card rounded-lg p-5 shadow-card">
            <h3 className="font-semibold text-sm mb-4">مقارنة أداء الموظفين</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={analyticsData.teamPerformance} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 13% 91%)" />
                <XAxis type="number" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis dataKey="name" type="category" fontSize={11} tickLine={false} axisLine={false} width={60} />
                <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="conversations" fill="hsl(142 64% 42%)" radius={[0, 4, 4, 0]} name="محادثات" />
                <Bar dataKey="resolved" fill="hsl(217 91% 60%)" radius={[0, 4, 4, 0]} name="تم حلها" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </TabsContent>

        <TabsContent value="reports" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { title: "تقرير المحادثات الأسبوعي", desc: "ملخص شامل لجميع المحادثات والأداء", date: "2026-03-27", type: "أسبوعي" },
              { title: "تقرير رضا العملاء", desc: "تحليل تقييمات العملاء ومعدلات الرضا", date: "2026-03-25", type: "شهري" },
              { title: "تقرير أداء الموظفين", desc: "أوقات الرد والمحادثات المحلولة لكل موظف", date: "2026-03-24", type: "أسبوعي" },
              { title: "تقرير الحملات التسويقية", desc: "نتائج الحملات ومعدلات التوصيل والتفاعل", date: "2026-03-20", type: "شهري" },
              { title: "تقرير القنوات", desc: "مقارنة أداء القنوات المختلفة", date: "2026-03-18", type: "شهري" },
              { title: "تقرير أوقات الذروة", desc: "تحليل ساعات وأيام الضغط العالي", date: "2026-03-15", type: "أسبوعي" },
            ].map((report, i) => (
              <div key={i} className="bg-card rounded-lg p-4 shadow-card border border-border hover:shadow-card-hover transition-shadow">
                <div className="flex items-start justify-between mb-2">
                  <h4 className="font-semibold text-sm">{report.title}</h4>
                  <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full">{report.type}</span>
                </div>
                <p className="text-xs text-muted-foreground mb-3">{report.desc}</p>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">{report.date}</span>
                  <Button variant="outline" size="sm" className="text-xs h-7 gap-1">
                    <Download className="w-3 h-3" /> تحميل PDF
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AnalyticsPage;