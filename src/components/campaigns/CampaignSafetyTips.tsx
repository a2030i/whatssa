import { AlertTriangle, Shield, Clock, Users, MessageSquare } from "lucide-react";
import { Link } from "react-router-dom";

const tips = [
  { icon: Clock, text: "فعّل التأخير بين الرسائل (8-15 ثانية) لتجنب الحظر", color: "text-warning" },
  { icon: Users, text: "تأكد أن أرقام المستلمين صحيحة ونشطة — الأرقام الخاطئة ترفع معدل الفشل", color: "text-info" },
  { icon: MessageSquare, text: "خصص رسائلك — الرسائل المتشابهة لأعداد كبيرة تُعتبر سبام", color: "text-primary" },
  { icon: Shield, text: "لا تتجاوز 200 رسالة يومياً للأرقام الجديدة — زِد تدريجياً", color: "text-success" },
];

const CampaignSafetyTips = () => {
  return (
    <div className="bg-warning/5 border border-warning/20 rounded-lg p-3 space-y-2">
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-warning" />
        <span className="text-xs font-bold text-foreground">نصائح مهمة قبل الإرسال</span>
        <Link to="/safety-guide" className="text-[10px] text-primary hover:underline mr-auto">
          دليل الحماية ←
        </Link>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {tips.map((tip, i) => (
          <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
            <tip.icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${tip.color}`} />
            <span>{tip.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CampaignSafetyTips;
