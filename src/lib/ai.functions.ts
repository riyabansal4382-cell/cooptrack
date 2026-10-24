import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const SummarizeInput = z.object({
  jobDescription: z.string().min(20).max(20000),
});

type Summary = {
  role: string;
  company: string;
  location: string;
  remote_type: "remote" | "onsite" | "hybrid";
  salary: string;
  hours_per_week: number | null;
  summary: string;
};

export const summarizeJD = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => SummarizeInput.parse(data))
  .handler(async ({ data }): Promise<Summary> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": key,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "Extract structured info from a job/co-op description. Reply ONLY with valid JSON matching the schema: {role, company, location, remote_type (one of remote|onsite|hybrid), salary, hours_per_week (number of hours per week the role requires, or null), summary}. Keep summary under 240 chars. Use empty string if a field is missing.",
          },
          { role: "user", content: data.jobDescription },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (res.status === 429) throw new Error("Rate limit — try again in a moment.");
    if (res.status === 402) throw new Error("AI credits exhausted. Add credits in workspace billing.");
    if (!res.ok) throw new Error(`AI gateway error: ${res.status}`);

    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const raw = json.choices?.[0]?.message?.content ?? "{}";
    let parsed: Partial<Summary> = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = {};
    }

    const remote = (parsed.remote_type as string)?.toLowerCase();
    const hrs = Number(parsed.hours_per_week);
    return {
      role: parsed.role ?? "",
      company: parsed.company ?? "",
      location: parsed.location ?? "",
      remote_type: remote === "remote" || remote === "hybrid" ? remote : "onsite",
      salary: parsed.salary ?? "",
      hours_per_week: Number.isFinite(hrs) && hrs > 0 && hrs <= 80 ? hrs : null,
      summary: parsed.summary ?? "",
    };
  });
