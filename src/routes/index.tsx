import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CoopTrack — Kanban tracker for co-op applications" },
      {
        name: "description",
        content:
          "Track your co-op and internship applications on a 5-column kanban board. Rate opportunities and move them from Applied to Offer.",
      },
    ],
  }),
  component: Index,
});

type Stage = "applied" | "phone" | "interview" | "offer" | "rejected" | "accepted";

type Application = {
  id: string;
  company: string;
  role: string;
  location: string;
  salary: string;
  notes: string;
  rating: number; // 0-5
  stage: Stage;
  createdAt: number;
};

const STAGES: { id: Stage; label: string; hint: string; accent: string }[] = [
  { id: "applied", label: "Applied", hint: "Submitted", accent: "oklch(0.70 0.10 60)" },
  { id: "phone", label: "Phone Screen", hint: "Recruiter call", accent: "oklch(0.72 0.12 45)" },
  { id: "interview", label: "Interview", hint: "Technical / onsite", accent: "oklch(0.72 0.15 30)" },
  { id: "offer", label: "Offer", hint: "Decision time", accent: "oklch(0.72 0.14 150)" },
  { id: "rejected", label: "Rejected", hint: "Archived", accent: "oklch(0.58 0.14 25)" },
];

const STORAGE_KEY = "cooptrack.applications.v2";


const SEED: Application[] = [
  { id: "s1", company: "Northwind Robotics", role: "Firmware Co-op", location: "Boston, MA", salary: "$32/hr", notes: "Referred by Priya. Second-round scheduled.", rating: 5, stage: "interview", createdAt: Date.now() - 86400000 * 6 },
  { id: "s2", company: "Meridian Capital", role: "Quant Intern", location: "New York, NY", salary: "$45/hr", notes: "HR call went well — waiting on technical.", rating: 4, stage: "phone", createdAt: Date.now() - 86400000 * 4 },
  { id: "s3", company: "Aster Health", role: "Data Science Co-op", location: "Remote", salary: "$28/hr", notes: "", rating: 3, stage: "applied", createdAt: Date.now() - 86400000 * 2 },
  { id: "s4", company: "Kite & Co.", role: "Product Design Intern", location: "Toronto, ON", salary: "$26/hr", notes: "Offer expires Fri.", rating: 4, stage: "offer", createdAt: Date.now() - 86400000 * 10 },
  { id: "s5", company: "Vortex Systems", role: "Backend Engineer Co-op", location: "Austin, TX", salary: "$34/hr", notes: "Rejected after onsite.", rating: 2, stage: "rejected", createdAt: Date.now() - 86400000 * 14 },
  { id: "s6", company: "Halcyon Studios", role: "Graphics Co-op", location: "Montreal, QC", salary: "$30/hr", notes: "", rating: 5, stage: "applied", createdAt: Date.now() - 86400000 * 1 },
  { id: "s7", company: "Lumen Labs", role: "ML Research Co-op", location: "Seattle, WA", salary: "$40/hr", notes: "Signed! Starts May 20.", rating: 5, stage: "accepted", createdAt: Date.now() - 86400000 * 20 },
];


function loadApps(): Application[] {
  if (typeof window === "undefined") return SEED;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return SEED;
    const parsed = JSON.parse(raw) as Application[];
    return Array.isArray(parsed) && parsed.length ? parsed : SEED;
  } catch {
    return SEED;
  }
}

