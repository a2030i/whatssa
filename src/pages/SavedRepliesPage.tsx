import { useState, useEffect } from "react";
import { Plus, Trash2, Edit, X, MessageSquare } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

const SavedRepliesPage = () => {
  const { orgId, profile } = useAuth();
  const [savedReplies, setSavedReplies] = useState<Array<{ id: string; shortcut: string; title: string; content: string; category: string }>>([]);
  const [showReplyDialog, setShowReplyDialog] = useState(false);
  const [editingReply, setEditingReply] = useState<any>(null);
  const [replyForm, setReplyForm] = useState({ shortcut: "", title: "", content: "", category: "" });

  useEffect(() => { if (orgId) loadSavedReplies(); }, [orgId]);

  const loadSavedReplies = async () => {
    const { data } = await supabase.from("saved_replies").select("id, shortcut, title, content, category").eq("org_id", orgId).order("shortcut");
    if (data) setSavedReplies(data);
  };

  const saveReply = async () => {
    if (!replyForm.shortcut.trim() || !replyForm.content.trim()) { toast.error("الاختصار والمحتوى مطلوبين"); return; }
    if (editingReply) {
      await supabase.from("saved_replies").update({ shortcut: replyForm.shortcut.trim(), title: replyForm.title.trim(), content: replyForm.content.trim(), category: replyForm.category }).eq("id", editingReply.id);
      toast.success("تم تحديث الرد");
    } else {
      await supabase.from("saved_replies").insert({ org_id: orgId, shortcut: replyForm.shortcut.trim(), title: replyForm.title.trim(), content: replyForm.content.trim(), category: replyForm.category, created_by: profile?.id } as any);
      toast.success("تم إضافة الرد");
    }
    setShowReplyDialog(false); setEditingReply(null); setReplyForm({ shortcut: "", title: "", content: "", category: "" });
    loadSavedReplies();
  };

  const deleteReply = async (id: string) => {
    await supabase.from("saved_replies").delete().eq("id", id);
    toast.success("تم حذف الرد");
    loadSavedReplies();
  };

  return (
    <div className="p-6 max-w-4xl mx-auto" dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><MessageSquare className="w-6 h-6" /> الردود الجاهزة</h1>
          <p className="text-muted-foreground mt-1">أضف ردود جاهزة واستخدمها بكتابة /الاختصار في المحادثة</p>
        </div>
        <Button onClick={() => { setEditingReply(null); setReplyForm({ shortcut: "", title: "", content: "", category: "" }); setShowReplyDialog(true); }}><Plus className="w-4 h-4 ml-2" /> إضافة رد</Button>
      </div>
      <div className="space-y-3">
        {savedReplies.length === 0 && <p className="text-center text-muted-foreground py-8">لا توجد ردود جاهزة</p>}
        {savedReplies.map((r) => (
          <div key={r.id} className="border rounded-lg p-4 flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <code className="bg-secondary px-2 py-0.5 rounded text-sm">/{r.shortcut}</code>
                {r.title && <span className="font-medium">{r.title}</span>}
                {r.category && <span className="text-xs bg-muted px-2 py-0.5 rounded">{r.category}</span>}
              </div>
              <p className="text-sm text-muted-foreground">{r.content}</p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => { setEditingReply(r); setReplyForm({ shortcut: r.shortcut, title: r.title, content: r.content, category: r.category }); setShowReplyDialog(true); }}><Edit className="w-4 h-4" /></Button>
              <Button size="sm" variant="ghost" onClick={() => deleteReply(r.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
            </div>
          </div>
        ))}
      </div>
      <Dialog open={showReplyDialog} onOpenChange={setShowReplyDialog}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>{editingReply ? "تعديل الرد" : "إضافة رد جديد"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><label className="text-sm font-medium">الاختصار *</label><Input value={replyForm.shortcut} onChange={(e) => setReplyForm({ ...replyForm, shortcut: e.target.value })} placeholder="مثال: ترحيب" /></div>
            <div><label className="text-sm font-medium">العنوان</label><Input value={replyForm.title} onChange={(e) => setReplyForm({ ...replyForm, title: e.target.value })} placeholder="عنوان الرد" /></div>
            <div><label className="text-sm font-medium">التصنيف</label><Input value={replyForm.category} onChange={(e) => setReplyForm({ ...replyForm, category: e.target.value })} placeholder="مثال: عام" /></div>
            <div><label className="text-sm font-medium">المحتوى *</label><Textarea value={replyForm.content} onChange={(e) => setReplyForm({ ...replyForm, content: e.target.value })} placeholder="نص الرد" rows={4} /></div>
            <Button onClick={saveReply} className="w-full">{editingReply ? "تحديث" : "إضافة"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SavedRepliesPage;
