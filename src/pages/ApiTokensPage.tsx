import ApiTokensSection from "@/components/settings/ApiTokensSection";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Code2, ChevronLeft } from "lucide-react";

const ApiTokensPage = () => {
  const navigate = useNavigate();

  return (
    <div className="p-3 md:p-6 space-y-5 max-w-[800px]" dir="rtl">
      <div>
        <h1 className="text-xl font-bold">توكنات API</h1>
        <p className="text-sm text-muted-foreground mt-1">إنشاء وإدارة مفاتيح الوصول للواجهة البرمجية</p>
      </div>

      <div className="bg-card rounded-lg shadow-card p-5">
        <ApiTokensSection />
      </div>

      <div className="bg-card rounded-lg shadow-card">
        <button onClick={() => navigate("/api-docs")} className="w-full flex items-center justify-between p-5 hover:bg-secondary/30 transition-colors rounded-lg">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center"><Code2 className="w-4 h-4" /></div>
            <div className="text-right">
              <p className="text-sm font-medium">توثيق API</p>
              <p className="text-xs text-muted-foreground">دليل شامل لجميع نقاط النهاية مع أمثلة كود</p>
            </div>
          </div>
          <ChevronLeft className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>
    </div>
  );
};

export default ApiTokensPage;
