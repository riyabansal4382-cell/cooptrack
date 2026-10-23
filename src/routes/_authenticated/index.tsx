import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { summarizeJD } from "@/lib/ai.functions";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "CoopTrack — Your pipeline" },
      { name: "description", content: "Track your co-op and internship applications synced across devices." },
    ],
  }),
  component: Index,
});

type Stage = "applied" | "phone_screen" | "interview" | "offer" | "rejected" | "accepted";
type Remote = "remote" | "onsite" | "hybrid";

type Application = {
  id: string;
  user_id: string;
  company: string;
  role: string;
  location: string;
  salary: string;
  salary_amount: number | null;
  notes: string;
  qualifications?: string;
  rating: number;
  stage: Stage;
  remote_type: Remote;
  created_at: string;
  updated_at: string;
};

const STAGES: { id: Stage; label: string; hint: string; accent: string }[] = [
  { id: "applied", label: "Applied", hint: "Submitted", accent: "oklch(0.70 0.10 60)" },
  { id: "phone_screen", label: "Phone Screen", hint: "Recruiter call", accent: "oklch(0.72 0.12 45)" },
  { id: "interview", label: "Interview", hint: "Technical / onsite", accent: "oklch(0.72 0.15 30)" },
  { id: "offer", label: "Offer", hint: "Decision time", accent: "oklch(0.72 0.14 150)" },
  { id: "rejected", label: "Rejected", hint: "Archived", accent: "oklch(0.58 0.14 25)" },
];

const ALL_STAGES: { id: Stage; label: string }[] = [
  ...STAGES.map((s) => ({ id: s.id, label: s.label })),
  { id: "accepted", label: "Accepted" },
];

const REMOTE_META: Record<Remote, { label: string; color: string }> = {
  remote: { label: "Remote", color: "oklch(0.72 0.14 200)" },
  onsite: { label: "On-site", color: "oklch(0.68 0.10 60)" },
  hybrid: { label: "Hybrid", color: "oklch(0.72 0.14 300)" },
};

// Parse a free-form salary string into a comparable annual number.
// "$32/hr" -> 32*40*52; "$85,000" -> 85000; "85k" -> 85000
function parseSalary(s: string): number | null {
  if (!s) return null;
  const cleaned = s.replace(/[,$\s]/g, "").toLowerCase();
  const m = cleaned.match(/(\d+(?:\.\d+)?)(k)?/);
  if (!m) return null;
  let n = parseFloat(m[1]);
  if (m[2] === "k") n *= 1000;
  if (/\/(hr|hour|h)/.test(cleaned) || (n > 5 && n < 500)) {
    // treat as hourly
    return Math.round(n * 40 * 52);
  }
  return Math.round(n);
}

