import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_BASE_URL = "https://connector-gateway.lovable.dev";
const CONNECTOR_ID = "google_calendar";

const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/calendar.events",
];

// ---- OAuth start ----
export const startGCalConnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((targetOrigin: string) => z.string().url().parse(targetOrigin))
  .handler(async ({ data: targetOrigin, context }) => {
    const clientKey = process.env.GOOGLE_CALENDAR_APP_USER_CONNECTOR_CLIENT_API_KEY;
    if (!clientKey) throw new Error("Google Calendar connector is not configured");
    const { authorizeAppUserOAuth } = await import("@/integrations/lovable/appUserConnector");
    const { authorizationUrl } = await authorizeAppUserOAuth({
      gatewayBaseUrl: GATEWAY_BASE_URL,
      connectorId: CONNECTOR_ID,
      appUserId: context.userId,
      clientAPIKey: clientKey,
      returnUrl: targetOrigin,
      responseMode: "web_message",
      webMessageTargetOrigin: targetOrigin,
      credentialsConfiguration: { scopes: GOOGLE_SCOPES },
    });
    return { authorizationUrl };
  });

// ---- Persist connection key ----
export const saveGCalConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { connectionAPIKey: string }) =>
    z.object({ connectionAPIKey: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { saveConnectionKeyForUser } = await import("@/server/appUserConnections.server");
    await saveConnectionKeyForUser(context.userId, CONNECTOR_ID, data.connectionAPIKey);
    return { ok: true };
  });

// ---- Status ----
export const getGCalStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getConnectionKeyForUser } = await import("@/server/appUserConnections.server");
    const key = await getConnectionKeyForUser(context.userId, CONNECTOR_ID);
    return { connected: !!key };
  });

// ---- Disconnect ----
export const disconnectGCal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getConnectionKeyForUser, deleteConnectionKeyForUser } = await import(
      "@/server/appUserConnections.server"
    );
    const key = await getConnectionKeyForUser(context.userId, CONNECTOR_ID);
    if (key) {
      try {
        const { disconnectAppUser } = await import("@/integrations/lovable/appUserConnector");
        await disconnectAppUser(GATEWAY_BASE_URL, key, CONNECTOR_ID);
      } catch {
        // ignore gateway errors, still clear locally
      }
    }
    await deleteConnectionKeyForUser(context.userId, CONNECTOR_ID);
    return { ok: true };
  });

// ---- Helpers ----
async function callGCal(userId: string, path: string, init?: RequestInit) {
  const { getConnectionKeyForUser } = await import("@/server/appUserConnections.server");
  const key = await getConnectionKeyForUser(userId, CONNECTOR_ID);
  if (!key) throw new Error("Google Calendar is not connected");
  const { callAsAppUser } = await import("@/integrations/lovable/appUserConnector");
  return callAsAppUser({
    gatewayBaseUrl: GATEWAY_BASE_URL,
    connectionAPIKey: key,
    connectorId: CONNECTOR_ID,
    path,
    init,
  });
}

function buildEventBody(input: {
  title: string;
  scheduled_at: string;
  duration_minutes: number;
  location?: string;
  meeting_url?: string;
  notes?: string;
}) {
  const start = new Date(input.scheduled_at);
  const end = new Date(start.getTime() + (input.duration_minutes || 60) * 60_000);
  const descriptionParts: string[] = [];
  if (input.meeting_url) descriptionParts.push(`Meeting URL: ${input.meeting_url}`);
  if (input.notes) descriptionParts.push(input.notes);
  return {
    summary: input.title || "Interview",
    location: input.location || undefined,
    description: descriptionParts.join("\n\n") || undefined,
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
    source: input.meeting_url ? { title: "Meeting link", url: input.meeting_url } : undefined,
  };
}

