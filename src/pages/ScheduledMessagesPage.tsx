import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Clock, Plus, Trash2, Send, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface ScheduledMessage {
  id: string;
  to_phone: string;
  message_type: string;
  content: string | null;
  template_name: string | null;
  scheduled_at: string;
  status: string;
  sent_at: string | null;
  error_message: string | null;
  created_at: string;
}

const ScheduledMessagesPage = () => {
  const { orgId } = useAuth();
  const [messages, setMessages] = useState<ScheduledMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [form, setForm] = useState({ to_phone: "", content: "", scheduled_at: "" });

  useEffect(() => {
    if (!orgId) return;
    loadMessages();
  }, [orgId]);

  const loadMessages = async () => {
    const { data, error } = await supabase
      .from("scheduled_messages")
      .select("*")
      .order("scheduled_at", { ascending: true });

    if (!error) setMessages((data as any[]) || []);
    setLoading(false);
  };

  const handleCreate = async () => {
    if (!form.to_phone || !form.content || !form.scheduled_at) {
      toast.error("يرجى تعبئة جميع الحقول");
      return;
    }

    const scheduledDate = new Date(form.scheduled_at);
    if (scheduledDate <= new Date()) {
      toast.error("يجب أن يكون وقت الجدولة في المستقبل");
      return;
    }

    const { error } = await supabase.from("scheduled_messages").insert({
      org_id: orgId,
      to_phone: form.to_phone,
      content: form.content,
      message_type: "text",
      scheduled_at: scheduledDate.toISOString(),
    } as any);

    if (error) {
      toast.error("فشل إنشاء الرسالة المجدولة");
      return;
    }

    toast.success("تم جدولة الرسالة بنجاح");
    setShowDialog(false);
    setForm({ to_phone: "", content: "", scheduled_at: "" });
    loadMessages();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("scheduled_messages").delete().eq("id", id);
    toast.success("تم حذف الرسالة المجدولة");
    loadMessages();
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "pending": return <Badge variant="outline" className="text-warning border-warning/30"><Clock className="w-3 h-3 ml-1" />بانتظار الإرسال</Badge>;
      case "sent": return <Badge className="bg-success/10 text-success border-0"><CheckCircle2 className="w-3 h-3 ml-1" />تم الإرسال</Badge>;
      case "failed": return <Badge variant="destructive"><XCircle className="w-3 h-3 ml-1" />فشل</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">الرسائل المجدولة</h1>
          <p className="text-sm text-muted-foreground">جدولة إرسال رسائل في وقت محدد</p>
        </div>
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="w-4 h-4" />رسالة جديدة</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md" dir="rtl">
            <DialogHeader>
              <DialogTitle>جدولة رسالة جديدة</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div>
                <label className="text-sm font-medium mb-1 block">رقم الهاتف</label>
                <Input
                  placeholder="966512345678"
                  value={form.to_phone}
                  onChange={(e) => setForm({ ...form, to_phone: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">نص الرسالة</label>
                <Textarea
                  placeholder="اكتب نص الرسالة..."
                  value={form.content}
                  onChange={(e) => setForm({ ...form, content: e.target.value })}
                  rows={3}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">وقت الإرسال</label>
                <Input
                  type="datetime-local"
                  value={form.scheduled_at}
                  onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })}
                />
              </div>
              <Button onClick={handleCreate} className="w-full gap-2">
                <Clock className="w-4 h-4" />جدولة الإرسال
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {messages.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Clock className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">لا توجد رسائل مجدولة</p>
            <p className="text-xs text-muted-foreground mt-1">أنشئ رسالة مجدولة للإرسال التلقائي في وقت محدد</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {messages.map((msg) => (
            <Card key={msg.id} className="border-border/50">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      {statusBadge(msg.status)}
                      <span className="text-xs text-muted-foreground">
                        {new Date(msg.scheduled_at).toLocaleDateString("ar-SA-u-ca-gregory", { 
                          year: "numeric", month: "short", day: "numeric",
                          hour: "2-digit", minute: "2-digit"
                        })}
                      </span>
                    </div>
                    <p className="text-sm font-medium mb-1">إلى: {msg.to_phone}</p>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {msg.content || `[قالب: ${msg.template_name}]`}
                    </p>
                    {msg.error_message && (
                      <p className="text-xs text-destructive mt-1">{msg.error_message}</p>
                    )}
                  </div>
                  {msg.status === "pending" && (
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(msg.id)} className="text-destructive hover:text-destructive">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default ScheduledMessagesPage;
