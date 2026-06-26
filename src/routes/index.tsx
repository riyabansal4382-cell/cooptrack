import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Balm — Study tools for focused students" },
      {
        name: "description",
        content:
          "Live study timer, GPA calculator, weekly schedule, and a daily task tracker that fills your lip balm tube as you make progress.",
      },
    ],
  }),
  component: Index,
});

type Course = { id: string; name: string; credits: number; grade: string };
type Task = { id: string; label: string; done: boolean };

const GRADE_POINTS: Record<string, number> = {
  "A+": 4.0, A: 4.0, "A-": 3.7,
  "B+": 3.3, B: 3.0, "B-": 2.7,
  "C+": 2.3, C: 2.0, "C-": 1.7,
  "D+": 1.3, D: 1.0, F: 0.0,
};
const GRADES = Object.keys(GRADE_POINTS);

const SCHEDULE = [
  { day: "Mon", label: "Seminar", time: "09:00 – 10:30", tone: "rind" },
  { day: "Tue", label: "Self study", time: "14:00 – 16:00", tone: "muted" },
  { day: "Wed", label: "Lecture", time: "11:00 – 12:30", tone: "balm" },
  { day: "Thu", label: "Reading", time: "—", tone: "muted" },
  { day: "Fri", label: "Lab", time: "15:00 – 17:00", tone: "rind" },
] as const;

