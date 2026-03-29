export interface WhatsAppTemplateButton {
  type: "url" | "phone" | "quick_reply" | string;
  text: string;
  value?: string;
}

export interface WhatsAppTemplateComponent {
  type: string;
  format?: string;
  text?: string;
  buttons?: Array<{
    type?: string;
    text?: string;
    url?: string;
    phone_number?: string;
  }>;
}

export interface WhatsAppTemplate {
  id: string;
  name: string;
  category: string;
  language: string;
  status: string;
  headerFormat?: "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT" | "NONE";
  header?: string;
  headerUrl?: string;
  body: string;
  footer?: string;
  buttons?: WhatsAppTemplateButton[];
  variableCount: number;
  headerVariableCount: number;
  bodyVariableCount: number;
  components?: WhatsAppTemplateComponent[];
}

const placeholderRegex = /\{\{\d+\}\}/g;

export const countTemplateVariables = (text?: string) => (text?.match(placeholderRegex) || []).length;

export const mapMetaTemplate = (template: any): WhatsAppTemplate => {
  const components: WhatsAppTemplateComponent[] = Array.isArray(template?.components) ? template.components : [];
  const headerComponent = components.find((component) => component.type?.toUpperCase() === "HEADER");
  const bodyComponent = components.find((component) => component.type?.toUpperCase() === "BODY");
  const footerComponent = components.find((component) => component.type?.toUpperCase() === "FOOTER");
  const buttonsComponent = components.find((component) => component.type?.toUpperCase() === "BUTTONS");

  const buttons: WhatsAppTemplateButton[] = (buttonsComponent?.buttons || []).map((button) => ({
    type: (button.type || "quick_reply").toLowerCase(),
    text: button.text || "",
    value: button.url || button.phone_number,
  }));

  const headerFormat = (headerComponent?.format?.toUpperCase() || "NONE") as WhatsAppTemplate["headerFormat"];
  const header = headerComponent?.text || undefined;
  const headerUrl = (headerComponent as any)?.example?.header_handle?.[0] || (headerComponent as any)?.example?.header_url?.[0] || undefined;
  const body = bodyComponent?.text || "";
  const footer = footerComponent?.text || undefined;
  const headerVariableCount = headerFormat === "TEXT" ? countTemplateVariables(header) : 0;
  const bodyVariableCount = countTemplateVariables(body);

  return {
    id: template?.id || template?.name || crypto.randomUUID(),
    name: template?.name || "",
    category: String(template?.category || "UTILITY").toLowerCase(),
    language: template?.language || "ar",
    status: String(template?.status || "PENDING").toLowerCase(),
    headerFormat: headerFormat === "NONE" ? undefined : headerFormat,
    header,
    headerUrl,
    body,
    footer,
    buttons: buttons.length ? buttons : undefined,
    variableCount: headerVariableCount + bodyVariableCount,
    headerVariableCount,
    bodyVariableCount,
    components,
  };
};

export const buildTemplateComponents = (template: WhatsAppTemplate, variables: string[]) => {
  const components: Array<{ type: string; parameters: Array<{ type: string; text: string }> }> = [];
  let cursor = 0;

  if (template.headerVariableCount > 0) {
    components.push({
      type: "header",
      parameters: Array.from({ length: template.headerVariableCount }, () => ({
        type: "text",
        text: variables[cursor++] || "",
      })),
    });
  }

  if (template.bodyVariableCount > 0) {
    components.push({
      type: "body",
      parameters: Array.from({ length: template.bodyVariableCount }, () => ({
        type: "text",
        text: variables[cursor++] || "",
      })),
    });
  }

  return components;
};