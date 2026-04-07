import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { z } from "https://esm.sh/zod@3.25.76";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("list") }),
  z.object({
    action: z.literal("create"),
    title: z.string().min(1).max(500),
    description: z.string().max(5000).nullable().optional(),
    task_type: z.string().min(1).max(100),
    priority: z.string().min(1).max(50),
    assigned_to: z.string().uuid().nullable().optional(),
    attendance_type: z.enum(["in_person", "remote"]),
    task_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    start_time: z.string().regex(/^\d{2}:\d{2}$/),
    end_time: z.string().regex(/^\d{2}:\d{2}$/),
    location: z.string().max(500).nullable().optional(),
  }),
  z.object({
    action: z.literal("update_status"),
    task_id: z.string().uuid(),
    status: z.enum(["pending", "in_progress", "forwarded", "completed", "cancelled"]),
  }),
]);

type CallerProfile = {
  id: string;
  org_id: string;
  team_id: string | null;
  is_supervisor: boolean | null;
};

type TaskRow = {
  id: string;
  org_id: string;
  assigned_to: string | null;
  created_by: string | null;
  status: string;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function getCallerContext(authHeader: string) {
  const externalUrl = Deno.env.get("EXTERNAL_SUPABASE_URL")!;
  const externalAnonKey = Deno.env.get("EXTERNAL_SUPABASE_ANON_KEY")!;
  const externalServiceKey = Deno.env.get("EXTERNAL_SUPABASE_SERVICE_ROLE_KEY")!;
  const cloudUrl = Deno.env.get("SUPABASE_URL")!;
  const cloudServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const externalUser = createClient(externalUrl, externalAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const externalAdmin = createClient(externalUrl, externalServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const cloudAdmin = createClient(cloudUrl, cloudServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: profile, error: profileError } = await externalUser
    .from("profiles")
    .select("id, org_id, team_id, is_supervisor")
    .maybeSingle<CallerProfile>();

  console.log("Profile query result:", { profile, profileError, hasAuth: !!authHeader });

  if (profileError || !profile?.id || !profile.org_id) {
    console.error("Auth failed:", { profileError, profile });
    throw new Error("Unauthorized");
  }

  const { data: roles } = await externalUser
    .from("user_roles")
    .select("role")
    .eq("user_id", profile.id);

  const roleSet = new Set((roles || []).map((item: { role: string }) => item.role));
  const role = roleSet.has("super_admin") || roleSet.has("admin")
    ? "admin"
    : profile.is_supervisor
      ? "supervisor"
      : "member";

  return { profile, role, externalAdmin, cloudAdmin };
}

async function getVisibleUserIds(ctx: Awaited<ReturnType<typeof getCallerContext>>) {
  if (ctx.role !== "supervisor" || !ctx.profile.team_id) {
    return [ctx.profile.id];
  }

  const { data, error } = await ctx.externalAdmin
    .from("profiles")
    .select("id")
    .eq("org_id", ctx.profile.org_id)
    .eq("team_id", ctx.profile.team_id)
    .eq("is_active", true);

  if (error) {
    throw new Error(error.message);
  }

  return Array.from(new Set([ctx.profile.id, ...(data || []).map((item: { id: string }) => item.id)]));
}

function canAccessTask(
  task: TaskRow,
  ctx: Awaited<ReturnType<typeof getCallerContext>>,
  visibleUserIds: string[],
) {
  if (task.org_id !== ctx.profile.org_id) return false;
  if (ctx.role === "admin") return true;

  if (ctx.role === "supervisor") {
    const allowedIds = new Set(visibleUserIds);
    return (
      task.assigned_to === null ||
      (!!task.assigned_to && allowedIds.has(task.assigned_to)) ||
      (!!task.created_by && allowedIds.has(task.created_by))
    );
  }

  return task.assigned_to === ctx.profile.id || task.created_by === ctx.profile.id;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const body = await req.json().catch(() => null);
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return json({ error: parsed.error.flatten().fieldErrors }, 400);
    }

    const ctx = await getCallerContext(authHeader);

    if (parsed.data.action === "list") {
      const { data: tasks, error } = await ctx.externalAdmin
        .from("tasks")
        .select("*")
        .eq("org_id", ctx.profile.org_id)
        .order("created_at", { ascending: false })
        .limit(500);

      if (error) {
        return json({ error: error.message }, 500);
      }

      const visibleUserIds = await getVisibleUserIds(ctx);
      const filteredTasks = (tasks || []).filter((task) =>
        canAccessTask(task as TaskRow, ctx, visibleUserIds),
      );

      return json({ success: true, tasks: filteredTasks });
    }

    if (parsed.data.action === "create") {
      const assigneeId = parsed.data.assigned_to || ctx.profile.id;
      const visibleUserIds = await getVisibleUserIds(ctx);

      const { data: assignee, error: assigneeError } = await ctx.externalAdmin
        .from("profiles")
        .select("id, org_id, team_id")
        .eq("id", assigneeId)
        .maybeSingle();

      if (assigneeError || !assignee || assignee.org_id !== ctx.profile.org_id) {
        return json({ error: "الموظف المحدد غير صالح" }, 400);
      }

      if (ctx.role === "member" && assigneeId !== ctx.profile.id) {
        return json({ error: "يمكنك إسناد المهمة لنفسك فقط" }, 403);
      }

      if (ctx.role === "supervisor" && !visibleUserIds.includes(assigneeId)) {
        return json({ error: "يمكن للمشرف إسناد المهام لفريقه فقط" }, 403);
      }

      const { data: createdTask, error } = await ctx.externalAdmin
        .from("tasks")
        .insert({
          org_id: ctx.profile.org_id,
          title: parsed.data.title.trim(),
          description: parsed.data.description?.trim() || null,
          task_type: parsed.data.task_type,
          priority: parsed.data.priority,
          assigned_to: assigneeId,
          created_by_type: "agent",
          created_by: ctx.profile.id,
          attendance_type: parsed.data.attendance_type,
          task_date: parsed.data.task_date,
          start_time: parsed.data.start_time,
          end_time: parsed.data.end_time,
          location: parsed.data.attendance_type === "in_person"
            ? parsed.data.location?.trim() || null
            : null,
        })
        .select("*")
        .single();

      if (error) {
        const status = error.message?.includes("TASK_OVERLAP") ? 409 : 400;
        return json({ error: error.message, code: error.code }, status);
      }

      return json({ success: true, task: createdTask }, 200);
    }

    if (parsed.data.action === "update_status") {
      const { data: existingTask, error: taskError } = await ctx.externalAdmin
        .from("tasks")
        .select("id, org_id, assigned_to, created_by, status")
        .eq("id", parsed.data.task_id)
        .maybeSingle<TaskRow>();

      if (taskError) {
        return json({ error: taskError.message }, 500);
      }

      if (!existingTask) {
        return json({ error: "المهمة غير موجودة" }, 404);
      }

      const visibleUserIds = await getVisibleUserIds(ctx);
      if (!canAccessTask(existingTask, ctx, visibleUserIds)) {
        return json({ error: "غير مصرح لك بهذه المهمة" }, 403);
      }

      const updates = {
        status: parsed.data.status,
        completed_at: parsed.data.status === "completed" ? new Date().toISOString() : null,
      };

      const { data: updatedTask, error } = await ctx.externalAdmin
        .from("tasks")
        .update(updates)
        .eq("id", parsed.data.task_id)
        .select("*")
        .single();

      if (error) {
        return json({ error: error.message }, 400);
      }

      return json({ success: true, task: updatedTask });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status = message === "Unauthorized" ? 401 : 500;
    return json({ error: message }, status);
  }
});