function formatClock(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function Index() {
  // Timer ---------------------------------------------------------------
  const FOCUS_SECONDS = 25 * 60;
  const [secondsLeft, setSecondsLeft] = useState(FOCUS_SECONDS);
  const [running, setRunning] = useState(false);
  const [sessions, setSessions] = useState(0);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (!running) return;
    intervalRef.current = window.setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          setRunning(false);
          setSessions((c) => c + 1);
          return FOCUS_SECONDS;
        }
        return s - 1;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
  }, [running]);

  const resetTimer = () => {
    setRunning(false);
    setSecondsLeft(FOCUS_SECONDS);
  };

  // GPA -----------------------------------------------------------------
  const [courses, setCourses] = useState<Course[]>([
    { id: "c1", name: "Macroeconomics 101", credits: 4, grade: "A-" },
    { id: "c2", name: "Introduction to Psychology", credits: 3, grade: "B+" },
    { id: "c3", name: "Organic Chemistry", credits: 4, grade: "A" },
  ]);

  const gpa = useMemo(() => {
    const totalCredits = courses.reduce((sum, c) => sum + (c.credits || 0), 0);
    if (!totalCredits) return 0;
    const totalPoints = courses.reduce(
      (sum, c) => sum + (GRADE_POINTS[c.grade] ?? 0) * (c.credits || 0),
      0,
    );
    return totalPoints / totalCredits;
  }, [courses]);

  const updateCourse = (id: string, patch: Partial<Course>) =>
    setCourses((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const removeCourse = (id: string) =>
    setCourses((cs) => cs.filter((c) => c.id !== id));
  const addCourse = () =>
    setCourses((cs) => [
      ...cs,
      { id: crypto.randomUUID(), name: "New course", credits: 3, grade: "A" },
    ]);

  // Tasks ---------------------------------------------------------------
  const [tasks, setTasks] = useState<Task[]>([
    { id: "t1", label: "Advanced Calculus review", done: true },
    { id: "t2", label: "Final essay bibliography", done: false },
    { id: "t3", label: "Lab report formatting", done: false },
    { id: "t4", label: "Flashcards: Spanish verbs", done: false },
  ]);
  const [newTask, setNewTask] = useState("");

  const toggleTask = (id: string) =>
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  const removeTask = (id: string) =>
    setTasks((ts) => ts.filter((t) => t.id !== id));
  const addTask = () => {
    const label = newTask.trim();
    if (!label) return;
    setTasks((ts) => [...ts, { id: crypto.randomUUID(), label, done: false }]);
    setNewTask("");
  };

  const doneCount = tasks.filter((t) => t.done).length;
  const fillPct = tasks.length ? (doneCount / tasks.length) * 100 : 0;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Sticky header with live timer */}
      <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 py-4 md:flex-row">
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-full bg-rind/10">
              <span className="font-serif italic font-medium text-rind">B.</span>
            </div>
            <h1 className="font-serif text-xl font-medium tracking-tight">Balm</h1>
          </div>

          <div className="flex items-center gap-5 rounded-full bg-cream py-1.5 pr-2 pl-6 ring-1 ring-border">
            <div className="flex items-baseline gap-3">
              <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-husk">
                Focus session
              </span>
              <span className="font-serif text-2xl font-medium leading-none tabular-nums">
                {formatClock(secondsLeft)}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setRunning((r) => !r)}
                className="grid size-9 place-items-center rounded-full bg-ink text-paper transition active:scale-95 hover:bg-rind"
                aria-label={running ? "Pause timer" : "Start timer"}
              >
                {running ? (
                  <svg className="size-4" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M2 2h4v12H2V2zm8 0h4v12h-4V2z" />
                  </svg>
                ) : (
                  <svg className="size-4" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M3 2l10 6-10 6V2z" />
                  </svg>
                )}
              </button>
              <button
                onClick={resetTimer}
                className="grid size-9 place-items-center rounded-full bg-balm/30 text-rind transition active:scale-95 hover:bg-balm/50"
                aria-label="Reset timer"
              >
                <svg className="size-4" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 3V1L4 4l4 3V5a3 3 0 110 6 3 3 0 01-3-3H3a5 5 0 105-5z" />
                </svg>
              </button>
            </div>
          </div>

          <div className="hidden items-center gap-4 lg:flex">
            <span className="text-sm text-husk">
              Today: <span className="font-medium text-ink">{sessions} sessions</span>
            </span>
            <div className="h-4 w-px bg-border" />
            <span className="text-sm text-husk">
              GPA: <span className="font-medium text-rind">{gpa.toFixed(2)}</span>
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-12">
        <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
          {/* Left: Lip balm progress + tasks */}
          <div className="space-y-8 lg:col-span-4">
            <section className="rounded-3xl bg-cream p-8 ring-1 ring-border">
              <div className="mb-2 flex items-baseline justify-between">
                <h2 className="font-serif text-lg font-medium">Daily Balm</h2>
                <span className="text-xs font-medium uppercase tracking-[0.18em] text-husk">
                  {doneCount}/{tasks.length}
                </span>
              </div>
              <p className="mb-6 max-w-[32ch] text-sm text-husk">
                Every task you finish fills the tube a little more. Cap it off by the end of the day.
              </p>

              {/* Lip balm tube */}
              <LipBalm fillPct={fillPct} working={running} />

              <p className="mt-6 text-pretty text-sm text-husk max-w-[34ch]">
                {running
                  ? "Focus mode on. Fresh balm is pouring in — keep going."
                  : fillPct === 100
                  ? "Tube's full. That's a wrap — go enjoy your evening."
                  : fillPct === 0
                  ? "Empty tube. Start the timer or tick a task to start filling it."
                  : `${Math.round(fillPct)}% full. Keep going — chapped focus, no more.`}
              </p>
            </section>

            <section className="space-y-4">
              <h3 className="text-xs font-medium uppercase tracking-[0.18em] text-husk">
                Today's objectives
              </h3>
              <ul className="space-y-2">
                {tasks.map((t) => (
                  <li
                    key={t.id}
                    className="group flex items-center gap-3 rounded-xl bg-paper p-3 ring-1 ring-border transition hover:bg-cream"
                  >
                    <button
                      onClick={() => toggleTask(t.id)}
                      className="grid size-5 shrink-0 place-items-center rounded border border-border bg-paper transition group-hover:border-rind"
                      aria-label={t.done ? "Mark task incomplete" : "Mark task complete"}
                    >
                      {t.done && <div className="size-3 rounded-sm bg-rind" />}
                    </button>
                    <span
                      className={`flex-1 text-sm ${
                        t.done ? "text-husk line-through decoration-balm" : "text-ink"
                      }`}
                    >
                      {t.label}
                    </span>
                    <button
                      onClick={() => removeTask(t.id)}
                      className="text-xs text-husk opacity-0 transition hover:text-rind group-hover:opacity-100"
                      aria-label="Remove task"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  addTask();
                }}
                className="flex gap-2"
              >
                <input
                  value={newTask}
                  onChange={(e) => setNewTask(e.target.value)}
                  placeholder="+ Add new task"
                  className="flex-1 rounded-xl border border-dashed border-border bg-transparent px-3 py-2.5 text-sm text-ink placeholder:text-husk focus:border-rind focus:outline-none"
                />
                <button
                  type="submit"
                  className="rounded-xl bg-rind px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:opacity-90"
                >
                  Add
                </button>
              </form>
            </section>
          </div>

          {/* Right: GPA + schedule */}
          <div className="space-y-12 lg:col-span-8">
            <section>
              <div className="mb-6 flex items-baseline justify-between">
                <h2 className="font-serif text-2xl font-medium leading-tight">
                  Academic Record
                </h2>
                <span className="text-xs font-medium uppercase tracking-[0.18em] text-husk">
                  GPA <span className="ml-2 font-serif text-base text-rind">{gpa.toFixed(2)}</span>
                </span>
              </div>
              <div className="overflow-hidden rounded-2xl bg-paper ring-1 ring-border">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-border bg-cream/60">
                      <th className="px-6 py-4 text-xs font-medium uppercase tracking-[0.14em] text-husk">
                        Course
                      </th>
                      <th className="px-6 py-4 text-xs font-medium uppercase tracking-[0.14em] text-husk">
                        Credits
                      </th>
                      <th className="px-6 py-4 text-xs font-medium uppercase tracking-[0.14em] text-husk">
                        Grade
                      </th>
                      <th className="px-6 py-4" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {courses.map((c) => (
                      <tr key={c.id} className="transition hover:bg-cream/40">
                        <td className="px-6 py-3">
                          <input
                            value={c.name}
                            onChange={(e) => updateCourse(c.id, { name: e.target.value })}
                            className="w-full bg-transparent text-sm font-medium text-ink focus:outline-none"
                          />
                        </td>
                        <td className="px-6 py-3 w-28">
                          <input
                            type="number"
                            min={0}
                            max={10}
                            step={0.5}
                            value={c.credits}
                            onChange={(e) =>
                              updateCourse(c.id, { credits: Number(e.target.value) })
                            }
                            className="w-16 bg-transparent text-sm tabular-nums text-husk focus:outline-none"
                          />
                        </td>
                        <td className="px-6 py-3 w-32">
                          <select
                            value={c.grade}
                            onChange={(e) => updateCourse(c.id, { grade: e.target.value })}
                            className="bg-transparent text-sm font-medium text-ink focus:outline-none"
                          >
                            {GRADES.map((g) => (
                              <option key={g} value={g}>
                                {g}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-6 py-3 text-right">
                          <button
                            onClick={() => removeCourse(c.id)}
                            className="text-husk transition hover:text-rind"
                            aria-label="Remove course"
                          >
                            <svg className="size-4" viewBox="0 0 16 16" fill="currentColor">
                              <path d="M6 2h4v1h4v1h-1l-1 10a2 2 0 01-2 2H6a2 2 0 01-2-2L3 4H2V3h4V2zm1 4v8h1V6H7zm3 0v8h1V6h-1z" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="border-t border-border bg-cream/40 p-3">
                  <button
                    onClick={addCourse}
                    className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-rind transition hover:bg-rind/10"
                  >
                    <span className="text-lg leading-none">+</span> Add course
                  </button>
                </div>
              </div>
            </section>

            <section>
              <h2 className="mb-6 font-serif text-lg font-medium">Weekly Overview</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {SCHEDULE.map((s) => {
                  const tones: Record<string, string> = {
                    rind: "bg-rind/8 border-l-2 border-rind",
                    balm: "bg-balm/15 border-l-2 border-balm",
                    muted: "bg-cream border-l-2 border-transparent",
                  };
                  const labelTone: Record<string, string> = {
                    rind: "text-rind",
                    balm: "text-ink",
                    muted: "text-husk",
                  };
                  return (
                    <div key={s.day} className="space-y-2">
                      <span className="block text-[10px] font-medium uppercase tracking-[0.2em] text-husk">
                        {s.day}
                      </span>
                      <div className={`h-24 rounded-lg p-3 ${tones[s.tone]}`}>
                        <p
                          className={`text-[11px] font-semibold uppercase tracking-wide ${labelTone[s.tone]}`}
                        >
                          {s.label}
                        </p>
                        <p className="mt-1 text-xs font-medium text-ink/80">{s.time}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        </div>
      </main>

      <footer className="mx-auto max-w-7xl border-t border-border px-6 py-10">
        <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
          <p className="max-w-[48ch] text-pretty text-sm text-husk">
            One focused hour at a time. Keep the tube topped up.
          </p>
          <span className="text-xs uppercase tracking-[0.18em] text-husk">
            Balm · Study tools
          </span>
        </div>
      </footer>
    </div>
  );
}

function LipBalm({ fillPct, working }: { fillPct: number; working: boolean }) {
  const clamped = Math.max(0, Math.min(100, fillPct));
  // During working mode, show a small "live pour" bonus on top of task fill
  const liveBoost = working ? Math.min(8, 100 - clamped) : 0;
  const visibleFill = clamped + liveBoost;

  return (
    <div className="relative mx-auto flex h-72 w-full max-w-[200px] flex-col items-center">
      {/* Cap — lifts off and floats aside when working */}
      <div
        className="relative z-10 flex flex-col items-center transition-all duration-700 ease-out"
        style={{
          transform: working
            ? "translate(64px, -8px) rotate(22deg)"
            : "translate(0,0) rotate(0deg)",
        }}
      >
        <div className="h-10 w-20 rounded-t-md bg-rind shadow-[inset_0_-4px_0_rgba(0,0,0,0.08)]" />
        <div className="-mt-1 h-2 w-24 rounded-sm bg-rind/80" />
      </div>

      {/* Pour stream — only when working */}
      {working && (
        <div className="pointer-events-none absolute left-1/2 top-10 z-0 -translate-x-1/2">
          <div
            className="h-16 w-1.5 rounded-full"
            style={{
              background:
                "linear-gradient(180deg, oklch(0.85 0.16 65) 0%, oklch(0.7 0.18 50) 100%)",
              animation: "shine 1.2s ease-in-out infinite",
            }}
          />
          {/* falling droplet */}
          <div
            className="absolute left-1/2 top-0 size-2 -translate-x-1/2 rounded-full bg-zest"
            style={{ animation: "droplet 1s linear infinite" }}
          />
        </div>
      )}

      {/* Tube body */}
      <div
        className={`relative mt-2 h-48 w-24 overflow-hidden rounded-b-2xl rounded-t-md bg-paper ring-1 ring-border ${
          working ? "shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-rind)_18%,transparent)]" : ""
        }`}
      >
        {/* Balm fill */}
        <div
          className="absolute inset-x-0 bottom-0 transition-[height] duration-700 ease-out"
          style={{
            height: `${visibleFill}%`,
            background:
              "linear-gradient(180deg, oklch(0.82 0.16 60) 0%, oklch(0.68 0.18 45) 100%)",
          }}
        >
          {/* meniscus / surface */}
          <div className="absolute -top-1 left-0 right-0 h-2 rounded-full bg-zest/70 blur-[1px]" />
          {working && (
            <>
              {/* ripple where stream lands */}
              <div
                className="absolute left-1/2 -top-1 size-6 -translate-x-1/2 rounded-full border border-zest/70"
                style={{ animation: "ripple 1.4s ease-out infinite" }}
              />
              <div
                className="absolute left-1/2 -top-1 size-6 -translate-x-1/2 rounded-full border border-zest/50"
                style={{ animation: "ripple 1.4s ease-out 0.6s infinite" }}
              />
            </>
          )}
          {/* inner shine */}
          <div
            className="absolute left-2 top-2 h-10 w-1.5 rounded-full bg-white/35"
            style={{ animation: "shine 3s ease-in-out infinite" }}
          />
        </div>

        {/* Tube highlights */}
        <div className="pointer-events-none absolute left-2 top-0 h-full w-1.5 rounded-full bg-white/40" />
        <div className="pointer-events-none absolute right-3 top-0 h-full w-0.5 rounded-full bg-ink/5" />

        {/* Label band */}
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 border-y border-rind/30 bg-paper/80 py-1 text-center backdrop-blur-sm">
          <span className="font-serif text-[10px] italic tracking-wide text-rind">
            Balm Nº1
          </span>
        </div>
      </div>

      {/* Base */}
      <div className="h-3 w-28 rounded-b-lg bg-rind/80" />
      <div className="mt-3 text-center text-[10px] font-medium uppercase tracking-[0.22em] text-husk">
        {working ? "Pouring…" : `${Math.round(clamped)}% full`}
      </div>
    </div>
  );
}

