import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { connectAppUser } from "@/integrations/lovable/appUserConnectorClient";
import {
  startGCalConnect,
  saveGCalConnection,
  getGCalStatus,
  disconnectGCal,
  syncInterviewToGCal,
  deleteGCalEvent,
  importGCalEvents,
} from "@/lib/gcal.functions";

export const Route = createFileRoute("/_authenticated/interviews")({
  head: () => ({
    meta: [
      { title: "CoopTrack — Interview Calendar" },
      { name: "description", content: "Track and schedule all your upcoming interviews on one calendar." },
    ],
  }),
  component: Interviews,
});

type Interview = {
  id: string;
  user_id: string;
  application_id: string | null;
  title: string;
  scheduled_at: string;
  duration_minutes: number;
  location: string;
  meeting_url: string;
  notes: string;
  google_event_id?: string | null;
};

type AppLite = { id: string; company: string; role: string };

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function addMonths(d: Date, n: number) { return new Date(d.getFullYear(), d.getMonth() + n, 1); }

function Interviews() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [editing, setEditing] = useState<Interview | null>(null);
  const [creatingDate, setCreatingDate] = useState<string | null>(null);

  const { data: interviews = [], isLoading } = useQuery({
    queryKey: ["interviews"],
    queryFn: async () => {
      const { data, error } = await supabase.from("interviews").select("*").order("scheduled_at");
      if (error) throw error;
      return data as Interview[];
    },
  });

  const { data: apps = [] } = useQuery({
    queryKey: ["applications", "lite"],
    queryFn: async () => {
      const { data, error } = await supabase.from("applications").select("id, company, role").order("company");
      if (error) throw error;
      return data as AppLite[];
    },
  });

  const refetch = () => qc.invalidateQueries({ queryKey: ["interviews"] });

  const { data: gcalStatus, refetch: refetchGCal } = useQuery({
    queryKey: ["gcal-status"],
    queryFn: () => runGetStatus(),
  });
  const runGetStatus = useServerFn(getGCalStatus);
  const runStartConnect = useServerFn(startGCalConnect);
  const runSaveConnection = useServerFn(saveGCalConnection);
  const runDisconnect = useServerFn(disconnectGCal);
  const runSync = useServerFn(syncInterviewToGCal);
  const runDeleteEvent = useServerFn(deleteGCalEvent);
  const runImport = useServerFn(importGCalEvents);
  const [gcalBusy, setGcalBusy] = useState(false);

  const connectGCal = async () => {
    setGcalBusy(true);
    try {
      const result = await connectAppUser({
        connectorId: "google_calendar",
        gatewayBaseUrl: "https://connector-gateway.lovable.dev",
        start: (targetOrigin) => runStartConnect({ data: targetOrigin }),
      });
      if (!result.success) {
        toast.error(result.error ?? "Connection cancelled");
        return;
      }
      if (result.connectionAPIKey) {
        await runSaveConnection({ data: { connectionAPIKey: result.connectionAPIKey } });
      }
      toast.success("Google Calendar connected");
      refetchGCal();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to connect");
    } finally {
      setGcalBusy(false);
    }
  };

  const disconnectGCalAction = async () => {
    setGcalBusy(true);
    try {
      await runDisconnect({});
      toast.success("Google Calendar disconnected");
      refetchGCal();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to disconnect");
    } finally {
      setGcalBusy(false);
    }
  };

  const importGCal = async () => {
    setGcalBusy(true);
    try {
      const r = await runImport({ data: { days: 90 } });
      toast.success(`Imported ${r.imported} event${r.imported === 1 ? "" : "s"} from Google Calendar`);
      refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setGcalBusy(false);
    }
  };

  const upsert = async (i: Partial<Interview> & { id?: string }) => {
    const { data: u } = await supabase.auth.getUser();
    const user_id = u.user?.id;
    if (!user_id) return;

    // Sync to Google Calendar first (if connected), so we can store the returned event id.
    let googleEventId: string | null = i.google_event_id ?? null;
    if (gcalStatus?.connected) {
      try {
        const r = await runSync({
          data: {
            google_event_id: googleEventId,
            title: i.title ?? "",
            scheduled_at: i.scheduled_at!,
            duration_minutes: i.duration_minutes ?? 60,
            location: i.location,
            meeting_url: i.meeting_url,
            notes: i.notes,
          },
        });
        googleEventId = r.google_event_id;
      } catch (e) {
        toast.error(`Calendar sync failed: ${e instanceof Error ? e.message : "unknown error"}`);
      }
    }

    if (i.id) {
      const { error } = await supabase.from("interviews").update({
        title: i.title, scheduled_at: i.scheduled_at, duration_minutes: i.duration_minutes,
        location: i.location, meeting_url: i.meeting_url, notes: i.notes,
        application_id: i.application_id || null,
        google_event_id: googleEventId,
      }).eq("id", i.id);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("interviews").insert({
        user_id,
        title: i.title ?? "", scheduled_at: i.scheduled_at!,
        duration_minutes: i.duration_minutes ?? 60,
        location: i.location ?? "", meeting_url: i.meeting_url ?? "",
        notes: i.notes ?? "", application_id: i.application_id || null,
        google_event_id: googleEventId,
      });
      if (error) return toast.error(error.message);
    }
    toast.success(gcalStatus?.connected ? "Interview saved & synced" : "Interview saved");
    refetch();
  };


  const remove = async (id: string) => {
    const iv = interviews.find((x) => x.id === id);
    if (iv?.google_event_id && gcalStatus?.connected) {
      try {
        await runDeleteEvent({ data: { google_event_id: iv.google_event_id } });
      } catch (e) {
        toast.error(`Calendar delete failed: ${e instanceof Error ? e.message : "unknown"}`);
      }
    }
    const { error } = await supabase.from("interviews").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Interview removed");
    refetch();
  };

  // Build 6-week grid
  const cells = useMemo(() => {
    const first = startOfMonth(month);
    const startWeekday = first.getDay();
    const startDate = new Date(first);
    startDate.setDate(1 - startWeekday);
    const days: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(startDate);
      d.setDate(startDate.getDate() + i);
      days.push(d);
    }
    return days;
  }, [month]);

  const byDay = useMemo(() => {
    const map = new Map<string, Interview[]>();
    for (const iv of interviews) {
      const key = ymd(new Date(iv.scheduled_at));
      const list = map.get(key) ?? [];
      list.push(iv);
      map.set(key, list);
    }
    for (const list of map.values()) list.sort((a, b) => +new Date(a.scheduled_at) - +new Date(b.scheduled_at));
    return map;
  }, [interviews]);

  const upcoming = useMemo(() => {
    const now = Date.now();
    return interviews.filter((i) => +new Date(i.scheduled_at) >= now - 24 * 3600 * 1000).slice(0, 8);
  }, [interviews]);

  const signOut = async () => {
    await qc.cancelQueries(); qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  const monthLabel = month.toLocaleString(undefined, { month: "long", year: "numeric" });
  const todayKey = ymd(new Date());

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-abyss/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-md bg-signal/15 text-signal">📅</div>
            <div>
              <div className="font-display text-lg font-semibold tracking-tight">Interview Calendar</div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                All your upcoming interviews
              </div>
            </div>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Link
              to="/"
              className="h-9 rounded-md border border-border bg-card/50 px-3 text-sm leading-9 hover:border-steel"
            >
              ← Pipeline
            </Link>
            {gcalStatus?.connected ? (
              <>
                <span className="hidden items-center gap-1.5 rounded-md border border-signal/40 bg-signal/10 px-2.5 py-1 text-[11px] uppercase tracking-widest text-signal sm:inline-flex">
                  <span className="h-1.5 w-1.5 rounded-full bg-signal" /> Google Calendar
                </span>
                <button
                  onClick={importGCal}
                  disabled={gcalBusy}
                  className="h-9 rounded-md border border-border bg-card/50 px-3 text-sm hover:border-steel disabled:opacity-50"
                  title="Import upcoming events from your Google Calendar"
                >
                  ↓ Import
                </button>
                <button
                  onClick={disconnectGCalAction}
                  disabled={gcalBusy}
                  className="h-9 rounded-md border border-border px-3 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                  title="Disconnect Google Calendar"
                >
                  Disconnect Google
                </button>
              </>
            ) : (
              <button
                onClick={connectGCal}
                disabled={gcalBusy}
                className="h-9 rounded-md border border-border bg-card/50 px-3 text-sm hover:border-steel disabled:opacity-50"
                title="Connect Google Calendar to sync interviews"
              >
                {gcalBusy ? "Connecting…" : "Connect Google Calendar"}
              </button>
            )}
            <button
              onClick={() => {
                setCreatingDate(todayKey);
                setEditing(null);
              }}
              className="h-9 rounded-md bg-signal px-3 text-sm font-medium text-abyss transition hover:bg-signal/85"
            >
              + New Interview
            </button>
            <button
              onClick={signOut}
              className="h-9 rounded-md border border-border px-3 text-xs text-muted-foreground hover:text-foreground"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1600px] gap-6 px-6 py-6 lg:grid-cols-[1fr_320px]">
        <section className="rounded-xl border border-border/70 bg-card/60 p-4">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setMonth(addMonths(month, -1))}
                className="h-8 w-8 rounded-md border border-border bg-abyss/60 text-sm hover:border-steel"
              >‹</button>
              <button
                onClick={() => setMonth(startOfMonth(new Date()))}
                className="h-8 rounded-md border border-border bg-abyss/60 px-3 text-xs uppercase tracking-widest text-muted-foreground hover:border-steel"
              >Today</button>
              <button
                onClick={() => setMonth(addMonths(month, 1))}
                className="h-8 w-8 rounded-md border border-border bg-abyss/60 text-sm hover:border-steel"
              >›</button>
            </div>
            <h2 className="font-display text-xl font-semibold tracking-tight">{monthLabel}</h2>
            <div className="w-[104px]" />
          </div>

          <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-border/60 bg-border/60 text-xs">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} className="bg-abyss/70 px-2 py-1.5 text-center text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                {d}
              </div>
            ))}
            {cells.map((d, i) => {
              const key = ymd(d);
              const list = byDay.get(key) ?? [];
              const inMonth = d.getMonth() === month.getMonth();
              const isToday = key === todayKey;
              return (
                <div
                  key={i}
                  className={`min-h-[100px] cursor-pointer bg-card/70 p-1.5 transition hover:bg-card ${inMonth ? "" : "opacity-45"}`}
                  onClick={() => { setCreatingDate(key); setEditing(null); }}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-medium ${isToday ? "bg-signal text-abyss" : "text-muted-foreground"}`}>
                      {d.getDate()}
                    </span>
                    {list.length > 0 && (
                      <span className="text-[10px] text-muted-foreground">{list.length}</span>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    {list.slice(0, 3).map((iv) => {
                      const t = new Date(iv.scheduled_at);
                      const app = apps.find((a) => a.id === iv.application_id);
                      return (
                        <button
                          key={iv.id}
                          onClick={(e) => { e.stopPropagation(); setEditing(iv); setCreatingDate(null); }}
                          className="truncate rounded bg-signal/15 px-1.5 py-0.5 text-left text-[10px] text-signal hover:bg-signal/25"
                          title={`${iv.title || app?.company || "Interview"} @ ${t.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`}
                        >
                          {t.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · {iv.title || app?.company || "Interview"}
                        </button>
                      );
                    })}
                    {list.length > 3 && <span className="pl-1 text-[10px] text-muted-foreground">+{list.length - 3} more</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <aside className="flex flex-col gap-4">
          <div className="rounded-xl border border-border/70 bg-card/60 p-4">
            <h3 className="mb-3 font-display text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">Upcoming</h3>
            {isLoading ? (
              <p className="text-xs text-muted-foreground">Loading…</p>
            ) : upcoming.length === 0 ? (
              <p className="text-xs text-muted-foreground">No interviews scheduled. Click a day to add one.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {upcoming.map((iv) => {
                  const t = new Date(iv.scheduled_at);
                  const app = apps.find((a) => a.id === iv.application_id);
                  return (
                    <li key={iv.id}>
                      <button
                        onClick={() => { setEditing(iv); setCreatingDate(null); }}
                        className="w-full rounded-lg border border-border/70 bg-abyss/60 p-3 text-left transition hover:border-steel"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-display text-sm font-semibold">
                            {iv.title || app?.company || "Interview"}
                          </span>
                          <span className="shrink-0 text-[10px] uppercase tracking-widest text-signal">
                            {t.toLocaleDateString([], { month: "short", day: "numeric" })}
                          </span>
                        </div>
                        <div className="mt-1 text-[11px] text-muted-foreground">
                          {t.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · {iv.duration_minutes}min
                          {app && ` · ${app.role}`}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>
      </main>

      {(editing || creatingDate) && (
        <InterviewEditor
          initial={
            editing ?? {
              id: "", user_id: "", application_id: null,
              title: "", scheduled_at: new Date(`${creatingDate}T10:00`).toISOString(),
              duration_minutes: 60, location: "", meeting_url: "", notes: "",
            }
          }
          isNew={!editing}
          apps={apps}
          onClose={() => { setEditing(null); setCreatingDate(null); }}
          onSave={async (i) => { await upsert(i); setEditing(null); setCreatingDate(null); }}
          onDelete={editing ? async () => { await remove(editing.id); setEditing(null); } : undefined}
        />
      )}
    </div>
  );
}

function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function InterviewEditor({
  initial, isNew, apps, onClose, onSave, onDelete,
}: {
  initial: Interview;
  isNew: boolean;
  apps: AppLite[];
  onClose: () => void;
  onSave: (i: Interview) => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
}) {
  const [draft, setDraft] = useState<Interview>(initial);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = () => {
    if (!draft.scheduled_at) return toast.error("Pick a date/time");
    onSave(draft);
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-abyss/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-xl border border-border/70 bg-card p-5 shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold tracking-tight">
            {isNew ? "Schedule Interview" : "Edit Interview"}
          </h2>
          <button onClick={onClose} className="text-sm text-muted-foreground hover:text-foreground">✕</button>
        </div>

        <div className="grid gap-3">
          <Field label="Title">
            <input
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder="e.g. Technical round, HM call"
              className={inp}
            />
          </Field>

          <Field label="Linked Application">
            <select
              value={draft.application_id ?? ""}
              onChange={(e) => setDraft({ ...draft, application_id: e.target.value || null })}
              className={inp}
            >
              <option value="">— None —</option>
              {apps.map((a) => (
                <option key={a.id} value={a.id}>{a.company} · {a.role}</option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Date & Time">
              <input
                type="datetime-local"
                value={toLocalInput(draft.scheduled_at)}
                onChange={(e) => setDraft({ ...draft, scheduled_at: new Date(e.target.value).toISOString() })}
                className={inp}
              />
            </Field>
            <Field label="Duration (min)">
              <input
                type="number" min={5} step={5}
                value={draft.duration_minutes}
                onChange={(e) => setDraft({ ...draft, duration_minutes: parseInt(e.target.value) || 60 })}
                className={inp}
              />
            </Field>
          </div>

          <Field label="Location">
            <input
              value={draft.location}
              onChange={(e) => setDraft({ ...draft, location: e.target.value })}
              placeholder="Office address or 'Remote'"
              className={inp}
            />
          </Field>

          <Field label="Meeting URL">
            <input
              value={draft.meeting_url}
              onChange={(e) => setDraft({ ...draft, meeting_url: e.target.value })}
              placeholder="https://meet.google.com/…"
              className={inp}
            />
          </Field>

          <Field label="Notes">
            <textarea
              value={draft.notes}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              rows={3}
              placeholder="Interviewer names, prep topics, questions…"
              className={`${inp} min-h-[80px] resize-y`}
            />
          </Field>
        </div>

        <div className="mt-5 flex items-center justify-between">
          <div>
            {onDelete && (
              <button
                onClick={onDelete}
                className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:border-[oklch(0.58_0.14_25)] hover:text-[oklch(0.72_0.15_25)]"
              >
                Delete
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground">
              Cancel
            </button>
            <button
              onClick={save}
              className="rounded-md bg-signal px-4 py-1.5 text-sm font-medium text-abyss hover:bg-signal/85"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

const inp = "h-9 w-full rounded-md border border-border bg-abyss/60 px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-steel focus:outline-none";
