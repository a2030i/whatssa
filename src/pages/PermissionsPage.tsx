import PermissionsManager from "@/components/settings/PermissionsManager";
import BackupManager from "@/components/settings/BackupManager";
import { Shield, Database } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const PermissionsPage = () => {
  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[900px] mx-auto space-y-5" dir="rtl">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Shield className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-black text-foreground tracking-tight">الصلاحيات والأمان</h1>
          <p className="text-sm text-muted-foreground">إدارة صلاحيات الأدوار والنسخ الاحتياطي</p>
        </div>
      </div>

      <Tabs defaultValue="permissions" className="space-y-4">
        <TabsList className="bg-card/70 backdrop-blur-sm border border-border/40 rounded-xl">
          <TabsTrigger value="permissions" className="text-xs gap-1 rounded-lg">
            <Shield className="w-3 h-3" /> الصلاحيات
          </TabsTrigger>
          <TabsTrigger value="backup" className="text-xs gap-1 rounded-lg">
            <Database className="w-3 h-3" /> النسخ الاحتياطي
          </TabsTrigger>
        </TabsList>

        <TabsContent value="permissions">
          <PermissionsManager />
        </TabsContent>

        <TabsContent value="backup">
          <BackupManager />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default PermissionsPage;

