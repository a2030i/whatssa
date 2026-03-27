import { Plus, Megaphone, Send, Clock, FileText, AlertCircle } from "lucide-react";
import { campaigns } from "@/data/mockData";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

const statusConfig = {
  draft: { label: "مسودة", icon: FileText, className: "bg-muted text-muted-foreground" },
  scheduled: { label: "مجدولة", icon: Clock, className: "bg-info/10 text-info" },
  sent: { label: "تم الإرسال", icon: Send, className: "bg-success/10 text-success" },
  failed: { label: "فشل", icon: AlertCircle, className: "bg-destructive/10 text-destructive" },
};

const CampaignsPage = () => {
  return (
    <div className="p-6 space-y-6 max-w-[1000px]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">الحملات</h1>
          <p className="text-sm text-muted-foreground mt-1">إدارة حملات WhatsApp وتتبع نتائجها</p>
        </div>
        <Button className="gap-2">
          <Plus className="w-4 h-4" />
          حملة جديدة
        </Button>
      </div>

      <div className="space-y-3">
        {campaigns.map((campaign) => {
          const status = statusConfig[campaign.status];
          const deliveryRate = campaign.sent > 0 ? Math.round((campaign.delivered / campaign.sent) * 100) : 0;

          return (
            <div key={campaign.id} className="bg-card rounded-lg p-5 shadow-card hover:shadow-card-hover transition-shadow animate-fade-in">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                    <Megaphone className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{campaign.name}</h3>
                    <p className="text-xs text-muted-foreground">
                      {campaign.sentAt ? `أُرسلت: ${campaign.sentAt}` : campaign.scheduledAt ? `مجدولة: ${campaign.scheduledAt}` : "لم تُجدول بعد"}
                    </p>
                  </div>
                </div>
                <Badge className={cn("border-0 text-xs", status.className)}>
                  <status.icon className="w-3 h-3 ml-1" />
                  {status.label}
                </Badge>
              </div>

              <div className="grid grid-cols-4 gap-4 text-center">
                <div>
                  <p className="text-lg font-bold">{campaign.audience.toLocaleString()}</p>
                  <p className="text-[10px] text-muted-foreground">الجمهور</p>
                </div>
                <div>
                  <p className="text-lg font-bold">{campaign.sent.toLocaleString()}</p>
                  <p className="text-[10px] text-muted-foreground">مُرسلة</p>
                </div>
                <div>
                  <p className="text-lg font-bold">{campaign.delivered.toLocaleString()}</p>
                  <p className="text-[10px] text-muted-foreground">تم التوصيل</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-destructive">{campaign.failed.toLocaleString()}</p>
                  <p className="text-[10px] text-muted-foreground">فشل</p>
                </div>
              </div>

              {campaign.sent > 0 && (
                <div className="mt-3">
                  <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                    <span>معدل التوصيل</span>
                    <span>{deliveryRate}%</span>
                  </div>
                  <Progress value={deliveryRate} className="h-1.5" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CampaignsPage;
