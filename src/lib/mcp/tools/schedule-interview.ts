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
  name: "schedule_interview",
  title: "Schedule interview",
  description: "Schedule an interview for the signed-in user, optionally linked to an application.",
  inputSchema: {
    title: z.string().min(1).describe("Interview title, e.g. 'Technical screen with Acme'."),
    scheduled_at: z.string().datetime().describe("ISO 8601 date-time of the interview."),
    duration_minutes: z.number().int().positive().optional().describe("Duration in minutes."),
    location: z.string().optional(),
    meeting_url: z.string().url().optional(),
    notes: z.string().optional(),
    application_id: z.string().uuid().optional().describe("Related application id."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const { data, error } = await supabaseForUser(ctx)
      .from("interviews")
      .insert({ ...input, user_id: ctx.getUserId() })
      .select()
      .single();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: `Scheduled interview ${data.id} at ${data.scheduled_at}.` }],
      structuredContent: { interview: data },
    };
  },
});
