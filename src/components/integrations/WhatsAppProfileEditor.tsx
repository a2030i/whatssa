import { useState, useEffect } from "react";
import {
  User, Globe, Mail, MapPin, FileText, Clock, Loader2,
  Save, Image, Building2, Link2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase, invokeCloud } from "@/lib/supabase";
import { toast } from "sonner";

interface Props {
  configId: string;
  channelType: "meta_api" | "evolution";
}

interface MetaProfile {
  about: string;
  address: string;
  description: string;
  email: string;
  profile_picture_url: string;
  websites: string[];
  vertical: string;
}

interface EvolutionProfile {
  about: string;
  name: string;
  profile_picture_url: string;
}

const VERTICALS = [
  { value: "", label: "بدون تحديد" },
  { value: "AUTOMOTIVE", label: "سيارات" },
  { value: "BEAUTY", label: "تجميل" },
  { value: "APPAREL", label: "ملابس" },
  { value: "EDU", label: "تعليم" },
  { value: "ENTERTAIN", label: "ترفيه" },
  { value: "EVENT_PLAN", label: "تنظيم فعاليات" },
  { value: "FINANCE", label: "مالية" },
  { value: "GROCERY", label: "بقالة" },
  { value: "GOVT", label: "حكومي" },
  { value: "HOTEL", label: "فنادق" },
  { value: "HEALTH", label: "صحة" },
  { value: "NONPROFIT", label: "غير ربحي" },
  { value: "PROF_SERVICES", label: "خدمات مهنية" },
  { value: "RETAIL", label: "تجزئة" },
  { value: "TRAVEL", label: "سفر" },
  { value: "RESTAURANT", label: "مطاعم" },
  { value: "OTHER", label: "أخرى" },
];

