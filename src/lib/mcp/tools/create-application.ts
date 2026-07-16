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
  name: "create_application",
  title: "Create application",
  description: "Add a new co-op / internship application to the signed-in user's tracker.",
  inputSchema: {
    company: z.string().min(1).describe("Company name."),
    role: z.string().min(1).describe("Role or position title."),
    location: z.string().optional().describe("Location, e.g. 'San Francisco, CA'."),
    remote_type: z.enum(["remote", "onsite", "hybrid"]).optional(),
    salary: z.string().optional().describe("Salary description, free-form."),
    rating: z.number().int().min(0).max(5).optional().describe("Personal interest rating 0-5."),
    stage: z
      .enum(["applied", "phone_screen", "interview", "offer", "rejected", "accepted"])
      .optional()
      .describe("Pipeline stage. Defaults to 'applied'."),
    notes: z.string().optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const { data, error } = await supabaseForUser(ctx)
      .from("applications")
      .insert({ ...input, user_id: ctx.getUserId() })
      .select()
      .single();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: `Created application ${data.id} at ${data.company}.` }],
      structuredContent: { application: data },
    };
  },
});
