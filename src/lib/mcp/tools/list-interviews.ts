import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

function supabaseForUser(ctx: ToolContext) {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "list_interviews",
  title: "List interviews",
  description: "List the signed-in user's upcoming and past interviews.",
  inputSchema: {
    upcoming_only: z.boolean().optional().describe("If true, return only interviews scheduled from now onward."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ upcoming_only }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    let q = supabaseForUser(ctx)
      .from("interviews")
      .select("id, title, scheduled_at, duration_minutes, location, meeting_url, notes, application_id")
      .order("scheduled_at", { ascending: true });
    if (upcoming_only) q = q.gte("scheduled_at", new Date().toISOString());
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { interviews: data ?? [] },
    };
  },
});
