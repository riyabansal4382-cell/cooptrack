import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listApplicationsTool from "./tools/list-applications";
import createApplicationTool from "./tools/create-application";
import updateApplicationStageTool from "./tools/update-application-stage";
import listInterviewsTool from "./tools/list-interviews";
import scheduleInterviewTool from "./tools/schedule-interview";

// The OAuth issuer MUST be the direct Supabase host — the published SUPABASE_URL
// is rewritten to the .lovable.cloud proxy, which mcp-js rejects (RFC 8414 issuer mismatch).
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "cooptrack-mcp",
  title: "CoopTrack",
  version: "0.1.0",
  instructions:
    "Tools for CoopTrack — a kanban tracker for co-op and internship applications. Use these to list, create, and update the signed-in user's applications and interviews.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    listApplicationsTool,
    createApplicationTool,
    updateApplicationStageTool,
    listInterviewsTool,
    scheduleInterviewTool,
  ],
});
