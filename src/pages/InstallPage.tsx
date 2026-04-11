import { Smartphone, Monitor, Share, Plus, MoreVertical, Download, Bell, MessageSquare, UserCheck, AtSign, AlertTriangle, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

const InstallPage = () => {
  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-foreground">تثبيت تطبيق Respondly</h1>
          <p className="text-muted-foreground text-sm">
            ثبّت التطبيق على جوالك واستقبل الإشعارات مباشرة
          </p>
        </div>

        {/* iOS Installation */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Smartphone className="w-5 h-5 text-primary" />
              تثبيت على iPhone (iOS)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <Step number={1} icon={<Monitor className="w-4 h-4" />}>
                افتح الرابط في متصفح <strong>Safari</strong> (مهم — لا يعمل من Chrome)
              </Step>
              <Step number={2} icon={<Share className="w-4 h-4" />}>
                اضغط على أيقونة <strong>المشاركة</strong> (⬆️) في الشريط السفلي
              </Step>
              <Step number={3} icon={<Plus className="w-4 h-4" />}>
                اختر <strong>"إضافة إلى الشاشة الرئيسية"</strong> (Add to Home Screen)
              </Step>
              <Step number={4} icon={<Download className="w-4 h-4" />}>
                اضغط <strong>"إضافة"</strong> — سيظهر التطبيق كأيقونة على الشاشة الرئيسية
              </Step>
            </div>
            <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground">
              <strong>ملاحظة:</strong> يتطلب iOS 16.4 أو أحدث لدعم الإشعارات. تأكد من تحديث جهازك.
            </div>
          </CardContent>
        </Card>

        {/* Android Installation */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Smartphone className="w-5 h-5 text-primary" />
              تثبيت على Android
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <Step number={1} icon={<Monitor className="w-4 h-4" />}>
                افتح الرابط في متصفح <strong>Chrome</strong>
              </Step>
              <Step number={2} icon={<MoreVertical className="w-4 h-4" />}>
                اضغط على <strong>القائمة</strong> (⋮) في أعلى المتصفح
              </Step>
              <Step number={3} icon={<Download className="w-4 h-4" />}>
                اختر <strong>"تثبيت التطبيق"</strong> أو <strong>"إضافة إلى الشاشة الرئيسية"</strong>
              </Step>
              <Step number={4} icon={<Plus className="w-4 h-4" />}>
                اضغط <strong>"تثبيت"</strong> — سيعمل كتطبيق مستقل بدون شريط المتصفح
              </Step>
            </div>
            <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground">
              <strong>ملاحظة:</strong> على Samsung، يمكنك أيضاً استخدام متصفح Samsung Internet.
            </div>
          </CardContent>
        </Card>

        <Separator />

        {/* Notifications Section */}
        <div className="space-y-4">
          <div className="text-center space-y-1">
            <h2 className="text-xl font-bold text-foreground flex items-center justify-center gap-2">
              <Bell className="w-5 h-5 text-primary" />
              الإشعارات التي تصلك
            </h2>
            <p className="text-muted-foreground text-sm">
              بعد تثبيت التطبيق وتفعيل الإشعارات، ستصلك تنبيهات فورية عند:
            </p>
          </div>

          <div className="grid gap-3">
            <NotificationCard
              icon={<MessageSquare className="w-5 h-5" />}
              title="رسالة جديدة من عميل"
              description="عند استلام رسالة واتساب أو بريد من عميل وأنت خارج التطبيق"
              badge="فوري"
              badgeVariant="default"
            />
            <NotificationCard
              icon={<UserCheck className="w-5 h-5" />}
              title="إسناد محادثة لك"
              description="عند تحويل محادثة إليك أو إسنادها لفريقك"
              badge="فوري"
              badgeVariant="default"
            />
            <NotificationCard
              icon={<AtSign className="w-5 h-5" />}
              title="منشن (@) في ملاحظة داخلية"
              description="عند ذكر اسمك في ملاحظة داخلية على محادثة"
              badge="فوري"
              badgeVariant="default"
            />
            <NotificationCard
              icon={<AlertTriangle className="w-5 h-5" />}
              title="تجاوز SLA"
              description="عند تجاوز وقت الاستجابة المحدد لمحادثة مسندة إليك"
              badge="تحذير"
              badgeVariant="destructive"
            />
            <NotificationCard
              icon={<Clock className="w-5 h-5" />}
              title="تذكير متابعة"
              description="عند حلول موعد متابعة مجدولة لعميل"
              badge="مجدول"
              badgeVariant="secondary"
            />
          </div>
        </div>

        {/* Enable notifications hint */}
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="pt-4">
            <div className="flex items-start gap-3">
              <Bell className="w-5 h-5 text-primary mt-0.5 shrink-0" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">كيف أفعّل الإشعارات؟</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  بعد تسجيل الدخول، ستظهر رسالة تطلب إذن الإشعارات — اضغط <strong>"سماح"</strong>.
                  إذا رفضت سابقاً، يمكنك تغييرها من إعدادات المتصفح أو إعدادات التطبيق على جوالك.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

const Step = ({ number, icon, children }: { number: number; icon: React.ReactNode; children: React.ReactNode }) => (
  <div className="flex items-start gap-3">
    <span className="w-7 h-7 rounded-full bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center shrink-0 mt-0.5">
      {number}
    </span>
    <div className="flex items-start gap-2 text-sm text-foreground leading-relaxed">
      <span className="text-muted-foreground mt-0.5 shrink-0">{icon}</span>
      <span>{children}</span>
    </div>
  </div>
);

const NotificationCard = ({
  icon,
  title,
  description,
  badge,
  badgeVariant,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  badge: string;
  badgeVariant: "default" | "secondary" | "destructive" | "outline";
}) => (
  <Card>
    <CardContent className="py-3 px-4">
      <div className="flex items-start gap-3">
        <span className="text-primary mt-0.5 shrink-0">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-foreground">{title}</p>
            <Badge variant={badgeVariant} className="text-[10px] px-1.5 py-0">
              {badge}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
      </div>
    </CardContent>
  </Card>
);

export default InstallPage;

