import { useState, useEffect } from "react";
import { LogIn, LogOut, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const AttendanceClockButton = () => {
  const { profile, orgId } = useAuth();
  const [isClockedIn, setIsClockedIn] = useState(false);
  const [clockInTime, setClockInTime] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!profile?.id || !orgId) return;
    checkCurrentStatus();
  }, [profile?.id, orgId]);

  const checkCurrentStatus = async () => {
    const today = new Date().toISOString().split("T")[0];
    const { data } = await supabase
      .from("attendance_logs" as any)
      .select("event_type, event_at")
      .eq("profile_id", profile!.id)
      .eq("org_id", orgId)
      .gte("event_at", today)
      .order("event_at", { ascending: false })
      .limit(1);

    const last = (data as any)?.[0];
    if (last?.event_type === "clock_in") {
      setIsClockedIn(true);
      setClockInTime(last.event_at);
    } else {
      setIsClockedIn(false);
      setClockInTime(null);
    }
  };

  const getClassification = async (eventType: "clock_in" | "clock_out"): Promise<string | null> => {
    // Get employee's current shift
    const today = new Date().toISOString().split("T")[0];
    const { data: empShift } = await supabase
      .from("employee_shifts" as any)
      .select("shift_id, shift_templates!inner(start_time, end_time, work_days)")
      .eq("profile_id", profile!.id)
      .lte("effective_from", today)
      .or(`effective_to.is.null,effective_to.gte.${today}`)
      .limit(1);

    const shift = (empShift as any)?.[0]?.shift_templates;
    if (!shift) return null;

    const now = new Date();
    const riyadhTime = now.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", timeZone: "Asia/Riyadh" });

    if (eventType === "clock_in") {
      return riyadhTime > shift.start_time ? "late" : "on_time";
    } else {
      return riyadhTime < shift.end_time ? "early_leave" : 
             riyadhTime > shift.end_time ? "overtime" : "on_time";
    }
  };

  const handleToggle = async () => {
    if (!profile?.id || !orgId) return;
    setLoading(true);

    const eventType = isClockedIn ? "clock_out" : "clock_in";
    const classification = await getClassification(eventType);

    // Get current shift id
    const today = new Date().toISOString().split("T")[0];
    const { data: empShift } = await supabase
      .from("employee_shifts" as any)
      .select("shift_id")
      .eq("profile_id", profile.id)
      .lte("effective_from", today)
      .or(`effective_to.is.null,effective_to.gte.${today}`)
      .limit(1);

    const shiftId = (empShift as any)?.[0]?.shift_id || null;

    const { error } = await supabase
      .from("attendance_logs" as any)
      .insert({
        org_id: orgId,
        profile_id: profile.id,
        event_type: eventType,
        shift_id: shiftId,
        classification,
      } as any);

    if (error) {
      toast.error("فشل تسجيل الحضور");
    } else {
      // Update online status
      await supabase
        .from("profiles")
        .update({ is_online: eventType === "clock_in" } as any)
        .eq("id", profile.id);

      if (eventType === "clock_in") {
        setIsClockedIn(true);
        setClockInTime(new Date().toISOString());
        toast.success("✅ تم تسجيل الحضور");
        if (classification === "late") toast.warning("⚠️ تسجيل متأخر عن موعد الشفت");
      } else {
        setIsClockedIn(false);
        setClockInTime(null);
        if (classification === "early_leave") {
          toast.warning("⚠️ خروج مبكر — سيتم تسجيله كتقصير");
        } else if (classification === "overtime") {
          toast.success("🌟 جهد إضافي — شكراً لك!");
        } else {
          toast.success("تم تسجيل الانصراف");
        }
      }
    }

    setLoading(false);
  };

  const getElapsedTime = () => {
    if (!clockInTime) return null;
    const diff = Date.now() - new Date(clockInTime).getTime();
    const hours = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    return `${hours}:${String(mins).padStart(2, "0")}`;
  };

  return (
    <Button
      variant={isClockedIn ? "default" : "outline"}
      size="sm"
      onClick={handleToggle}
      disabled={loading}
      className={cn(
        "gap-1.5 text-xs h-8 px-3 rounded-xl transition-all",
        isClockedIn && "bg-success hover:bg-success/90 text-white"
      )}
    >
      {loading ? (
        <Clock className="w-3.5 h-3.5 animate-spin" />
      ) : isClockedIn ? (
        <LogOut className="w-3.5 h-3.5" />
      ) : (
        <LogIn className="w-3.5 h-3.5" />
      )}
      {isClockedIn ? "انصراف" : "حضور"}
      {isClockedIn && clockInTime && (
        <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 bg-white/20 text-white">
          {getElapsedTime()}
        </Badge>
      )}
    </Button>
  );
};

export default AttendanceClockButton;