const WhatsAppProfileEditor = ({ configId, channelType }: Props) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<MetaProfile | EvolutionProfile | null>(null);

  // Meta fields
  const [about, setAbout] = useState("");
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState("");
  const [website1, setWebsite1] = useState("");
  const [website2, setWebsite2] = useState("");
  const [vertical, setVertical] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");

  // Evolution fields
  const [displayName, setDisplayName] = useState("");

  const fetchProfile = async () => {
    setLoading(true);
    try {
      const { data, error } = await invokeCloud("whatsapp-profile", {
        body: { action: "get", config_id: configId },
      });
      if (error || !data?.success) {
        toast.error(data?.error || "فشل جلب البيانات");
        setLoading(false);
        return;
      }
      setProfile(data.profile);
      if (channelType === "meta_api") {
        const p = data.profile as MetaProfile;
        setAbout(p.about || "");
        setDescription(p.description || "");
        setAddress(p.address || "");
        setEmail(p.email || "");
        setWebsite1(p.websites?.[0] || "");
        setWebsite2(p.websites?.[1] || "");
        setVertical(p.vertical || "");
        setPhotoUrl(p.profile_picture_url || "");
      } else {
        const p = data.profile as EvolutionProfile;
        setAbout(p.about || "");
        setDisplayName(p.name || "");
        setPhotoUrl(p.profile_picture_url || "");
      }
    } catch {
      toast.error("خطأ في الاتصال");
    }
    setLoading(false);
  };

  useEffect(() => {
    if (open) fetchProfile();
  }, [open]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const profileData: Record<string, any> = { about };

      if (channelType === "meta_api") {
        profileData.description = description;
        profileData.address = address;
        profileData.email = email;
        profileData.vertical = vertical;
        const websites: string[] = [];
        if (website1.trim()) websites.push(website1.trim());
        if (website2.trim()) websites.push(website2.trim());
        profileData.websites = websites;
      } else {
        profileData.name = displayName;
      }

      const { data, error } = await invokeCloud("whatsapp-profile", {
        body: { action: "update", config_id: configId, profile_data: profileData },
      });
      if (error || !data?.success) {
        toast.error(data?.error || "فشل الحفظ");
      } else {
        toast.success("تم حفظ الملف الشخصي بنجاح");
      }
    } catch {
      toast.error("خطأ في الاتصال");
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="text-xs h-7 gap-1">
          <User className="w-3 h-3" /> الملف الشخصي
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <User className="w-4 h-4 text-primary" />
            تعديل الملف الشخصي للواتساب
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-4 pt-2">
            {/* Profile Picture */}
            {photoUrl && (
              <div className="flex justify-center">
                <img
                  src={photoUrl}
                  alt="Profile"
                  className="w-20 h-20 rounded-full object-cover border-2 border-border"
                />
              </div>
            )}

            {/* About / Status */}
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1.5">
                <FileText className="w-3 h-3 text-muted-foreground" />
                النبذة التعريفية
                {channelType === "meta_api" && (
                  <span className="text-[10px] text-muted-foreground">(139 حرف)</span>
                )}
              </Label>
              <Input
                value={about}
                onChange={(e) => setAbout(e.target.value)}
                placeholder="مثال: خدمة عملاء على مدار الساعة"
                maxLength={channelType === "meta_api" ? 139 : 500}
                className="text-xs"
              />
              {channelType === "meta_api" && (
                <p className="text-[10px] text-muted-foreground text-left" dir="ltr">
                  {about.length}/139
                </p>
              )}
            </div>

            {/* Evolution: Display Name */}
            {channelType === "evolution" && (
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1.5">
                  <User className="w-3 h-3 text-muted-foreground" />
                  الاسم المعروض
                </Label>
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="اسم النشاط التجاري"
                  className="text-xs"
                />
              </div>
            )}

            {/* Meta-only fields */}
            {channelType === "meta_api" && (
              <>
                {/* Description */}
                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1.5">
                    <Building2 className="w-3 h-3 text-muted-foreground" />
                    وصف النشاط
                    <span className="text-[10px] text-muted-foreground">(512 حرف)</span>
                  </Label>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="وصف تفصيلي لنشاطك التجاري..."
                    maxLength={512}
                    className="text-xs min-h-[60px]"
                  />
                  <p className="text-[10px] text-muted-foreground text-left" dir="ltr">
                    {description.length}/512
                  </p>
                </div>

                {/* Address */}
                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1.5">
                    <MapPin className="w-3 h-3 text-muted-foreground" />
                    العنوان
                  </Label>
                  <Input
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="الرياض، المملكة العربية السعودية"
                    className="text-xs"
                  />
                </div>

                {/* Email */}
                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1.5">
                    <Mail className="w-3 h-3 text-muted-foreground" />
                    البريد الإلكتروني
                  </Label>
                  <Input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="info@example.com"
                    type="email"
                    className="text-xs"
                    dir="ltr"
                  />
                </div>

                {/* Websites */}
                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1.5">
                    <Link2 className="w-3 h-3 text-muted-foreground" />
                    الموقع الإلكتروني
                    <span className="text-[10px] text-muted-foreground">(حد أقصى 2)</span>
                  </Label>
                  <Input
                    value={website1}
                    onChange={(e) => setWebsite1(e.target.value)}
                    placeholder="https://example.com"
                    className="text-xs"
                    dir="ltr"
                  />
                  <Input
                    value={website2}
                    onChange={(e) => setWebsite2(e.target.value)}
                    placeholder="https://store.example.com (اختياري)"
                    className="text-xs"
                    dir="ltr"
                  />
                </div>

                {/* Vertical / Category */}
                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1.5">
                    <Globe className="w-3 h-3 text-muted-foreground" />
                    فئة النشاط
                  </Label>
                  <Select value={vertical || "none"} onValueChange={(v) => setVertical(v === "none" ? "" : v)}>
                    <SelectTrigger className="text-xs h-9">
                      <SelectValue placeholder="اختر الفئة" />
                    </SelectTrigger>
                    <SelectContent>
                      {VERTICALS.map((v) => (
                        <SelectItem key={v.value || "none"} value={v.value || "none"} className="text-xs">
                          {v.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {/* Save Button */}
            <Button className="w-full gap-2 text-sm" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              حفظ التعديلات
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default WhatsAppProfileEditor;