// ---- Create / update event ----
export const syncInterviewToGCal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      google_event_id?: string | null;
      title: string;
      scheduled_at: string;
      duration_minutes: number;
      location?: string;
      meeting_url?: string;
      notes?: string;
    }) =>
      z
        .object({
          google_event_id: z.string().nullable().optional(),
          title: z.string(),
          scheduled_at: z.string(),
          duration_minutes: z.number().int().positive(),
          location: z.string().optional(),
          meeting_url: z.string().optional(),
          notes: z.string().optional(),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    const body = buildEventBody(data);
    const path = data.google_event_id
      ? `/calendar/v3/calendars/primary/events/${encodeURIComponent(data.google_event_id)}`
      : `/calendar/v3/calendars/primary/events`;
    const method = data.google_event_id ? "PATCH" : "POST";
    const res = await callGCal(context.userId, path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      // If PATCH fails because event was deleted upstream, create a new one
      if (data.google_event_id && (res.status === 404 || res.status === 410)) {
        const createRes = await callGCal(context.userId, `/calendar/v3/calendars/primary/events`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!createRes.ok) {
          throw new Error(`Google Calendar create failed [${createRes.status}]: ${await createRes.text()}`);
        }
        const created = (await createRes.json()) as { id: string };
        return { google_event_id: created.id };
      }
      throw new Error(`Google Calendar sync failed [${res.status}]: ${text}`);
    }
    const event = (await res.json()) as { id: string };
    return { google_event_id: event.id };
  });

// ---- Delete event ----
export const deleteGCalEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { google_event_id: string }) =>
    z.object({ google_event_id: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const res = await callGCal(
      context.userId,
      `/calendar/v3/calendars/primary/events/${encodeURIComponent(data.google_event_id)}`,
      { method: "DELETE" },
    );
    if (!res.ok && res.status !== 404 && res.status !== 410) {
      throw new Error(`Google Calendar delete failed [${res.status}]: ${await res.text()}`);
    }
    return { ok: true };
  });

// ---- Import events ----
export const importGCalEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { days?: number }) =>
    z.object({ days: z.number().int().positive().max(365).optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const days = data.days ?? 90;
    const timeMin = new Date().toISOString();
    const timeMax = new Date(Date.now() + days * 24 * 3600 * 1000).toISOString();
    const path =
      `/calendar/v3/calendars/primary/events?` +
      new URLSearchParams({
        timeMin,
        timeMax,
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: "250",
      }).toString();
    const res = await callGCal(context.userId, path);
    if (!res.ok) throw new Error(`Google Calendar list failed [${res.status}]: ${await res.text()}`);
    const payload = (await res.json()) as {
      items?: Array<{
        id: string;
        summary?: string;
        description?: string;
        location?: string;
        hangoutLink?: string;
        start?: { dateTime?: string; date?: string };
        end?: { dateTime?: string; date?: string };
      }>;
    };
    const items = payload.items ?? [];

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Filter out ones already imported
    const existingIds = new Set<string>();
    if (items.length > 0) {
      const { data: existing } = await supabaseAdmin
        .from("interviews")
        .select("google_event_id")
        .eq("user_id", context.userId)
        .not("google_event_id", "is", null);
      for (const row of existing ?? []) {
        if (row.google_event_id) existingIds.add(row.google_event_id);
      }
    }

    const toInsert = items
      .filter((e) => e.start?.dateTime && !existingIds.has(e.id))
      .map((e) => {
        const start = new Date(e.start!.dateTime!);
        const end = e.end?.dateTime ? new Date(e.end.dateTime) : new Date(start.getTime() + 60 * 60_000);
        const duration = Math.max(15, Math.round((end.getTime() - start.getTime()) / 60_000));
        return {
          user_id: context.userId,
          title: e.summary ?? "Untitled event",
          scheduled_at: start.toISOString(),
          duration_minutes: duration,
          location: e.location ?? "",
          meeting_url: e.hangoutLink ?? "",
          notes: e.description ?? "",
          google_event_id: e.id,
        };
      });

    if (toInsert.length === 0) return { imported: 0, scanned: items.length };

    const { error } = await supabaseAdmin.from("interviews").insert(toInsert);
    if (error) throw new Error(error.message);
    return { imported: toInsert.length, scanned: items.length };
  });
