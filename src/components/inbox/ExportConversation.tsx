import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent } from "@/components/ui/dropdown-menu";
import { Download, FileText, Table } from "lucide-react";
import { Message, Conversation } from "@/data/mockData";
import { toast } from "sonner";

interface ExportConversationProps {
  conversation: Conversation;
  messages: Message[];
  asMenuItem?: boolean;
}

const ExportConversation = ({ conversation, messages, asMenuItem }: ExportConversationProps) => {
  const exportAsCSV = () => {
    const headers = ["الوقت", "المرسل", "النوع", "المحتوى"];
    const rows = messages.map((m) => [
      m.timestamp,
      m.sender === "agent" ? "الموظف" : m.sender === "customer" ? "العميل" : "النظام",
      m.type || "text",
      `"${(m.text || "").replace(/"/g, '""')}"`,
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const BOM = "\uFEFF";
    const blob = new Blob([BOM + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `محادثة_${conversation.customerName}_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("تم تصدير المحادثة كـ CSV");
  };

  const exportAsPDF = () => {
    const content = messages
      .map((m) => {
        const sender = m.sender === "agent" ? "الموظف" : m.sender === "customer" ? "العميل" : "النظام";
        return `[${m.timestamp}] ${sender}: ${m.text}`;
      })
      .join("\n\n");

    const htmlContent = `
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="utf-8">
        <title>محادثة - ${conversation.customerName}</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, sans-serif; padding: 40px; direction: rtl; }
          h1 { font-size: 18px; border-bottom: 2px solid #25D366; padding-bottom: 10px; }
          .info { color: #666; font-size: 13px; margin-bottom: 20px; }
          .msg { margin: 12px 0; padding: 10px 14px; border-radius: 10px; font-size: 14px; line-height: 1.6; }
          .agent { background: #f0f0f0; margin-left: 20%; }
          .customer { background: #dcf8c6; margin-right: 20%; }
          .system { background: #fff3cd; text-align: center; font-size: 12px; color: #856404; }
          .time { font-size: 11px; color: #999; margin-top: 4px; }
          .sender { font-weight: bold; font-size: 12px; margin-bottom: 4px; color: #333; }
        </style>
      </head>
      <body>
        <h1>محادثة مع ${conversation.customerName}</h1>
        <div class="info">
          <p>الرقم: ${conversation.customerPhone} | الحالة: ${conversation.status}</p>
          <p>تاريخ التصدير: ${new Date().toLocaleDateString("ar-SA-u-ca-gregory")}</p>
        </div>
        ${messages.map((m) => {
          const sender = m.sender === "agent" ? "الموظف" : m.sender === "customer" ? conversation.customerName : "النظام";
          return `<div class="msg ${m.sender}">
            <div class="sender">${sender}</div>
            <div>${(m.text || "").replace(/\n/g, "<br>")}</div>
            <div class="time">${m.timestamp}</div>
          </div>`;
        }).join("")}
      </body>
      </html>
    `;

    const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank");
    if (win) {
      win.onload = () => {
        win.print();
      };
    }
    toast.success("تم فتح المحادثة للطباعة كـ PDF");
  };

  if (asMenuItem) {
    return (
      <DropdownMenuSub>
        <DropdownMenuSubTrigger className="gap-2">
          <Download className="w-4 h-4 ml-2" />
          تصدير المحادثة
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <DropdownMenuItem onClick={exportAsPDF} className="gap-2">
            <FileText className="w-4 h-4" />
            تصدير كـ PDF
          </DropdownMenuItem>
          <DropdownMenuItem onClick={exportAsCSV} className="gap-2">
            <Table className="w-4 h-4" />
            تصدير كـ CSV
          </DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 text-xs">
          <Download className="w-3.5 h-3.5" />
          تصدير
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onClick={exportAsPDF} className="gap-2">
          <FileText className="w-4 h-4" />
          تصدير كـ PDF
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportAsCSV} className="gap-2">
          <Table className="w-4 h-4" />
          تصدير كـ CSV
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ExportConversation;

