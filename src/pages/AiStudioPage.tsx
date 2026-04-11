import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { invokeCloud } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Brain, Bot, BarChart3, Target, Sparkles, Loader2, Copy, CheckCircle } from "lucide-react";
import ReactMarkdown from "react-markdown";

const AiStudioPage = () => {
  const { orgId } = useAuth();
  const [loading, setLoading] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);

  // Bot Analysis state
  const [analysisDays, setAnalysisDays] = useState("7");

  // Bot Advisor state
  const [bizDescription, setBizDescription] = useState("");
  const [bizType, setBizType] = useState("");
  const [bizGoals, setBizGoals] = useState("");

  // Smart Report state
  const [reportPeriod, setReportPeriod] = useState("week");

  // Intent Detection state
  const [intentMessage, setIntentMessage] = useState("");

  const callAiAdvanced = async (action: string, params: Record<string, any>) => {
    setLoading(action);
    try {
      const { data, error } = await invokeCloud("ai-advanced", {
        body: { action, ...params },
      });
      if (error || data?.error) {
        const errMsg = data?.error || "فشل الاتصال بالذكاء الاصطناعي";
        if (errMsg === "ai_not_configured") {
          toast.error("لم يتم إعداد مزود AI — اذهب لإعدادات الذكاء الاصطناعي");
        } else {
          toast.error(errMsg);
        }
        return;
      }
      const result = data?.analysis || data?.plan || data?.report || data?.suggested_reply || JSON.stringify(data, null, 2);
      setResults(prev => ({ ...prev, [action]: result }));
      toast.success("✨ تم التحليل بنجاح");
    } catch (e) {
      toast.error("فشل الاتصال بالخادم");
    }
    setLoading(null);
  };

  const copyResult = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("تم النسخ");
    setTimeout(() => setCopied(false), 2000);
  };

  const ResultBlock = ({ action }: { action: string }) => {
    const result = results[action];
    if (!result) return null;
    return (
      <div className="mt-4 bg-secondary/30 border border-border rounded-xl p-4 relative">
        <Button
          size="sm"
          variant="ghost"
          className="absolute top-2 left-2 h-7 w-7 p-0"
          onClick={() => copyResult(result)}
        >
          {copied ? <CheckCircle className="w-3.5 h-3.5 text-primary" /> : <Copy className="w-3.5 h-3.5" />}
        </Button>
        <div className="prose prose-sm max-w-none text-foreground text-[13px] leading-relaxed" dir="rtl">
          <ReactMarkdown>{result}</ReactMarkdown>
        </div>
      </div>
    );
  };

  return (
    <div className="p-3 md:p-6 space-y-5 max-w-[900px] mx-auto" dir="rtl">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          استوديو AI
        </h1>
        <p className="text-sm text-muted-foreground mt-1">أدوات ذكاء اصطناعي متقدمة لتحسين أعمالك</p>
      </div>

      <Tabs defaultValue="analyze" dir="rtl">
        <TabsList className="w-full grid grid-cols-4">
          <TabsTrigger value="analyze" className="gap-1 text-xs">
            <Bot className="w-3.5 h-3.5" /> تحليل → بوت
          </TabsTrigger>
          <TabsTrigger value="advisor" className="gap-1 text-xs">
            <Brain className="w-3.5 h-3.5" /> مستشار
          </TabsTrigger>
          <TabsTrigger value="report" className="gap-1 text-xs">
            <BarChart3 className="w-3.5 h-3.5" /> تقرير ذكي
          </TabsTrigger>
          <TabsTrigger value="intent" className="gap-1 text-xs">
            <Target className="w-3.5 h-3.5" /> كشف النية
          </TabsTrigger>
        </TabsList>

        {/* ── Analyze Conversations → Bot Scenario ── */}
        <TabsContent value="analyze" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Bot className="w-4 h-4 text-primary" />
                تحليل المحادثات → سيناريو بوت
              </CardTitle>
              <CardDescription className="text-xs">
                يحلل AI محادثاتك الأخيرة ويقترح تدفق شات بوت مثالي بناءً على الأسئلة المتكررة
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">فترة التحليل</Label>
                <Select value={analysisDays} onValueChange={setAnalysisDays}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="3">آخر 3 أيام</SelectItem>
                    <SelectItem value="7">آخر أسبوع</SelectItem>
                    <SelectItem value="14">آخر أسبوعين</SelectItem>
                    <SelectItem value="30">آخر شهر</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={() => callAiAdvanced("analyze_for_bot", { days: parseInt(analysisDays) })}
                disabled={loading === "analyze_for_bot"}
                className="w-full gap-2"
              >
                {loading === "analyze_for_bot" ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> جاري التحليل...</>
                ) : (
                  <><Sparkles className="w-4 h-4" /> تحليل واقتراح سيناريو</>
                )}
              </Button>
              <ResultBlock action="analyze_for_bot" />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Bot Advisor ── */}
        <TabsContent value="advisor" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Brain className="w-4 h-4 text-primary" />
                مستشار الشات بوت
              </CardTitle>
              <CardDescription className="text-xs">
                أعطِ AI وصف نشاطك التجاري وسيقترح خطة بوت احترافية كاملة
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">وصف النشاط التجاري *</Label>
                <Textarea
                  value={bizDescription}
                  onChange={(e) => setBizDescription(e.target.value)}
                  placeholder="مثال: متجر إلكتروني لبيع الملابس النسائية، نقدم خدمة التوصيل لجميع مدن المملكة..."
                  className="text-sm min-h-[80px]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">نوع النشاط</Label>
                  <Input
                    value={bizType}
                    onChange={(e) => setBizType(e.target.value)}
                    placeholder="مثال: تجارة إلكترونية"
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">الأهداف</Label>
                  <Input
                    value={bizGoals}
                    onChange={(e) => setBizGoals(e.target.value)}
                    placeholder="مثال: تقليل وقت الاستجابة"
                    className="h-9 text-sm"
                  />
                </div>
              </div>
              <Button
                onClick={() => callAiAdvanced("bot_advisor", {
                  business_description: bizDescription,
                  business_type: bizType,
                  goals: bizGoals,
                })}
                disabled={loading === "bot_advisor" || !bizDescription.trim()}
                className="w-full gap-2"
              >
                {loading === "bot_advisor" ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> جاري إعداد الخطة...</>
                ) : (
                  <><Brain className="w-4 h-4" /> اقتراح خطة بوت</>
                )}
              </Button>
              <ResultBlock action="bot_advisor" />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Smart Report ── */}
        <TabsContent value="report" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-primary" />
                تقرير أداء ذكي
              </CardTitle>
              <CardDescription className="text-xs">
                تقرير شامل مع توصيات عملية بناءً على بيانات محادثاتك الفعلية
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">فترة التقرير</Label>
                <Select value={reportPeriod} onValueChange={setReportPeriod}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="week">أسبوعي</SelectItem>
                    <SelectItem value="month">شهري</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={() => callAiAdvanced("smart_report", { period: reportPeriod })}
                disabled={loading === "smart_report"}
                className="w-full gap-2"
              >
                {loading === "smart_report" ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> جاري إنشاء التقرير...</>
                ) : (
                  <><BarChart3 className="w-4 h-4" /> إنشاء تقرير ذكي</>
                )}
              </Button>
              <ResultBlock action="smart_report" />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Intent Detection ── */}
        <TabsContent value="intent" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Target className="w-4 h-4 text-primary" />
                كشف نية العميل
              </CardTitle>
              <CardDescription className="text-xs">
                حلل رسالة العميل لتحديد نيته ومشاعره والإجراء المقترح
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">رسالة العميل</Label>
                <Textarea
                  value={intentMessage}
                  onChange={(e) => setIntentMessage(e.target.value)}
                  placeholder="الصق رسالة العميل هنا للتحليل..."
                  className="text-sm min-h-[80px]"
                />
              </div>
              <Button
                onClick={() => callAiAdvanced("detect_intent", { message_text: intentMessage })}
                disabled={loading === "detect_intent" || !intentMessage.trim()}
                className="w-full gap-2"
              >
                {loading === "detect_intent" ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> جاري التحليل...</>
                ) : (
                  <><Target className="w-4 h-4" /> تحليل النية</>
                )}
              </Button>
              <ResultBlock action="detect_intent" />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
        <p className="text-[10px] text-muted-foreground">
          💡 كل تحليل يستهلك وحدة AI واحدة. النتائج مبنية على بياناتك الفعلية ولا يتم تخزينها أو مشاركتها.
        </p>
      </div>
    </div>
  );
};

export default AiStudioPage;

