import { useEffect, useState } from "react";
import { Phone, Wifi, Globe } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

interface Channel {
  id: string;
  display_phone: string;
  channel_type: string;
  evolution_instance_name: string | null;
  business_name: string | null;
}

interface ChannelSelectorProps {
  orgId: string;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  label?: string;
}

const ChannelSelector = ({ orgId, selectedIds, onChange, label = "القنوات المستهدفة" }: ChannelSelectorProps) => {
  const [channels, setChannels] = useState<Channel[]>([]);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("whatsapp_config_safe")
        .select("id, display_phone, channel_type, evolution_instance_name, business_name")
        .eq("org_id", orgId)
        .eq("is_connected", true)
        .order("created_at");
      setChannels((data || []) as unknown as Channel[]);
    };
    if (orgId) load();
  }, [orgId]);

  if (channels.length <= 1) return null; // No need to show if only one channel

  const toggle = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((i) => i !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  return (
    <div className="space-y-2">
      <Label className="text-xs flex items-center gap-1.5">
        <Globe className="w-3.5 h-3.5" />
        {label}
      </Label>
      <p className="text-[10px] text-muted-foreground">
        اترك الكل بدون تحديد = تعمل على جميع القنوات
      </p>
      <div className="grid gap-2">
        {channels.map((ch) => {
          const isSelected = selectedIds.includes(ch.id);
          const isMeta = ch.channel_type === "meta_api";
          return (
            <label
              key={ch.id}
              className={cn(
                "flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition-all",
                isSelected
                  ? "border-primary/30 bg-primary/5"
                  : "border-border/40 bg-card/50 hover:border-border/80"
              )}
            >
              <Checkbox
                checked={isSelected}
                onCheckedChange={() => toggle(ch.id)}
              />
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {isMeta ? (
                  <Phone className="w-4 h-4 text-success shrink-0" />
                ) : (
                  <Wifi className="w-4 h-4 text-warning shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate">
                    {ch.business_name || ch.display_phone || ch.evolution_instance_name || "قناة"}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {ch.display_phone || ch.evolution_instance_name}
                  </p>
                </div>
              </div>
              <Badge variant="outline" className="text-[9px] shrink-0">
                {isMeta ? "رسمي" : "ويب"}
              </Badge>
            </label>
          );
        })}
      </div>
    </div>
  );
};

export default ChannelSelector;

