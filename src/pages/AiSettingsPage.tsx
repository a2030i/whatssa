import AiProviderSettings from "@/components/settings/AiProviderSettings";

const AiSettingsPage = () => {
  return (
    <div className="p-3 md:p-6 space-y-5 max-w-[800px]" dir="rtl">
      <div>
        <h1 className="text-xl font-bold">مزود الذكاء الاصطناعي</h1>
        <p className="text-sm text-muted-foreground mt-1">اربط مفتاح API الخاص بك لتفعيل الرد الذكي، التلخيص والتحليل</p>
      </div>
      <AiProviderSettings />
    </div>
  );
};

export default AiSettingsPage;
