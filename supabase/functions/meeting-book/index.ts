import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { action, ...body } = await req.json();

    // ── GET: fetch booking page + available slots ──────────────────
    if (action === "get_page") {
      const { slug, date } = body; // date = "YYYY-MM-DD"

      const { data: page } = await admin
        .from("booking_pages")
        .select("*, profiles(full_name, avatar_url, org_id)")
        .eq("slug", slug)
        .eq("is_active", true)
        .maybeSingle();

      if (!page) return json({ error: "الصفحة غير موجودة" }, 404);

      const { data: types } = await admin
        .from("meeting_types")
        .select("*")
        .eq("profile_id", page.profile_id)
        .eq("is_active", true)
        .order("sort_order");

      const { data: availability } = await admin
        .from("employee_availability")
        .select("*")
        .eq("profile_id", page.profile_id)
        .eq("is_active", true);

      // If date provided, compute available slots
      let slots: string[] = [];
      if (date) {
        slots = await computeSlots(page.profile_id, date, body.duration_minutes || 30, page.min_notice_hours);
      }

      return json({ page, types, availability, slots });
    }

    // ── POST: book a meeting ───────────────────────────────────────
    if (action === "book") {
      const { profile_id, meeting_type_id, start_time, customer_name, customer_phone, customer_email, notes } = body;

      // Validate slot is still available
      const { data: mtype } = await admin
        .from("meeting_types")
        .select("*")
        .eq("id", meeting_type_id)
        .maybeSingle();

      if (!mtype) return json({ error: "نوع الاجتماع غير موجود" }, 400);

      const start = new Date(start_time);
      const end = new Date(start.getTime() + mtype.duration_minutes * 60_000);

      // Check conflict
      const { data: conflict } = await admin
        .from("meetings")
        .select("id")
        .eq("profile_id", profile_id)
        .eq("status", "confirmed")
        .lt("start_time", end.toISOString())
        .gt("end_time", start.toISOString())
        .maybeSingle();

      if (conflict) return json({ error: "هذا الوقت محجوز بالفعل، الرجاء اختيار وقت آخر" }, 409);

      const { data: bp } = await admin
        .from("booking_pages")
        .select("org_id")
        .eq("profile_id", profile_id)
        .maybeSingle();

      const { data: meeting, error: insertErr } = await admin
        .from("meetings")
        .insert({
          org_id: bp?.org_id,
          meeting_type_id,
          profile_id,
          customer_name,
          customer_phone: customer_phone || null,
          customer_email: customer_email || null,
          title: `${mtype.name} — ${customer_name}`,
          notes: notes || null,
          start_time: start.toISOString(),
          end_time: end.toISOString(),
          booking_source: "booking_page",
        })
        .select()
        .single();

      if (insertErr) return json({ error: insertErr.message }, 500);

      // Send WhatsApp notification to employee if they have a channel
      await notifyEmployee(admin, meeting, mtype, profile_id, bp?.org_id);

      return json({ success: true, meeting });
    }

    return json({ error: "action غير معروف" }, 400);
  } catch (e: any) {
    return json({ error: e.message }, 500);
  }
});

// ── Compute available 30/60/etc-min slots for a given date ──────────
async function computeSlots(profileId: string, date: string, durationMin: number, minNoticeHours: number): Promise<string[]> {
  const dayOfWeek = new Date(date + "T12:00:00").getDay();

  const { data: avail } = await admin
    .from("employee_availability")
    .select("start_time, end_time")
    .eq("profile_id", profileId)
    .eq("day_of_week", dayOfWeek)
    .eq("is_active", true)
    .maybeSingle();

  if (!avail) return [];

  // Treat stored times as Saudi Arabia time (UTC+3)
  const dayStart = new Date(`${date}T${avail.start_time}+03:00`);
  const dayEnd   = new Date(`${date}T${avail.end_time}+03:00`);
  const now      = new Date();
  const minNotice = new Date(now.getTime() + minNoticeHours * 3600_000);

  // Get existing bookings for the day
  const { data: existing } = await admin
    .from("meetings")
    .select("start_time, end_time")
    .eq("profile_id", profileId)
    .eq("status", "confirmed")
    .gte("start_time", dayStart.toISOString())
    .lte("start_time", dayEnd.toISOString());

  const booked = (existing || []).map(m => ({
    start: new Date(m.start_time).getTime(),
    end: new Date(m.end_time).getTime(),
  }));

  const slots: string[] = [];
  let cursor = dayStart.getTime();
  const slotMs = durationMin * 60_000;

  while (cursor + slotMs <= dayEnd.getTime()) {
    const slotEnd = cursor + slotMs;
    const slotTime = new Date(cursor);

    // Skip past / too-soon slots
    if (slotTime >= minNotice) {
      const conflict = booked.some(b => cursor < b.end && slotEnd > b.start);
      if (!conflict) {
        slots.push(slotTime.toISOString());
      }
    }
    cursor += slotMs;
  }

  return slots;
}

// ── Notify employee via WhatsApp ─────────────────────────────────────
async function notifyEmployee(admin: any, meeting: any, mtype: any, profileId: string, orgId: string) {
  try {
    const { data: profile } = await admin
      .from("profiles")
      .select("phone, full_name")
      .eq("id", profileId)
      .maybeSingle();

    if (!profile?.phone) return;

    const { data: channel } = await admin
      .from("whatsapp_config_safe")
      .select("id, channel_type, evolution_instance_name")
      .eq("org_id", orgId)
      .eq("is_connected", true)
      .limit(1)
      .maybeSingle();

    if (!channel) return;

    const startDate = new Date(meeting.start_time);
    const dateStr = startDate.toLocaleDateString("ar-SA-u-ca-gregory", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
    });
    const timeStr = startDate.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" });

    const msg = `📅 *موعد جديد تم حجزه*\n\nالعميل: ${meeting.customer_name}\nالخدمة: ${mtype.name}\nالتاريخ: ${dateStr}\nالوقت: ${timeStr}\nالهاتف: ${meeting.customer_phone || "غير محدد"}`;

    const funcName = channel.channel_type === "meta_api" ? "whatsapp-send" : "evolution-send";
    await admin.functions.invoke(funcName, {
      body: { to: profile.phone, message: msg, channel_id: channel.id },
    });
  } catch (_) { /* silent */ }
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