function Index() {
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: apps = [], isLoading } = useQuery({
    queryKey: ["applications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("applications")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Application[];
    },
  });

  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Application | null>(null);
  const [creating, setCreating] = useState<Stage | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<Stage | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);

  const refetch = () => qc.invalidateQueries({ queryKey: ["applications"] });

  const upsert = async (a: Partial<Application> & { id?: string }) => {
    const { data: userRes } = await supabase.auth.getUser();
    const user_id = userRes.user?.id;
    if (!user_id) return;
    const salary_amount = a.salary ? parseSalary(a.salary) : null;
    if (a.id) {
      const { error } = await supabase
        .from("applications")
        .update({
          company: a.company, role: a.role, location: a.location, salary: a.salary,
          salary_amount, notes: a.notes, qualifications: a.qualifications, rating: a.rating, stage: a.stage, remote_type: a.remote_type,
        })
        .eq("id", a.id);
      if (error) { toast.error(error.message); return; }
    } else {
      const { error } = await supabase.from("applications").insert({
        user_id,
        company: a.company ?? "", role: a.role ?? "", location: a.location ?? "",
        salary: a.salary ?? "", salary_amount,
        notes: a.notes ?? "", qualifications: a.qualifications ?? "", rating: a.rating ?? 0,
        stage: a.stage ?? "applied", remote_type: a.remote_type ?? "onsite",
      });
      if (error) { toast.error(error.message); return; }
    }
    refetch();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("applications").delete().eq("id", id);
    if (error) return toast.error(error.message);
    refetch();
  };

  const moveTo = async (id: string, stage: Stage) => {
    // Optimistic
    qc.setQueryData<Application[]>(["applications"], (prev) =>
      (prev ?? []).map((p) => (p.id === id ? { ...p, stage } : p)),
    );
    const { error } = await supabase.from("applications").update({ stage }).eq("id", id);
    if (error) { toast.error(error.message); refetch(); }
  };

  // Space = new application
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editing || creating || compareOpen) return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || t?.isContentEditable) return;
      if (e.code === "Space") { e.preventDefault(); setCreating("applied"); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, creating, compareOpen]);

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filter = (a: Application) =>
      !q || a.company.toLowerCase().includes(q) || a.role.toLowerCase().includes(q) || a.location.toLowerCase().includes(q);
    const map = new Map<Stage, Application[]>();
    for (const s of STAGES) map.set(s.id, []);
    for (const a of apps) if (filter(a)) map.get(a.stage)?.push(a);
    for (const s of STAGES) {
      map.get(s.id)?.sort((x, y) => y.rating - x.rating || +new Date(y.created_at) - +new Date(x.created_at));
    }
    return map;
  }, [apps, query]);

  const stats = useMemo(() => {
    const total = apps.length;
    const byStage = Object.fromEntries(STAGES.map((s) => [s.id, apps.filter((a) => a.stage === s.id).length]));
    const active = total - (byStage.rejected || 0);
    return { total, active, byStage };
  }, [apps]);

  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true, search: { next: undefined } });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-abyss/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <Logo />
            <div>
              <div className="font-display text-lg font-semibold tracking-tight">CoopTrack</div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Co-op &amp; Internship Pipeline
              </div>
            </div>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Stat label="Total" value={stats.total} />
            <Stat label="Active" value={stats.active} tone="accent" />
            <Stat label="Offers" value={stats.byStage.offer || 0} tone="good" />
            <Stat label="Accepted" value={stats.byStage.accepted || 0} tone="good" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search company, role, city…"
              className="h-9 w-56 rounded-md border border-border bg-input/40 px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-steel focus:outline-none"
            />
            <button
              onClick={() => setCompareOpen(true)}
              className="h-9 rounded-md border border-border bg-card/50 px-3 text-sm hover:border-steel"
              title="Salary comparison"
            >
              📊 Compare
            </button>
            <Link
              to="/interviews"
              className="h-9 rounded-md border border-border bg-card/50 px-3 text-sm leading-9 hover:border-steel"
              title="Interview calendar"
            >
              📅 Calendar
            </Link>
            <ExportImport apps={apps} onImported={refetch} />
            <button
              onClick={() => setCreating("applied")}
              className="h-9 rounded-md bg-signal px-3 text-sm font-medium text-abyss transition hover:bg-signal/85"
              title="Shortcut: Space"
            >
              + New
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

      <main className="mx-auto max-w-[1600px] px-6 py-6">
        <AcceptedStrip
          apps={apps.filter((a) => a.stage === "accepted")}
          onOpen={(a) => setEditing(a)}
          onDropAccept={(id) => moveTo(id, "accepted")}
          dragId={dragId}
        />

        <div className="mb-4 flex items-baseline justify-between">
          <h1 className="font-display text-2xl font-semibold tracking-tight">Your pipeline</h1>
          <p className="text-xs text-muted-foreground">
            Drag between columns · Space = new · Enter = save
          </p>
        </div>

        {isLoading ? (
          <div className="grid place-items-center py-20 text-sm text-muted-foreground">Loading your applications…</div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {STAGES.map((s) => {
              const list = grouped.get(s.id) || [];
              const isOver = overStage === s.id;
              return (
                <section
                  key={s.id}
                  onDragOver={(e) => { e.preventDefault(); setOverStage(s.id); }}
                  onDragLeave={() => setOverStage((p) => (p === s.id ? null : p))}
                  onDrop={() => {
                    if (dragId) moveTo(dragId, s.id);
                    setDragId(null); setOverStage(null);
                  }}
                  className={`flex min-h-[70vh] flex-col rounded-xl border transition-colors ${
                    isOver ? "border-steel bg-navy/40" : "border-border/70 bg-card/60"
                  }`}
                >
                  <header className="flex items-center justify-between border-b border-border/60 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.accent }} />
                      <div>
                        <div className="font-display text-sm font-semibold tracking-tight text-foreground">{s.label}</div>
                        <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">{s.hint}</div>
                      </div>
                    </div>
                    <span className="rounded-full bg-muted/60 px-2 py-0.5 text-xs font-medium text-muted-foreground">{list.length}</span>
                  </header>

                  <div className="flex flex-1 flex-col gap-2 p-3">
                    {list.map((a) => (
                      <Card
                        key={a.id}
                        app={a}
                        onOpen={() => setEditing(a)}
                        onDragStart={() => setDragId(a.id)}
                        onDragEnd={() => setDragId(null)}
                      />
                    ))}
                    <button
                      onClick={() => setCreating(s.id)}
                      className="rounded-lg border border-dashed border-border/70 py-2 text-xs text-muted-foreground transition hover:border-steel hover:text-foreground"
                    >
                      + Add here
                    </button>
                  </div>
                </section>
              );
            })}
          </div>
        )}

        <footer className="mt-10 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-4 text-xs text-muted-foreground">
          <span>Synced to Lovable Cloud across your devices.</span>
          <span className="font-display tracking-tight">CoopTrack · v2</span>
        </footer>
      </main>

      {(editing || creating) && (
        <Editor
          initial={
            editing ?? {
              id: "",
              user_id: "",
              company: "", role: "", location: "", salary: "", salary_amount: null,
              notes: "", rating: 3, stage: creating!, remote_type: "onsite",
              created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
            }
          }
          isNew={!editing}
          onClose={() => { setEditing(null); setCreating(null); }}
          onSave={async (a) => {
            await upsert(a);
            setEditing(null); setCreating(null);
          }}
          onDelete={editing ? async () => { await remove(editing.id); setEditing(null); } : undefined}
        />
      )}

      {compareOpen && <CompareModal apps={apps} onClose={() => setCompareOpen(false)} />}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "accent" | "good" }) {
  const color = tone === "accent" ? "text-signal" : tone === "good" ? "text-[oklch(0.82_0.15_140)]" : "text-foreground";
  return (
    <div className="flex items-baseline gap-1.5 rounded-md border border-border/70 bg-card/50 px-3 py-1.5">
      <span className={`font-display text-sm font-semibold ${color}`}>{value}</span>
      <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{label}</span>
    </div>
  );
}

