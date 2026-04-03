import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { WhatsAppTemplate } from "@/types/whatsapp";

interface TemplateVariableInputsProps {
  template: WhatsAppTemplate;
  variables: string[];
  onChange: (variables: string[]) => void;
  compact?: boolean;
}

const TemplateVariableInputs = ({ template, variables, onChange, compact }: TemplateVariableInputsProps) => {
  if (template.variableCount === 0) return null;

  const handleChange = (index: number, value: string) => {
    const updated = [...variables];
    updated[index] = value;
    onChange(updated);
  };

  // Build preview with filled variables
  const getPreview = () => {
    let body = template.body;
    let cursor = template.headerVariableCount;
    for (let i = 0; i < template.bodyVariableCount; i++) {
      const val = variables[cursor + i];
      body = body.replace(`{{${i + 1}}}`, val || `{{${i + 1}}}`);
    }
    return body;
  };

  let cursor = 0;

  return (
    <div className="space-y-2">
      <Label className={compact ? "text-[11px]" : "text-xs"}>
        متغيرات القالب ({template.variableCount})
      </Label>

      {template.headerVariableCount > 0 && (
        <div className="space-y-1.5">
          <p className={`text-muted-foreground ${compact ? "text-[10px]" : "text-[11px]"}`}>متغيرات الرأس:</p>
          {Array.from({ length: template.headerVariableCount }, (_, i) => {
            const idx = cursor + i;
            return (
              <Input
                key={`header-${i}`}
                value={variables[idx] || ""}
                onChange={(e) => handleChange(idx, e.target.value)}
                placeholder={`متغير الرأس {{${i + 1}}}`}
                className={compact ? "text-xs h-7" : "text-sm h-8"}
              />
            );
          })}
          {(() => { cursor += template.headerVariableCount; return null; })()}
        </div>
      )}

      {template.bodyVariableCount > 0 && (
        <div className="space-y-1.5">
          <p className={`text-muted-foreground ${compact ? "text-[10px]" : "text-[11px]"}`}>متغيرات النص:</p>
          {Array.from({ length: template.bodyVariableCount }, (_, i) => {
            const idx = template.headerVariableCount + i;
            return (
              <Input
                key={`body-${i}`}
                value={variables[idx] || ""}
                onChange={(e) => handleChange(idx, e.target.value)}
                placeholder={`متغير {{${i + 1}}}`}
                className={compact ? "text-xs h-7" : "text-sm h-8"}
              />
            );
          })}
        </div>
      )}

      {/* Live preview */}
      <div className={`p-2 rounded-lg border bg-muted/20 ${compact ? "text-[11px]" : "text-xs"}`}>
        <p className="font-medium text-muted-foreground mb-1">معاينة:</p>
        <p className="whitespace-pre-wrap">{getPreview()}</p>
      </div>
    </div>
  );
};

export default TemplateVariableInputs;
