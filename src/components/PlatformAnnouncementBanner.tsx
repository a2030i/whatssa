import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { X, Info, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Announcement {
  id: string;
  title_ar: string | null;
  content_ar: string | null;
  type: string;
  is_dismissible: boolean;
}

const TYPE_STYLES: Record<string, { bg: string; border: string; icon: any; iconColor: string }> = {
  info:    { bg: "bg-blue-50",   border: "border-blue-200",   icon: Info,          iconColor: "text-blue-500" },
  warning: { bg: "bg-amber-50",  border: "border-amber-200",  icon: AlertTriangle, iconColor: "text-amber-500" },
  success: { bg: "bg-green-50",  border: "border-green-200",  icon: CheckCircle2,  iconColor: "text-green-500" },
  error:   { bg: "bg-red-50",    border: "border-red-200",    icon: XCircle,       iconColor: "text-red-500" },
};

const DISMISSED_KEY = "dismissed_announcements";

const PlatformAnnouncementBanner = () => {
  const { orgId, isSuperAdmin } = useAuth();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(DISMISSED_KEY) || "[]")); }
    catch { return new Set(); }
  });

  useEffect(() => {
    if (!orgId && !isSuperAdmin) return;
    supabase
      .from("platform_announcements")
      .select("id, title_ar, content_ar, type, is_dismissible")
      .eq("is_active", true)
      .then(({ data }) => setAnnouncements(data || []));
  }, [orgId, isSuperAdmin]);

  const dismiss = (id: string) => {
    const next = new Set(dismissed).add(id);
    setDismissed(next);
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...next]));
  };

  const visible = announcements.filter(a => !dismissed.has(a.id));
  if (visible.length === 0) return null;

  return (
    <div className="space-y-1.5 px-4 pt-3">
      {visible.map(ann => {
        const style = TYPE_STYLES[ann.type] || TYPE_STYLES.info;
        const Icon = style.icon;
        return (
          <div key={ann.id} className={cn("flex items-start gap-3 px-4 py-3 rounded-xl border", style.bg, style.border)} dir="rtl">
            <Icon className={cn("w-4 h-4 shrink-0 mt-0.5", style.iconColor)} />
            <div className="flex-1 min-w-0">
              {ann.title_ar && <p className="text-sm font-semibold text-gray-800">{ann.title_ar}</p>}
              {ann.content_ar && <p className="text-xs text-gray-600 mt-0.5">{ann.content_ar}</p>}
            </div>
            {ann.is_dismissible && (
              <button onClick={() => dismiss(ann.id)} className="shrink-0 text-gray-400 hover:text-gray-600 transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default PlatformAnnouncementBanner;
