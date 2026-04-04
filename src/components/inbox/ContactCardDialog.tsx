import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Contact, Loader2 } from "lucide-react";
import { invokeCloud } from "@/lib/supabase";
import { toast } from "sonner";

interface ContactCardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  customerPhone: string;
  channelId?: string;
}

const ContactCardDialog = ({ open, onOpenChange, conversationId, customerPhone, channelId }: ContactCardDialogProps) => {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!name.trim() || !phone.trim()) {
      toast.error("أدخل الاسم ورقم الهاتف");
      return;
    }
    setSending(true);
    try {
      const { data, error } = await invokeCloud("evolution-send", {
        body: {
          to: customerPhone,
          conversation_id: conversationId,
          type: "contact",
          contact_name: name.trim(),
          contact_phone: phone.trim().replace(/\D/g, ""),
          contact_email: email.trim() || undefined,
          contact_company: company.trim() || undefined,
          channel_id: channelId,
        },
      });
      if (error || data?.error) throw new Error(data?.error || "فشل");
      toast.success("📇 تم إرسال بطاقة الاتصال");
      onOpenChange(false);
      setName(""); setPhone(""); setEmail(""); setCompany("");
    } catch (e: any) {
      toast.error(e.message || "فشل إرسال بطاقة الاتصال");
    }
    setSending(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Contact className="w-4 h-4 text-primary" /> إرسال بطاقة اتصال
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          <Input placeholder="الاسم *" value={name} onChange={e => setName(e.target.value)} className="text-sm" autoFocus />
          <Input placeholder="رقم الهاتف * (مثال: 966500000000)" value={phone} onChange={e => setPhone(e.target.value)} className="text-sm" dir="ltr" />
          <Input placeholder="البريد (اختياري)" value={email} onChange={e => setEmail(e.target.value)} className="text-sm" dir="ltr" />
          <Input placeholder="الشركة (اختياري)" value={company} onChange={e => setCompany(e.target.value)} className="text-sm" />
          <Button onClick={handleSend} disabled={sending || !name.trim() || !phone.trim()} className="w-full gap-2">
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Contact className="w-4 h-4" />}
            إرسال
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ContactCardDialog;