function Index() {
  const [apps, setApps] = useState<Application[]>(SEED);
  const [hydrated, setHydrated] = useState(false);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Application | null>(null);
  const [creating, setCreating] = useState<Stage | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<Stage | null>(null);

  useEffect(() => {
    setApps(loadApps());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(apps));
  }, [apps, hydrated]);

  // Space = new application (when not typing & no modal open)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editing || creating) return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || t?.isContentEditable) return;
      if (e.code === "Space") {
        e.preventDefault();
        setCreating("applied");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, creating]);


  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filter = (a: Application) =>
      !q ||
      a.company.toLowerCase().includes(q) ||
      a.role.toLowerCase().includes(q) ||
      a.location.toLowerCase().includes(q);
    const map = new Map<Stage, Application[]>();
    for (const s of STAGES) map.set(s.id, []);
    for (const a of apps) if (filter(a)) map.get(a.stage)?.push(a);
    for (const s of STAGES) {
      map.get(s.id)?.sort((x, y) => y.rating - x.rating || y.createdAt - x.createdAt);
    }
    return map;
  }, [apps, query]);

  const stats = useMemo(() => {
    const total = apps.length;
    const byStage = Object.fromEntries(STAGES.map((s) => [s.id, apps.filter((a) => a.stage === s.id).length]));
    const active = total - (byStage.rejected || 0);
    return { total, active, byStage };
  }, [apps]);

  const upsert = (a: Application) =>
    setApps((prev) => (prev.some((p) => p.id === a.id) ? prev.map((p) => (p.id === a.id ? a : p)) : [a, ...prev]));

  const remove = (id: string) => setApps((prev) => prev.filter((p) => p.id !== id));

  const moveTo = (id: string, stage: Stage) =>
    setApps((prev) => prev.map((p) => (p.id === id ? { ...p, stage } : p)));

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
            <div className="relative">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search company, role, city…"
                className="h-9 w-64 rounded-md border border-border bg-input/40 px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-steel focus:outline-none"
              />
            </div>
            <button
              onClick={() => setCreating("applied")}
              className="h-9 rounded-md bg-signal px-3 text-sm font-medium text-abyss transition hover:bg-signal/85"
              title="Shortcut: Space"
            >
              + New application
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
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            Your pipeline
          </h1>
          <p className="text-xs text-muted-foreground">
            Drag cards between columns · Space = new · Enter = save
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {STAGES.map((s) => {
            const list = grouped.get(s.id) || [];
            const isOver = overStage === s.id;
            return (
              <section
                key={s.id}
                onDragOver={(e) => {

                  e.preventDefault();
                  setOverStage(s.id);
                }}
                onDragLeave={() => setOverStage((p) => (p === s.id ? null : p))}
                onDrop={() => {
                  if (dragId) moveTo(dragId, s.id);
                  setDragId(null);
                  setOverStage(null);
                }}
                className={`flex min-h-[70vh] flex-col rounded-xl border transition-colors ${
                  isOver ? "border-steel bg-navy/40" : "border-border/70 bg-card/60"
                }`}
              >
                <header className="flex items-center justify-between border-b border-border/60 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ background: s.accent }}
                    />
                    <div>
                      <div className="font-display text-sm font-semibold tracking-tight text-foreground">
                        {s.label}
                      </div>
                      <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                        {s.hint}
                      </div>
                    </div>
                  </div>
                  <span className="rounded-full bg-muted/60 px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    {list.length}
                  </span>
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

        <footer className="mt-10 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-4 text-xs text-muted-foreground">
          <span>Data stays local in your browser. Export coming soon.</span>
          <span className="font-display tracking-tight">CoopTrack · v1</span>
        </footer>
      </main>

      {(editing || creating) && (
        <Editor
          initial={
            editing ??
            {
              id: crypto.randomUUID(),
              company: "",
              role: "",
              location: "",
              salary: "",
              notes: "",
              rating: 3,
              stage: creating!,
              createdAt: Date.now(),
            }
          }

          isNew={!editing}
          onClose={() => {
            setEditing(null);
            setCreating(null);
          }}
          onSave={(a) => {
            upsert(a);
            setEditing(null);
            setCreating(null);
          }}
          onDelete={
            editing
              ? () => {
                  remove(editing.id);
                  setEditing(null);
                }
              : undefined
          }
        />
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "accent" | "good" }) {
  const color =
    tone === "accent"
      ? "text-signal"
      : tone === "good"
      ? "text-[oklch(0.82_0.15_140)]"
      : "text-foreground";
  return (
    <div className="flex items-baseline gap-1.5 rounded-md border border-border/70 bg-card/50 px-3 py-1.5">
      <span className={`font-display text-sm font-semibold ${color}`}>{value}</span>
      <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{label}</span>
    </div>
  );
}

function Card({
  app,
  onOpen,
  onDragStart,
  onDragEnd,
}: {
  app: Application;
  onOpen: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
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
          <h3 className="truncate font-display text-sm font-semibold tracking-tight text-foreground">
            {app.company || "Untitled"}
          </h3>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{app.role || "—"}</p>
        </div>
        <Stars value={app.rating} readOnly />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        {app.location && (
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(app.location)}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 rounded px-1 -mx-1 hover:text-signal hover:underline"
            title="Open in Google Maps"
          >
            <span className="h-1 w-1 rounded-full bg-steel" /> {app.location} ↗
          </a>
        )}

        {app.salary && (
          <span className="rounded bg-navy/70 px-1.5 py-0.5 font-medium text-frost/90">
            {app.salary}
          </span>
        )}
      </div>
      {app.notes && (
        <p className="mt-2 line-clamp-2 text-[11px] leading-snug text-muted-foreground/90">
          {app.notes}
        </p>
      )}
    </article>
  );
}


function Stars({
  value,
  readOnly,
  onChange,
}: {
  value: number;
  readOnly?: boolean;
  onChange?: (n: number) => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= value;
        return (
          <button
            key={n}
            type="button"
            disabled={readOnly}
            onClick={() => onChange?.(n)}
            className={`text-xs transition ${
              filled ? "text-signal" : "text-muted-foreground/50"
            } ${readOnly ? "cursor-default" : "hover:text-signal"}`}
            aria-label={`${n} star${n === 1 ? "" : "s"}`}
          >
            ★
          </button>
        );
      })}
    </div>
  );
}

