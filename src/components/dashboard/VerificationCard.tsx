import { ShieldCheck, ShieldAlert, Clock, ExternalLink, FileText, Mail, Globe, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { DashboardData } from "@/hooks/useDashboardData";
import { Button } from "@/components/ui/button";

type VerificationState = "not_connected" | "not_verified" | "pending" | "verified" | "rejected";

const getState = (data: DashboardData): VerificationState => {
  if (!data.waStatus.phoneNumberId) return "not_connected";
  const bv = data.metaBusinessVerification;
  if (bv === "verified") return "verified";
  if (bv === "pending") return "pending";
  if (bv === "rejected") return "rejected";
  return "not_verified";
};

const tierLabel = (tier: string | null): string => {
  if (!tier) return "غير محدد";
  const map: Record<string, string> = {
    TIER_250: "250 رسالة / يوم",
    TIER_1K: "1,000 رسالة / يوم",
    TIER_10K: "10,000 رسالة / يوم",
    TIER_100K: "100,000 رسالة / يوم",
    UNLIMITED: "غير محدود",
  };
  return map[tier] || tier;
};

const tierIsLow = (tier: string | null) => tier === "TIER_250" || tier === "TIER_1K";

const VerificationCard = ({ data }: { data: DashboardData }) => {
  const state = getState(data);

  // Don't show for unofficial channels or if not connected
  if (data.channelType === "unofficial") return null;
  if (state === "not_connected") return null;

  const openMetaVerification = () => {
    // Direct link to Meta Business Suite verification
    window.open("https://business.facebook.com/settings/security", "_blank");
  };

  return (
    <div className="animate-fade-in">
      {/* === State: Not Verified === */}
      {state === "not_verified" && (
        <div className="bg-card rounded-xl border border-warning/30 shadow-card overflow-hidden">
          <div className="bg-warning/5 border-b border-warning/20 px-5 py-4 flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-warning/10 flex items-center justify-center shrink-0">
              <ShieldAlert className="w-5 h-5 text-warning" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-bold text-foreground">حسابك غير موثق</h3>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                لزيادة عدد الرسائل اليومية وتفادي الإيقاف، فعّل التوثيق (يستغرق دقائق)
              </p>
            </div>
          </div>

          <div className="p-5 space-y-4">
            {/* Current limits */}
            <div className="flex items-center gap-3 bg-muted/50 rounded-lg px-4 py-3">
              <div className="flex-1">
                <p className="text-xs text-muted-foreground">حد الإرسال الحالي</p>
                <p className={cn("text-sm font-bold", tierIsLow(data.metaMessagingLimit) ? "text-warning" : "text-foreground")}>
                  {tierLabel(data.metaMessagingLimit)}
                </p>
              </div>
              <div className="h-8 w-px bg-border" />
              <div className="flex-1">
                <p className="text-xs text-muted-foreground">الحالة</p>
                <p className="text-sm font-bold text-warning">⚠️ غير موثق</p>
              </div>
            </div>

            {/* Requirements */}
            <div>
              <p className="text-xs font-semibold text-foreground mb-2">لرفع حد الإرسال، نحتاج:</p>
              <div className="space-y-2">
                <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
                  <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                    <FileText className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <span>سجل تجاري أو وثيقة نشاط</span>
                </div>
                <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
                  <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                    <Mail className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <span>بريد إلكتروني رسمي (يفضّل على دومين الشركة)</span>
                </div>
                <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
                  <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                    <Globe className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <span>موقع إلكتروني أو حسابات تواصل موثوقة</span>
                </div>
              </div>
            </div>

            {/* CTA */}
            <Button
              onClick={openMetaVerification}
              className="w-full gap-2 bg-primary hover:bg-primary/90 text-primary-foreground"
              size="lg"
            >
              <ShieldCheck className="w-4 h-4" />
              توثيق الحساب الآن
              <ExternalLink className="w-3.5 h-3.5 mr-auto" />
            </Button>
            <p className="text-[11px] text-center text-muted-foreground">
              سيتم توجيهك لمركز أمان Meta لإكمال التوثيق
            </p>
          </div>
        </div>
      )}

      {/* === State: Pending === */}
      {state === "pending" && (
        <div className="bg-card rounded-xl border border-info/30 shadow-card overflow-hidden">
          <div className="bg-info/5 border-b border-info/20 px-5 py-4 flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-info/10 flex items-center justify-center shrink-0">
              <Clock className="w-5 h-5 text-info" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-bold text-foreground">⏳ جاري مراجعة حسابك</h3>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                تم تقديم طلب التوثيق وهو قيد المراجعة من Meta. عادةً يستغرق من يوم إلى 3 أيام عمل.
              </p>
            </div>
          </div>
          <div className="p-5">
            <div className="flex items-center gap-3 bg-muted/50 rounded-lg px-4 py-3">
              <div className="flex-1">
                <p className="text-xs text-muted-foreground">حد الإرسال الحالي</p>
                <p className="text-sm font-bold text-foreground">{tierLabel(data.metaMessagingLimit)}</p>
              </div>
              <div className="h-8 w-px bg-border" />
              <div className="flex-1">
                <p className="text-xs text-muted-foreground">الحالة</p>
                <p className="text-sm font-bold text-info">⏳ قيد المراجعة</p>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground mt-3 text-center">
              يمكنك متابعة الاستخدام بشكل طبيعي أثناء المراجعة. سيتم رفع الحد تلقائيًا بعد الموافقة.
            </p>
          </div>
        </div>
      )}

      {/* === State: Verified === */}
      {state === "verified" && (
        <div className="bg-card rounded-xl border border-success/30 shadow-card overflow-hidden">
          <div className="bg-success/5 border-b border-success/20 px-5 py-4 flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5 text-success" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-bold text-foreground">✅ حسابك موثق</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                تم توثيق نشاطك التجاري بنجاح. حد الإرسال مرتفع.
              </p>
            </div>
          </div>
          <div className="p-5">
            <div className="flex items-center gap-3 bg-muted/50 rounded-lg px-4 py-3">
              <div className="flex-1">
                <p className="text-xs text-muted-foreground">حد الإرسال</p>
                <p className="text-sm font-bold text-success">{tierLabel(data.metaMessagingLimit)}</p>
              </div>
              <div className="h-8 w-px bg-border" />
              <div className="flex-1">
                <p className="text-xs text-muted-foreground">جودة الرقم</p>
                <p className={cn("text-sm font-bold",
                  data.metaQualityRating === "GREEN" ? "text-success" :
                  data.metaQualityRating === "YELLOW" ? "text-warning" : "text-destructive"
                )}>
                  {data.metaQualityRating === "GREEN" ? "عالية ✅" :
                   data.metaQualityRating === "YELLOW" ? "متوسطة ⚠️" :
                   data.metaQualityRating === "RED" ? "منخفضة ❌" : "غير محدد"}
                </p>
              </div>
              <div className="h-8 w-px bg-border" />
              <div className="flex-1">
                <p className="text-xs text-muted-foreground">الحالة</p>
                <p className="text-sm font-bold text-success">✅ موثق</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* === State: Rejected === */}
      {state === "rejected" && (
        <div className="bg-card rounded-xl border border-destructive/30 shadow-card overflow-hidden">
          <div className="bg-destructive/5 border-b border-destructive/20 px-5 py-4 flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0">
              <ShieldAlert className="w-5 h-5 text-destructive" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-bold text-foreground">❌ تم رفض طلب التوثيق</h3>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                يرجى مراجعة المستندات المقدمة والتأكد من صحتها ثم إعادة التقديم.
              </p>
            </div>
          </div>
          <div className="p-5 space-y-3">
            <div className="flex items-center gap-3 bg-muted/50 rounded-lg px-4 py-3">
              <div className="flex-1">
                <p className="text-xs text-muted-foreground">حد الإرسال الحالي</p>
                <p className="text-sm font-bold text-destructive">{tierLabel(data.metaMessagingLimit)}</p>
              </div>
              <div className="h-8 w-px bg-border" />
              <div className="flex-1">
                <p className="text-xs text-muted-foreground">الحالة</p>
                <p className="text-sm font-bold text-destructive">❌ مرفوض</p>
              </div>
            </div>
            <Button
              onClick={openMetaVerification}
              variant="outline"
              className="w-full gap-2 border-destructive/30 text-destructive hover:bg-destructive/5"
              size="lg"
            >
              <ShieldCheck className="w-4 h-4" />
              إعادة تقديم التوثيق
              <ExternalLink className="w-3.5 h-3.5 mr-auto" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default VerificationCard;
