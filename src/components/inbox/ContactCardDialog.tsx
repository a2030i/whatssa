import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Contact, Loader2, Search, UserPlus, Users } from "lucide-react";
import { invokeCloud } from "@/lib/supabase";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ContactCardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  customerPhone: string;
  channelId?: string;
  orgId?: string;
}

interface SavedCustomer {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  company: string | null;
}

const ContactCardDialog = ({ open, onOpenChange, conversationId, customerPhone, channelId, orgId }: ContactCardDialogProps) => {
  const [tab, setTab] = useState<string>("saved");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [sending, setSending] = useState(false);

  // Saved customers
  const [customers, setCustomers] = useState<SavedCustomer[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<SavedCustomer | null>(null);

  useEffect(() => {
    if (open && orgId) {
      loadCustomers();
    }
    if (!open) {
      setName(""); setPhone(""); setEmail(""); setCompany("");
      setSearchQuery(""); setSelectedCustomer(null); setTab("saved");
    }
  }, [open, orgId]);

  const loadCustomers = async () => {
    if (!orgId) return;
    setLoadingCustomers(true);
    const { data } = await supabase
      .from("customers")
      .select("id, name, phone, email, company")
      .eq("org_id", orgId)
      .order("name", { ascending: true })
      .limit(200);
    setCustomers(data || []);
    setLoadingCustomers(false);
  };

  const filteredCustomers = customers.filter(c => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (c.name?.toLowerCase().includes(q)) || c.phone.includes(q) || (c.email?.toLowerCase().includes(q));
  });

  const handleSendContact = async (contactName: string, contactPhone: string, contactEmail?: string, contactCompany?: string) => {
    if (!contactName.trim() || !contactPhone.trim()) {
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
          contact_name: contactName.trim(),
          contact_phone: contactPhone.trim().replace(/\D/g, ""),
          contact_email: contactEmail?.trim() || undefined,
          contact_company: contactCompany?.trim() || undefined,
          channel_id: channelId,
        },
      });
      if (error || data?.error) throw new Error(data?.error || "فشل");
      toast.success("📇 تم إرسال بطاقة الاتصال");
      onOpenChange(false);
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
          <DialogDescription>اختر جهة اتصال محفوظة أو أدخل بيانات جديدة</DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab} className="mt-1">
          <TabsList className="grid w-full grid-cols-2 h-9">
            <TabsTrigger value="saved" className="text-xs gap-1.5">
              <Users className="w-3.5 h-3.5" /> المحفوظين
            </TabsTrigger>
            <TabsTrigger value="new" className="text-xs gap-1.5">
              <UserPlus className="w-3.5 h-3.5" /> جديد
            </TabsTrigger>
          </TabsList>

          <TabsContent value="saved" className="mt-3 space-y-3">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="بحث بالاسم أو الرقم..."
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); setSelectedCustomer(null); }}
                className="text-sm pr-9"
                autoFocus
              />
            </div>

            <ScrollArea className="h-48 border rounded-md">
              {loadingCustomers ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : filteredCustomers.length === 0 ? (
                <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                  لا توجد نتائج
                </div>
              ) : (
                <div className="p-1">
                  {filteredCustomers.map(c => (
                    <button
                      key={c.id}
                      onClick={() => setSelectedCustomer(c)}
                      className={`w-full text-right px-3 py-2 rounded-md text-sm transition-colors ${
                        selectedCustomer?.id === c.id
                          ? "bg-primary/10 border border-primary/30"
                          : "hover:bg-muted"
                      }`}
                    >
                      <div className="font-medium truncate">{c.name || c.phone}</div>
                      <div className="text-xs text-muted-foreground" dir="ltr">{c.phone}</div>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>

            <Button
              onClick={() => selectedCustomer && handleSendContact(selectedCustomer.name || selectedCustomer.phone, selectedCustomer.phone, selectedCustomer.email || undefined, selectedCustomer.company || undefined)}
              disabled={sending || !selectedCustomer}
              className="w-full gap-2"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Contact className="w-4 h-4" />}
              إرسال
            </Button>
          </TabsContent>

          <TabsContent value="new" className="mt-3 space-y-3">
            <Input placeholder="الاسم *" value={name} onChange={e => setName(e.target.value)} className="text-sm" />
            <Input placeholder="رقم الهاتف * (مثال: 966500000000)" value={phone} onChange={e => setPhone(e.target.value)} className="text-sm" dir="ltr" />
            <Input placeholder="البريد (اختياري)" value={email} onChange={e => setEmail(e.target.value)} className="text-sm" dir="ltr" />
            <Input placeholder="الشركة (اختياري)" value={company} onChange={e => setCompany(e.target.value)} className="text-sm" />
            <Button
              onClick={() => handleSendContact(name, phone, email, company)}
              disabled={sending || !name.trim() || !phone.trim()}
              className="w-full gap-2"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Contact className="w-4 h-4" />}
              إرسال
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default ContactCardDialog;

