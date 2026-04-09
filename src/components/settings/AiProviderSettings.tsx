import { useEffect, useState } from "react";
import { supabase, invokeCloud } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Brain, Save, Eye, EyeOff, Trash2, Plus, CheckCircle2,
  AlertTriangle, MessageSquare, FileText, BarChart3, Zap, RefreshCw
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const providers = [
  {
    key: "lovable_ai",
    label: "Lovable AI",
    logo: "✨",
    description: "مدعوم من المنصة — يتم تفعيله من الإدارة",
    placeholder: "يتم إدارته من المنصة",
    managed: true,
    models: [
      { value: "google/gemini-3-flash-preview", label: "Gemini Flash (سريع)" },
      { value: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash (متوازن)" },
      { value: "google/gemini-2.5-pro", label: "Gemini Pro (متقدم)" },
      { value: "openai/gpt-5-mini", label: "GPT-5 Mini" },
    ],
    docsUrl: "",
  },
  {
    key: "openai",
    label: "OpenAI",
    logo: "🤖",
    description: "GPT-4o, GPT-4o mini وغيرها",
    placeholder: "sk-...",
    models: [
      { value: "gpt-4o-mini", label: "GPT-4o Mini (اقتصادي)" },
      { value: "gpt-4o", label: "GPT-4o (متقدم)" },
      { value: "gpt-4-turbo", label: "GPT-4 Turbo" },
      { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo (أرخص)" },
    ],
    docsUrl: "https://platform.openai.com/api-keys",
  },
  {
    key: "gemini",
    label: "Google Gemini",
    logo: "💎",
    description: "Gemini Pro, Flash وغيرها",
    placeholder: "AIza...",
    models: [
      { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash (سريع)" },
      { value: "gemini-1.5-pro", label: "Gemini 1.5 Pro (متقدم)" },
      { value: "gemini-1.5-flash", label: "Gemini 1.5 Flash (اقتصادي)" },
    ],
    docsUrl: "https://aistudio.google.com/apikey",
  },
  {
    key: "openrouter",
    label: "OpenRouter",
    logo: "🔀",
    description: "وصول لعشرات النماذج من مكان واحد",
    placeholder: "sk-or-...",
    models: [
      { value: "anthropic/claude-3.5-sonnet", label: "Claude 3.5 Sonnet" },
      { value: "google/gemini-2.0-flash-exp:free", label: "Gemini 2.0 Flash (مجاني)" },
      { value: "meta-llama/llama-3.1-70b-instruct", label: "Llama 3.1 70B" },
      { value: "openai/gpt-4o-mini", label: "GPT-4o Mini" },
    ],
    docsUrl: "https://openrouter.ai/keys",
  },
];

const capabilities = [
  { key: "chat_reply", label: "رد ذكي على المحادثات", icon: MessageSquare, description: "AI يقترح ردود ذكية بناءً على سياق المحادثة" },
  { key: "auto_reply", label: "رد تلقائي بالمعرفة", icon: Zap, description: "AI يرد تلقائياً من قاعدة معرفة المؤسسة" },
  { key: "conversation_summary", label: "تلخيص المحادثات", icon: FileText, description: "ملخص آلي لكل محادثة عند إغلاقها" },
  { key: "smart_analysis", label: "تحليل ذكي", icon: BarChart3, description: "تحليل الطلبات والمبيعات والأداء" },
];

interface AiConfig {
  id: string;
  provider: string;
  api_key: string;
  model: string;
  is_active: boolean;
  settings: Record<string, any>;
  capabilities: Record<string, boolean>;
}

const AiProviderSettings = () => {
  const { orgId, isSuperAdmin } = useAuth();
  const [configs, setConfigs] = useState<AiConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newProvider, setNewProvider] = useState("openai");
  const [lovableAiEnabled, setLovableAiEnabled] = useState(false);

  useEffect(() => {
    if (orgId) {
      loadConfigs();
      checkLovableAiEnabled();
    }
  }, [orgId]);

  const checkLovableAiEnabled = async () => {
    // Check if Lovable AI is enabled for this org
    const { data } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", `lovable_ai_enabled_${orgId}`)
      .maybeSingle();
    const val = data?.value;
    setLovableAiEnabled(val === true || val === "true" || val === 1);
  };

  const loadConfigs = async () => {
    setIsLoading(true);
    const { data } = await supabase
      .from("ai_provider_configs" as any)
      .select("*")
      .eq("org_id", orgId)
      .order("created_at");
    setConfigs((data || []) as any);
    setIsLoading(false);
  };

  const addProvider = async () => {
    const providerInfo = providers.find(p => p.key === newProvider);
    if (!providerInfo) return;

    const existing = configs.find(c => c.provider === newProvider);
    if (existing) {
      toast.error(`مزود ${providerInfo.label} مضاف مسبقاً`);
      return;
    }

    const isManaged = (providerInfo as any).managed;
    const { error } = await supabase.from("ai_provider_configs" as any).insert({
      org_id: orgId,
      provider: newProvider,
      api_key: isManaged ? "MANAGED_BY_PLATFORM" : "",
      model: providerInfo.models[0].value,
      is_active: isManaged,
      capabilities: { chat_reply: true, conversation_summary: false, smart_analysis: false },
    } as any);
    if (error) {
      toast.error("فشل إضافة المزود");
    } else {
      toast.success(`تم إضافة ${providerInfo.label}`);
      setAdding(false);
      loadConfigs();
    }
  };

  const updateConfig = async (id: string, updates: Partial<AiConfig>) => {
    const { error } = await supabase
      .from("ai_provider_configs" as any)
      .update({ ...updates, updated_at: new Date().toISOString() } as any)
      .eq("id", id);
    if (error) {
      toast.error("فشل الحفظ");
    } else {
      toast.success("تم الحفظ");
      loadConfigs();
    }
  };

  const deleteConfig = async (id: string) => {
    const { error } = await supabase
      .from("ai_provider_configs" as any)
      .delete()
      .eq("id", id);
    if (error) {
      toast.error("فشل الحذف");
    } else {
      toast.success("تم حذف المزود");
      loadConfigs();
    }
  };

  const testConnection = async (config: AiConfig) => {
    if (!config.api_key) {
      toast.error("أدخل مفتاح API أولاً");
      return;
    }
    setTesting(config.id);
    try {
      const { data, error } = await invokeCloud("ai-proxy", {
        body: {
          action: "test",
          provider: config.provider,
          api_key: config.api_key,
          model: config.model,
        },
      });
      if (error || data?.error) {
        toast.error(data?.error || "فشل الاتصال — تحقق من المفتاح");
      } else {
        toast.success("✅ الاتصال ناجح! المزود جاهز للاستخدام");
        if (!config.is_active) {
          updateConfig(config.id, { is_active: true });
        }
      }
    } catch {
      toast.error("فشل الاتصال بالخادم");
    }
    setTesting(null);
  };

  const setLocalConfig = (id: string, key: string, value: any) => {
    setConfigs(prev => prev.map(c => c.id === id ? { ...c, [key]: value } : c));
  };

  const setCapability = (id: string, capKey: string, value: boolean) => {
    setConfigs(prev => prev.map(c => {
      if (c.id !== id) return c;
      return { ...c, capabilities: { ...c.capabilities, [capKey]: value } };
    }));
  };

  const maskedKey = (key: string) => {
    if (!key) return "";
    if (key.length < 8) return "••••••••";
    return key.substring(0, 4) + "••••••••" + key.substring(key.length - 4);
  };

  const usedProviders = configs.map(c => c.provider);
  const availableProviders = providers.filter(p => {
    if (usedProviders.includes(p.key)) return false;
    // Lovable AI available if: super admin enabled it for this org, OR user is super admin
    if (p.key === "lovable_ai" && !lovableAiEnabled && !isSuperAdmin) return false;
    return true;
  });

  return (
    <div className="bg-card rounded-lg shadow-card">
      <div className="p-5 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm">مزود الذكاء الاصطناعي</h3>
        </div>
        {availableProviders.length > 0 && !adding && (
          <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => setAdding(true)}>
            <Plus className="w-3 h-3" /> إضافة مزود
          </Button>
        )}
      </div>

      {/* Add provider */}
      {adding && (
        <div className="p-5 border-b border-border bg-secondary/30">
          <div className="flex items-center gap-3">
            <Select value={newProvider} onValueChange={setNewProvider}>
              <SelectTrigger className="w-48 h-9 text-sm bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableProviders.map(p => (
                  <SelectItem key={p.key} value={p.key}>
                    <span className="flex items-center gap-2">
                      <span>{p.logo}</span>
                      <span>{p.label}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={addProvider} className="gap-1">
              <Plus className="w-3 h-3" /> إضافة
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>إلغاء</Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="p-8 text-center text-muted-foreground text-sm">جاري التحميل...</div>
      ) : configs.length === 0 ? (
        <div className="p-8 text-center">
          <Brain className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-sm font-medium text-muted-foreground">لم يتم إعداد مزود AI بعد</p>
          <p className="text-xs text-muted-foreground mt-1">أضف مزود ذكاء اصطناعي واستخدم مفتاح API الخاص بك — التكلفة على حسابك مباشرة</p>
          {!adding && (
            <Button size="sm" variant="outline" className="mt-4 gap-1" onClick={() => setAdding(true)}>
              <Plus className="w-3 h-3" /> إضافة مزود
            </Button>
          )}
        </div>
      ) : (
        <div className="divide-y divide-border">
          {configs.map((config) => {
            const providerInfo = providers.find(p => p.key === config.provider);
            if (!providerInfo) return null;
            const isKeyVisible = showKeys[config.id];

            return (
              <div key={config.id} className="p-5 space-y-4">
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{providerInfo.logo}</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold">{providerInfo.label}</p>
                        {config.is_active && config.api_key && (
                          <span className="flex items-center gap-1 text-[10px] text-green-600 bg-green-500/10 px-2 py-0.5 rounded-full">
                            <CheckCircle2 className="w-3 h-3" /> مفعّل
                          </span>
                        )}
                        {!config.api_key && (
                          <span className="flex items-center gap-1 text-[10px] text-yellow-600 bg-yellow-500/10 px-2 py-0.5 rounded-full">
                            <AlertTriangle className="w-3 h-3" /> يحتاج إعداد
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground">{providerInfo.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={config.is_active}
                      onCheckedChange={(v) => updateConfig(config.id, { is_active: v })}
                      disabled={!config.api_key}
                    />
                    <button
                      onClick={() => deleteConfig(config.id)}
                      className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* API Key - hide for managed providers */}
                {(providerInfo as any).managed ? (
                  <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
                    <p className="text-xs text-primary font-medium">✨ مُدار من المنصة — لا يحتاج مفتاح API</p>
                    <p className="text-[10px] text-muted-foreground mt-1">يتم احتساب الاستهلاك على وحدات المنصة</p>
                  </div>
                ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">مفتاح API</Label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Input
                          type={isKeyVisible ? "text" : "password"}
                          value={config.api_key}
                          onChange={(e) => setLocalConfig(config.id, "api_key", e.target.value)}
                          placeholder={providerInfo.placeholder}
                          className="h-9 text-sm font-mono bg-secondary border-0 pl-9"
                          dir="ltr"
                        />
                        <button
                          type="button"
                          onClick={() => setShowKeys(prev => ({ ...prev, [config.id]: !prev[config.id] }))}
                          className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {isKeyVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-9 gap-1"
                        onClick={() => updateConfig(config.id, { api_key: config.api_key })}
                      >
                        <Save className="w-3 h-3" />
                      </Button>
                    </div>
                    <a
                      href={providerInfo.docsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[10px] text-primary hover:underline"
                    >
                      كيف أحصل على المفتاح؟ ←
                    </a>
                  </div>

                  {/* Model Selection */}
                  <div className="space-y-1.5">
                    <Label className="text-xs">النموذج</Label>
                    <div className="flex gap-2">
                      <Select
                        value={config.model}
                        onValueChange={(v) => setLocalConfig(config.id, "model", v)}
                      >
                        <SelectTrigger className="h-9 text-sm bg-secondary border-0 flex-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {providerInfo.models.map(m => (
                            <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-9 gap-1"
                        onClick={() => updateConfig(config.id, { model: config.model })}
                      >
                        <Save className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </div>
                )}

                {/* Test Connection */}
                <div className="flex items-center gap-3">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-xs"
                    onClick={() => testConnection(config)}
                    disabled={testing === config.id || !config.api_key}
                  >
                    {testing === config.id ? (
                      <><RefreshCw className="w-3 h-3 animate-spin" /> جاري الاختبار...</>
                    ) : (
                      <><Zap className="w-3 h-3" /> اختبار الاتصال</>
                    )}
                  </Button>
                </div>

                {/* Capabilities */}
                <div className="space-y-2">
                  <Label className="text-xs font-semibold">الميزات المفعّلة</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {capabilities.map(cap => {
                      const Icon = cap.icon;
                      const isEnabled = config.capabilities?.[cap.key] ?? false;
                      return (
                        <button
                          key={cap.key}
                          onClick={() => {
                            setCapability(config.id, cap.key, !isEnabled);
                            updateConfig(config.id, {
                              capabilities: { ...config.capabilities, [cap.key]: !isEnabled }
                            });
                          }}
                          className={cn(
                            "p-3 rounded-xl border text-right transition-all",
                            isEnabled
                              ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                              : "border-border bg-secondary/30 hover:border-primary/30"
                          )}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <Icon className={cn("w-3.5 h-3.5", isEnabled ? "text-primary" : "text-muted-foreground")} />
                            <span className={cn("text-xs font-medium", isEnabled ? "text-foreground" : "text-muted-foreground")}>
                              {cap.label}
                            </span>
                          </div>
                          <p className="text-[10px] text-muted-foreground leading-relaxed">{cap.description}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Info Footer */}
      <div className="p-4 bg-secondary/30 border-t border-border">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
          <div className="text-[11px] text-muted-foreground leading-relaxed space-y-1">
            <p>تكاليف استخدام AI تُخصم مباشرة من حسابك لدى المزود — المنصة لا تتحمل أي تكلفة.</p>
            <p>مفتاح API مخزّن بشكل آمن ولا يظهر لأي شخص آخر.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AiProviderSettings;