function Editor({
  initial,
  isNew,
  onClose,
  onSave,
  onDelete,
}: {
  initial: Application;
  isNew: boolean;
  onClose: () => void;
  onSave: (a: Application) => void;
  onDelete?: () => void;
}) {
  const [draft, setDraft] = useState<Application>(initial);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const set = <K extends keyof Application>(k: K, v: Application[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-abyss/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold tracking-tight">
            {isNew ? "New application" : "Edit application"}
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <Field label="Company">
            <input
              autoFocus
              value={draft.company}
              onChange={(e) => set("company", e.target.value)}
              placeholder="e.g. Northwind Robotics"
              className="w-full rounded-md border border-border bg-input/40 px-3 py-2 text-sm focus:border-steel focus:outline-none"
            />
          </Field>
          <Field label="Role">
            <input
              value={draft.role}
              onChange={(e) => set("role", e.target.value)}
              placeholder="e.g. Firmware Co-op"
              className="w-full rounded-md border border-border bg-input/40 px-3 py-2 text-sm focus:border-steel focus:outline-none"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Location">
              <input
                value={draft.location}
                onChange={(e) => set("location", e.target.value)}
                placeholder="City, State"
                className="w-full rounded-md border border-border bg-input/40 px-3 py-2 text-sm focus:border-steel focus:outline-none"
              />
            </Field>
            <Field label="Salary">
              <input
                value={draft.salary}
                onChange={(e) => set("salary", e.target.value)}
                placeholder="$/hr or annual"
                className="w-full rounded-md border border-border bg-input/40 px-3 py-2 text-sm focus:border-steel focus:outline-none"
              />
            </Field>
          </div>

          <Field label="Rating">
            <div className="flex items-center gap-3">
              <Stars value={draft.rating} onChange={(n) => set("rating", n)} />
              <span className="text-xs text-muted-foreground">{draft.rating} / 5</span>
            </div>
          </Field>

          <Field label="Stage">
            <div className="flex flex-wrap gap-1.5">
              {STAGES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => set("stage", s.id)}
                  className={`rounded-md border px-2.5 py-1 text-xs transition ${
                    draft.stage === s.id
                      ? "border-steel bg-steel/25 text-foreground"
                      : "border-border/70 text-muted-foreground hover:border-steel hover:text-foreground"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </Field>
        </div>

        <div className="mt-5 flex items-center justify-between gap-2">
          <div>
            {onDelete && (
              <button
                onClick={onDelete}
                className="rounded-md border border-destructive/60 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10"
              >
                Delete
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
            <button
              onClick={() => onSave(draft)}
              disabled={!draft.company.trim()}
              className="rounded-md bg-frost px-3 py-1.5 text-sm font-medium text-abyss transition hover:bg-frost/85 disabled:opacity-40"
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
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function Logo() {
  return (
    <div className="grid h-9 w-9 place-items-center rounded-md bg-frost text-abyss">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="4" width="4" height="16" rx="1" fill="currentColor" />
        <rect x="10" y="4" width="4" height="10" rx="1" fill="currentColor" opacity="0.7" />
        <rect x="17" y="4" width="4" height="6" rx="1" fill="currentColor" opacity="0.4" />
      </svg>
    </div>
  );
}