function Card({
  app, onOpen, onDragStart, onDragEnd,
}: { app: Application; onOpen: () => void; onDragStart: () => void; onDragEnd: () => void }) {
  const rem = REMOTE_META[app.remote_type];
  return (
    <article
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      className="group cursor-grab rounded-lg border border-border/70 bg-abyss/60 p-3 text-left transition hover:border-steel hover:bg-abyss/80 active:cursor-grabbing"
      style={{ animation: "card-in 200ms ease-out both" }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-display text-sm font-semibold tracking-tight text-foreground">{app.company || "Untitled"}</h3>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{app.role || "—"}</p>
        </div>
        <Stars value={app.rating} readOnly />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
        <span
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider"
          style={{ background: `color-mix(in oklab, ${rem.color} 20%, transparent)`, color: rem.color }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: rem.color }} />
          {rem.label}
        </span>
        {app.location && (
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(app.location)}`}
            target="_blank" rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="hover:text-signal hover:underline"
            title="Open in Google Maps"
          >
            {app.location} ↗
          </a>
        )}
        {app.salary && (
          <span className="rounded bg-navy/70 px-1.5 py-0.5 font-medium text-frost/90">{app.salary}</span>
        )}
      </div>
      {app.qualifications?.trim() && (
        <div className="mt-2 flex flex-wrap gap-1">
          {app.qualifications.split(/\n|,/).map((q) => q.trim()).filter(Boolean).slice(0, 4).map((q) => (
            <span key={q} className="rounded border border-steel/40 px-1.5 py-0.5 text-[10px] text-frost/80">{q}</span>
          ))}
        </div>
      )}
      {app.notes && (
        <p className="mt-2 line-clamp-2 text-[11px] leading-snug text-muted-foreground/90">{app.notes}</p>
      )}
    </article>
  );
}

function Stars({ value, readOnly, onChange }: { value: number; readOnly?: boolean; onChange?: (n: number) => void }) {
  return (
    <div className="flex shrink-0 items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= value;
        return (
          <button
            key={n} type="button" disabled={readOnly}
            onClick={() => onChange?.(n)}
            className={`text-xs transition ${filled ? "text-signal" : "text-muted-foreground/50"} ${readOnly ? "cursor-default" : "hover:text-signal"}`}
            aria-label={`${n} star${n === 1 ? "" : "s"}`}
          >★</button>
        );
      })}
    </div>
  );
}

function Editor({
  initial, isNew, onClose, onSave, onDelete,
}: {
  initial: Application; isNew: boolean;
  onClose: () => void;
  onSave: (a: Application) => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
}) {
  const [draft, setDraft] = useState<Application>(initial);
  const [jd, setJd] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const runSummarize = useServerFn(summarizeJD);

  const canSave = draft.company.trim().length > 0;
  const trySave = () => { if (canSave) onSave(draft); };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Enter") {
        const t = e.target as HTMLElement | null;
        if (t?.tagName === "TEXTAREA" && !(e.metaKey || e.ctrlKey)) return;
        e.preventDefault(); trySave();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, onClose]);

  const set = <K extends keyof Application>(k: K, v: Application[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  const doSummarize = async () => {
    if (jd.trim().length < 20) { toast.error("Paste a longer description first."); return; }
    setAiBusy(true);
    try {
      const r = await runSummarize({ data: { jobDescription: jd } });
      setDraft((d) => ({
        ...d,
        company: r.company || d.company,
        role: r.role || d.role,
        location: r.location || d.location,
        salary: r.salary || d.salary,
        remote_type: r.remote_type || d.remote_type,
        notes: r.summary ? (d.notes ? d.notes + "\n\n" + r.summary : r.summary) : d.notes,
      }));
      toast.success("Filled from description");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI failed");
    } finally {
      setAiBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-abyss/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold tracking-tight">
            {isNew ? "New application" : "Edit application"}
          </h2>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:text-foreground" aria-label="Close">✕</button>
        </div>

        {isNew && (
          <div className="mt-4 rounded-lg border border-steel/40 bg-steel/5 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-[0.15em] text-steel">✨ AI autofill from job description</span>
              <button
                onClick={doSummarize}
                disabled={aiBusy}
                className="rounded-md bg-steel px-2.5 py-1 text-xs font-medium text-abyss transition hover:bg-steel/85 disabled:opacity-50"
              >
                {aiBusy ? "Summarizing…" : "Summarize"}
              </button>
            </div>
            <textarea
              value={jd}
              onChange={(e) => setJd(e.target.value)}
              placeholder="Paste a job description here — I'll fill in company, role, location, salary, remote type, and a short summary."
              rows={3}
              className="w-full resize-y rounded-md border border-border bg-input/40 px-2.5 py-2 text-xs focus:border-steel focus:outline-none"
            />
          </div>
        )}

        <div className="mt-4 space-y-3">
          <Field label="Company">
            <input autoFocus value={draft.company} onChange={(e) => set("company", e.target.value)}
              placeholder="e.g. Northwind Robotics"
              className="w-full rounded-md border border-border bg-input/40 px-3 py-2 text-sm focus:border-steel focus:outline-none" />
          </Field>
          <Field label="Role">
            <input value={draft.role} onChange={(e) => set("role", e.target.value)}
              placeholder="e.g. Firmware Co-op"
              className="w-full rounded-md border border-border bg-input/40 px-3 py-2 text-sm focus:border-steel focus:outline-none" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Location">
              <input value={draft.location} onChange={(e) => set("location", e.target.value)}
                placeholder="City, State"
                className="w-full rounded-md border border-border bg-input/40 px-3 py-2 text-sm focus:border-steel focus:outline-none" />
            </Field>
            <Field label="Salary">
              <input value={draft.salary} onChange={(e) => set("salary", e.target.value)}
                placeholder="$32/hr or $85,000"
                className="w-full rounded-md border border-border bg-input/40 px-3 py-2 text-sm focus:border-steel focus:outline-none" />
            </Field>
          </div>

          <Field label="Work type">
            <div className="flex gap-1.5">
              {(Object.keys(REMOTE_META) as Remote[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => set("remote_type", r)}
                  className={`flex-1 rounded-md border px-2.5 py-1.5 text-xs transition ${
                    draft.remote_type === r
                      ? "border-signal bg-signal/15 text-foreground"
                      : "border-border/70 text-muted-foreground hover:border-signal"
                  }`}
                >
                  {REMOTE_META[r].label}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Rating">
            <div className="flex items-center gap-3">
              <Stars value={draft.rating} onChange={(n) => set("rating", n)} />
              <span className="text-xs text-muted-foreground">{draft.rating} / 5</span>
            </div>
          </Field>

          <Field label="Specialized qualifications">
            <textarea value={draft.qualifications ?? ""} onChange={(e) => set("qualifications", e.target.value)}
              placeholder="One per line — e.g. Python, AWS certification, security clearance"
              rows={3}
              className="w-full resize-y rounded-md border border-border bg-input/40 px-3 py-2 text-sm focus:border-steel focus:outline-none" />
          </Field>

          <Field label="Notes">
            <textarea value={draft.notes} onChange={(e) => set("notes", e.target.value)}
              placeholder="Interview prep, referrals, deadlines… (⌘/Ctrl+Enter to save)"
              rows={3}
              className="w-full resize-y rounded-md border border-border bg-input/40 px-3 py-2 text-sm focus:border-steel focus:outline-none" />
          </Field>

          <Field label="Stage">
            <div className="flex flex-wrap gap-1.5">
              {ALL_STAGES.map((s) => (
                <button key={s.id} type="button" onClick={() => set("stage", s.id)}
                  className={`rounded-md border px-2.5 py-1 text-xs transition ${
                    draft.stage === s.id
                      ? "border-signal bg-signal/20 text-foreground"
                      : "border-border/70 text-muted-foreground hover:border-signal hover:text-foreground"
                  }`}>
                  {s.label}
                </button>
              ))}
            </div>
          </Field>

          {!isNew && <StageTimeline applicationId={initial.id} currentStage={draft.stage} />}
        </div>

        <div className="mt-5 flex items-center justify-between gap-2">
          <div>
            {onDelete && (
              <button onClick={onDelete}
                className="rounded-md border border-destructive/60 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10">
                Delete
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose}
              className="rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground">Cancel</button>
            <button onClick={trySave} disabled={!canSave} title="Enter"
              className="rounded-md bg-signal px-3 py-1.5 text-sm font-medium text-abyss transition hover:bg-signal/85 disabled:opacity-40">
              Save ⏎
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-[0.15em] text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

const STAGE_LABEL: Record<Stage, string> = {
  applied: "Applied",
  phone_screen: "Phone Screen",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
  accepted: "Accepted",
};

function StageTimeline({ applicationId, currentStage }: { applicationId: string; currentStage: Stage }) {
  const { data: history = [], isLoading } = useQuery({
    queryKey: ["stage-history", applicationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("application_stage_history")
        .select("id, from_stage, to_stage, changed_at")
        .eq("application_id", applicationId)
        .order("changed_at", { ascending: true });
      if (error) throw error;
      return data as {
        id: string;
        from_stage: Stage | null;
        to_stage: Stage;
        changed_at: string;
      }[];
    },
  });

  const fmt = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "short", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit",
    });
  };

  const daysBetween = (a: string, b: string) =>
    Math.round(Math.abs(+new Date(b) - +new Date(a)) / (24 * 3600 * 1000));

  return (
    <div className="rounded-lg border border-border/60 bg-abyss/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground">Stage timeline</span>
        {history.length > 1 && (
          <span className="text-[10px] text-muted-foreground">
            {daysBetween(history[0].changed_at, history[history.length - 1].changed_at)}d total
          </span>
        )}
      </div>
      {isLoading ? (
        <div className="text-xs text-muted-foreground">Loading…</div>
      ) : history.length === 0 ? (
        <div className="text-xs text-muted-foreground">No history yet.</div>
      ) : (
        <ol className="relative space-y-2 border-l border-border/60 pl-4">
          {history.map((h, i) => {
            const isCurrent = i === history.length - 1 && h.to_stage === currentStage;
            const next = history[i + 1];
            const dwell = next ? daysBetween(h.changed_at, next.changed_at) : null;
            return (
              <li key={h.id} className="relative">
                <span
                  className={`absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 ${
                    isCurrent
                      ? "border-signal bg-signal"
                      : "border-border bg-abyss"
                  }`}
                />
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-medium text-foreground">
                    {h.from_stage
                      ? `${STAGE_LABEL[h.from_stage]} → ${STAGE_LABEL[h.to_stage]}`
                      : `Added as ${STAGE_LABEL[h.to_stage]}`}
                  </span>
                  <span className="shrink-0 text-[10px] uppercase tracking-widest text-muted-foreground">
                    {fmt(h.changed_at)}
                  </span>
                </div>
                {dwell != null && (
                  <div className="text-[10px] text-muted-foreground">
                    Stayed {dwell} day{dwell === 1 ? "" : "s"}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function Logo() {
  return (
    <div className="grid h-9 w-9 place-items-center rounded-md bg-signal text-abyss">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="4" width="4" height="16" rx="1" fill="currentColor" />
        <rect x="10" y="4" width="4" height="10" rx="1" fill="currentColor" opacity="0.7" />
        <rect x="17" y="4" width="4" height="6" rx="1" fill="currentColor" opacity="0.4" />
      </svg>
    </div>
  );
}

function AcceptedStrip({
  apps, onOpen, onDropAccept, dragId,
}: {
  apps: Application[]; onOpen: (a: Application) => void;
  onDropAccept: (id: string) => void; dragId: string | null;
}) {
  const [over, setOver] = useState(false);
  return (
    <section
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={() => { if (dragId) onDropAccept(dragId); setOver(false); }}
      className={`mb-5 rounded-xl border p-3 transition-colors ${
        over ? "border-signal bg-signal/10" : "border-signal/40 bg-gradient-to-r from-signal/10 via-transparent to-transparent"
      }`}
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-signal/90 text-abyss">✓</span>
          <div>
            <div className="font-display text-sm font-semibold tracking-tight">Accepted</div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Signed offers · drop here</div>
          </div>
          <span className="ml-1 rounded-full bg-signal/25 px-2 py-0.5 text-xs font-medium text-signal">{apps.length}</span>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {apps.length === 0 ? (
            <span className="text-xs italic text-muted-foreground">Drag an offer here once you accept it.</span>
          ) : (
            apps.map((a) => (
              <button key={a.id} onClick={() => onOpen(a)}
                className="group flex items-center gap-2 rounded-full border border-signal/40 bg-abyss/50 px-3 py-1 text-xs transition hover:border-signal hover:bg-signal/15">
                <span className="font-display font-semibold text-foreground">{a.company}</span>
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground">{a.role}</span>
                {a.location && <span className="text-muted-foreground/70">· {a.location}</span>}
              </button>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

/* ---------- Salary compare ---------- */

function CompareModal({ apps, onClose }: { apps: Application[]; onClose: () => void }) {
  const data = useMemo(() => {
    return apps
      .map((a) => ({
        name: a.company || "—",
        role: a.role,
        annual: a.salary_amount ?? parseSalary(a.salary) ?? 0,
        raw: a.salary,
        stage: a.stage,
      }))
      .filter((d) => d.annual > 0)
      .sort((a, b) => b.annual - a.annual);
  }, [apps]);

  const stats = useMemo(() => {
    if (!data.length) return null;
    const nums = data.map((d) => d.annual);
    const avg = Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
    const median = [...nums].sort((a, b) => a - b)[Math.floor(nums.length / 2)];
    return { avg, median, max: Math.max(...nums), min: Math.min(...nums), n: nums.length };
  }, [data]);

  const fmt = (n: number) =>
    n >= 1000 ? `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `$${n}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-abyss/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold tracking-tight">Salary comparison</h2>
            <p className="text-xs text-muted-foreground">Normalized to annualized ($/hr × 40 × 52).</p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:text-foreground">✕</button>
        </div>

        {!stats ? (
          <div className="grid place-items-center py-16 text-sm text-muted-foreground">
            Add salary to your applications to see the comparison.
          </div>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <StatCard label="Avg" value={fmt(stats.avg)} />
              <StatCard label="Median" value={fmt(stats.median)} />
              <StatCard label="High" value={fmt(stats.max)} tone="good" />
              <StatCard label="Low" value={fmt(stats.min)} />
            </div>

            <div className="mt-5 h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 40 }}>
                  <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" angle={-25} textAnchor="end" interval={0}
                    tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }} />
                  <YAxis tickFormatter={fmt} tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }} />
                  <Tooltip
                    cursor={{ fill: "color-mix(in oklab, var(--color-signal) 10%, transparent)" }}
                    contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }}
                    formatter={(v: number) => [fmt(v), "Annualized"]}
                    labelFormatter={(l, p) => `${l} — ${p?.[0]?.payload?.role ?? ""} (${p?.[0]?.payload?.raw ?? ""})`}
                  />
                  <Bar dataKey="annual" radius={[6, 6, 0, 0]}>
                    {data.map((d, i) => (
                      <Cell key={i} fill={d.annual === stats.max ? "var(--color-signal)" : "var(--color-steel)"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-4 overflow-hidden rounded-lg border border-border/60">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Company</th>
                    <th className="px-3 py-2 text-left">Role</th>
                    <th className="px-3 py-2 text-right">Listed</th>
                    <th className="px-3 py-2 text-right">Annualized</th>
                    <th className="px-3 py-2 text-right">vs Avg</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((d) => {
                    const diff = d.annual - stats.avg;
                    const pct = ((diff / stats.avg) * 100).toFixed(0);
                    return (
                      <tr key={d.name + d.role} className="border-t border-border/50">
                        <td className="px-3 py-2 font-medium">{d.name}</td>
                        <td className="px-3 py-2 text-muted-foreground">{d.role}</td>
                        <td className="px-3 py-2 text-right text-muted-foreground">{d.raw}</td>
                        <td className="px-3 py-2 text-right font-semibold">{fmt(d.annual)}</td>
                        <td className={`px-3 py-2 text-right ${diff >= 0 ? "text-[oklch(0.82_0.15_140)]" : "text-destructive"}`}>
                          {diff >= 0 ? "+" : ""}{pct}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone?: "good" }) {
  return (
    <div className="rounded-md border border-border/70 bg-abyss/40 px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      <div className={`font-display text-lg font-semibold ${tone === "good" ? "text-[oklch(0.82_0.15_140)]" : "text-foreground"}`}>{value}</div>
    </div>
  );
}

/* ---------- Export / Import ---------- */

function ExportImport({ apps, onImported }: { apps: Application[]; onImported: () => void }) {
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const download = (name: string, content: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  };

  const exportJson = () => {
    download(`cooptrack-${Date.now()}.json`, JSON.stringify(apps, null, 2), "application/json");
    setOpen(false);
  };

  const exportCsv = () => {
    const cols = ["company", "role", "location", "remote_type", "salary", "rating", "stage", "notes", "created_at"] as const;
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = [cols.join(","), ...apps.map((a) => cols.map((c) => esc((a as Record<string, unknown>)[c])).join(","))];
    download(`cooptrack-${Date.now()}.csv`, rows.join("\n"), "text/csv");
    setOpen(false);
  };

  const importFile = async (file: File) => {
    const text = await file.text();
    const { data: userRes } = await supabase.auth.getUser();
    const user_id = userRes.user?.id;
    if (!user_id) return;

    let rows: Partial<Application>[] = [];
    try {
      if (file.name.endsWith(".json")) {
        rows = JSON.parse(text);
      } else {
        // simple CSV parser
        const lines = text.split(/\r?\n/).filter(Boolean);
        const headers = parseCsvLine(lines[0]);
        rows = lines.slice(1).map((ln) => {
          const cells = parseCsvLine(ln);
          const o: Record<string, string> = {};
          headers.forEach((h, i) => (o[h] = cells[i] ?? ""));
          return o as unknown as Partial<Application>;
        });
      }
    } catch {
      toast.error("Could not parse file");
      return;
    }

    const payload = rows.map((r) => ({
      user_id,
      company: r.company ?? "",
      role: r.role ?? "",
      location: r.location ?? "",
      salary: r.salary ?? "",
      salary_amount: r.salary ? parseSalary(String(r.salary)) : null,
      notes: r.notes ?? "",
      rating: Number(r.rating ?? 0) || 0,
      stage: (r.stage as Stage) ?? "applied",
      remote_type: (r.remote_type as Remote) ?? "onsite",
    })).filter((r) => r.company);

    if (!payload.length) { toast.error("No valid rows found"); return; }
    const { error } = await supabase.from("applications").insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success(`Imported ${payload.length} application${payload.length === 1 ? "" : "s"}`);
    onImported();
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="h-9 rounded-md border border-border bg-card/50 px-3 text-sm hover:border-steel"
      >
        ⇅ Data
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 z-50 w-48 rounded-md border border-border bg-popover p-1 shadow-xl">
            <MenuItem onClick={exportJson}>Export JSON</MenuItem>
            <MenuItem onClick={exportCsv}>Export CSV</MenuItem>
            <div className="my-1 h-px bg-border/70" />
            <MenuItem onClick={() => fileRef.current?.click()}>Import JSON / CSV…</MenuItem>
          </div>
        </>
      )}
      <input
        ref={fileRef} type="file" accept=".json,.csv" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ""; }}
      />
    </div>
  );
}

function MenuItem({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="block w-full rounded px-3 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground">
      {children}
    </button>
  );
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = ""; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQ = false;
      else cur += c;
    } else {
      if (c === ",") { out.push(cur); cur = ""; }
      else if (c === '"') inQ = true;
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}
