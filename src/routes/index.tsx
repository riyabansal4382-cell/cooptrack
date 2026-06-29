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
type SavedSession = {
  id: string;
  dateISO: string;
  startedAt: number;
  durationMin: number;
  tasks: string[];
  label?: string;
};

const SESSIONS_KEY = "balm.sessions.v1";
function loadSessions(): SavedSession[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SESSIONS_KEY);
    return raw ? (JSON.parse(raw) as SavedSession[]) : [];
  } catch {
    return [];
  }
}

const GRADE_POINTS: Record<string, number> = {
  "A+": 4.0, A: 4.0, "A-": 3.7,
  "B+": 3.3, B: 3.0, "B-": 2.7,
  "C+": 2.3, C: 2.0, "C-": 1.7,
  "D+": 1.3, D: 1.0, F: 0.0,
};
const GRADES = Object.keys(GRADE_POINTS);

type ScheduleEvent = {
  id: string;
  date: string; // YYYY-MM-DD
  label: string;
  time: string;
  tone: "rind" | "balm" | "muted";
};

const toISO = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const startOfWeek = (d: Date) => {
  const x = new Date(d);
  const dow = (x.getDay() + 6) % 7; // Monday = 0
  x.setDate(x.getDate() - dow);
  x.setHours(0, 0, 0, 0);
  return x;
};

const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DOW_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const seedEvents = (): ScheduleEvent[] => {
  const wk = startOfWeek(new Date());
  return [
    { id: "s1", date: toISO(addDays(wk, 0)), label: "Seminar", time: "09:00 – 10:30", tone: "rind" },
    { id: "s2", date: toISO(addDays(wk, 1)), label: "Self study", time: "14:00 – 16:00", tone: "muted" },
    { id: "s3", date: toISO(addDays(wk, 2)), label: "Lecture", time: "11:00 – 12:30", tone: "balm" },
    { id: "s4", date: toISO(addDays(wk, 3)), label: "Reading", time: "—", tone: "muted" },
    { id: "s5", date: toISO(addDays(wk, 4)), label: "Lab", time: "15:00 – 17:00", tone: "rind" },
  ];
};

function formatClock(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function Index() {
  // Timer ---------------------------------------------------------------
  const [focusMinutes, setFocusMinutes] = useState(25);
  const focusSeconds = focusMinutes * 60;
  const [secondsLeft, setSecondsLeft] = useState(focusSeconds);
  const [running, setRunning] = useState(false);
  const [sessions, setSessions] = useState(0);
  const intervalRef = useRef<number | null>(null);

  // Persisted session log (each finished focus run becomes a stored balm tube)
  const [savedSessions, setSavedSessions] = useState<SavedSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<SavedSession | null>(null);
  useEffect(() => { setSavedSessions(loadSessions()); }, []);
  useEffect(() => {
    try { window.localStorage.setItem(SESSIONS_KEY, JSON.stringify(savedSessions)); } catch {}
  }, [savedSessions]);

  // Refs so the timer callback can read live state without restarting the interval
  const tasksRef = useRef<Task[]>([]);
  const sessionStartRef = useRef<number>(0);
  const focusMinutesRef = useRef(focusMinutes);
  useEffect(() => { focusMinutesRef.current = focusMinutes; }, [focusMinutes]);

  useEffect(() => {
    if (!running) return;
    intervalRef.current = window.setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          setRunning(false);
          setSessions((c) => c + 1);
          const mins = focusMinutesRef.current;
          const completedTasks = tasksRef.current.filter((t) => t.done).map((t) => t.label);
          const newSession: SavedSession = {
            id: crypto.randomUUID(),
            dateISO: toISO(new Date()),
            startedAt: sessionStartRef.current || Date.now(),
            durationMin: mins,
            tasks: completedTasks,
          };
          setSavedSessions((arr) => [newSession, ...arr]);
          return mins * 60;
        }
        return s - 1;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
  }, [running]);

  // Keep clock in sync when user changes duration while idle
  useEffect(() => {
    if (!running) setSecondsLeft(focusMinutes * 60);
  }, [focusMinutes, running]);

  const resetTimer = () => {
    setRunning(false);
    setSecondsLeft(focusMinutes * 60);
  };

  const changeFocus = (delta: number) => {
    setFocusMinutes((m) => Math.max(5, Math.min(120, m + delta)));
  };

  // Schedule -----------------------------------------------------------
  const [events, setEvents] = useState<ScheduleEvent[]>(() => seedEvents());
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [monthCursor, setMonthCursor] = useState(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const addEvent = (date: string, label: string, time: string, tone: ScheduleEvent["tone"] = "balm") => {
    const trimmed = label.trim();
    if (!trimmed) return;
    setEvents((es) => [
      ...es,
      { id: crypto.randomUUID(), date, label: trimmed, time: time.trim() || "—", tone },
    ]);
  };
  const removeEvent = (id: string) =>
    setEvents((es) => es.filter((e) => e.id !== id));

  const eventsByDate = useMemo(() => {
    const map = new Map<string, ScheduleEvent[]>();
    for (const e of events) {
      const arr = map.get(e.date) ?? [];
      arr.push(e);
      map.set(e.date, arr);
    }
    return map;
  }, [events]);

  const weekDates = useMemo(() => {
    const wk = startOfWeek(new Date());
    return Array.from({ length: 7 }, (_, i) => addDays(wk, i));
  }, []);


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
  const [balmFullscreen, setBalmFullscreen] = useState(false);

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

  // Mirror tasks into a ref so the timer interval can snapshot them on completion
  useEffect(() => { tasksRef.current = tasks; }, [tasks]);

  // Weekly completed tasks (Mon..Sun). Past days are seeded; today reflects live doneCount.
  const todayIdx = (new Date().getDay() + 6) % 7;
  const [weeklyHistory] = useState<number[]>([4, 3, 5, 2, 4, 1, 2]);
  const weekSeries = weeklyHistory.map((v, i) => (i === todayIdx ? doneCount : i > todayIdx ? 0 : v));

  // Streak — consecutive days (ending today or yesterday) with at least one session
  const todayISO = toISO(new Date());
  const streak = useMemo(() => {
    if (!savedSessions.length) return 0;
    const days = new Set(savedSessions.map((s) => s.dateISO));
    const d = new Date();
    if (!days.has(toISO(d))) d.setDate(d.getDate() - 1);
    let count = 0;
    while (days.has(toISO(d))) {
      count++;
      d.setDate(d.getDate() - 1);
    }
    return count;
  }, [savedSessions]);

  const todaySessions = useMemo(
    () => savedSessions.filter((s) => s.dateISO === todayISO),
    [savedSessions, todayISO],
  );
  const todayMinutes = todaySessions.reduce((a, b) => a + b.durationMin, 0);


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

          <div className="flex flex-wrap items-center justify-center gap-3 rounded-full bg-cream py-1.5 pr-2 pl-5 ring-1 ring-border">
            <div className="flex items-baseline gap-3">
              <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-husk">
                Focus
              </span>
              <span className="font-serif text-2xl font-medium leading-none tabular-nums">
                {formatClock(secondsLeft)}
              </span>
            </div>

            {/* Duration stepper */}
            <div className="flex items-center gap-1 rounded-full bg-paper px-1 py-1 ring-1 ring-border">
              <button
                onClick={() => changeFocus(-5)}
                disabled={running}
                className="grid size-6 place-items-center rounded-full text-husk transition hover:bg-rind/10 hover:text-rind disabled:opacity-40"
                aria-label="Decrease focus duration"
              >
                −
              </button>
              <span className="min-w-[3.25rem] text-center text-xs font-medium tabular-nums text-ink">
                {focusMinutes} min
              </span>
              <button
                onClick={() => changeFocus(5)}
                disabled={running}
                className="grid size-6 place-items-center rounded-full text-husk transition hover:bg-rind/10 hover:text-rind disabled:opacity-40"
                aria-label="Increase focus duration"
              >
                +
              </button>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() =>
                  setRunning((r) => {
                    if (!r) sessionStartRef.current = Date.now();
                    return !r;
                  })
                }
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
            <span className="flex items-center gap-1.5 rounded-full bg-rind/10 px-2.5 py-1 text-sm text-rind">
              <span>🔥</span>
              <span className="font-medium tabular-nums">{streak}</span>
              <span className="text-xs uppercase tracking-[0.14em]">streak</span>
            </span>
            <div className="h-4 w-px bg-border" />
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
        <section className="mb-10 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
          <TodayPanel
            streak={streak}
            sessionsToday={todaySessions.length}
            minutesToday={todayMinutes}
            tasksDone={doneCount}
            tasksTotal={tasks.length}
            nextEvent={(eventsByDate.get(todayISO) ?? [])[0]}
          />
          <BalmShelf
            sessions={savedSessions}
            onSelect={setSelectedSession}
            onRename={(id, label) =>
              setSavedSessions((arr) => arr.map((s) => (s.id === id ? { ...s, label } : s)))
            }
          />

        </section>
        <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
          {/* Left: Lip balm progress + tasks */}
          <div className="space-y-8 lg:col-span-4">
            <section className="rounded-3xl bg-cream p-8 ring-1 ring-border">
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <h2 className="font-serif text-lg font-medium">Daily Balm</h2>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-medium uppercase tracking-[0.18em] text-husk">
                    {doneCount}/{tasks.length}
                  </span>
                  <button
                    onClick={() => setBalmFullscreen(true)}
                    className="rounded-full border border-border bg-paper px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-husk transition hover:border-rind hover:text-rind"
                    aria-label="Open lip balm in fullscreen"
                    title="Fullscreen focus view"
                  >
                    ⤢ Focus
                  </button>
                </div>
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
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
                <div className="space-y-3">
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
                </div>
                <WeeklyTaskChart completed={weekSeries} todayIdx={todayIdx} />
              </div>
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
              <div className="mb-6 flex items-end justify-between gap-4">
                <div>
                  <h2 className="font-serif text-lg font-medium">Weekly Overview</h2>
                  <p className="mt-1 text-xs text-husk">
                    {weekDates[0].toLocaleDateString(undefined, { month: "short", day: "numeric" })} –{" "}
                    {weekDates[6].toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </p>
                </div>
                <button
                  onClick={() => setCalendarOpen(true)}
                  className="rounded-full bg-ink px-4 py-2 text-xs font-medium uppercase tracking-[0.16em] text-paper transition hover:bg-rind"
                >
                  Open month
                </button>
              </div>
              <WeeklyGrid
                weekDates={weekDates}
                eventsByDate={eventsByDate}
                onRemove={removeEvent}
                onAdd={addEvent}
              />
            </section>
          </div>
        </div>

        {calendarOpen && (
          <MonthCalendar
            cursor={monthCursor}
            setCursor={setMonthCursor}
            eventsByDate={eventsByDate}
            onClose={() => setCalendarOpen(false)}
            onAdd={addEvent}
            onRemove={removeEvent}
          />
        )}

        {selectedSession && (() => {
          const live = savedSessions.find((s) => s.id === selectedSession.id) ?? selectedSession;
          return (
            <SessionDetailModal
              session={live}
              onClose={() => setSelectedSession(null)}
              onRename={(label) =>
                setSavedSessions((arr) =>
                  arr.map((s) => (s.id === live.id ? { ...s, label } : s)),
                )
              }
            />
          );
        })()}




        {balmFullscreen && (
          <div className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-xl animate-fade-in">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-husk">Focus view</p>
                <h2 className="font-serif text-2xl">Daily Balm · {Math.round(fillPct)}%</h2>
              </div>
              <div className="flex items-center gap-3">
                <span className="hidden sm:inline text-xs uppercase tracking-[0.18em] text-husk">
                  {running ? `${formatClock(secondsLeft)} left` : "Timer paused"}
                </span>
                <button
                  onClick={() => setBalmFullscreen(false)}
                  className="rounded-full border border-border bg-paper px-4 py-2 text-xs font-medium uppercase tracking-[0.16em] text-husk transition hover:border-rind hover:text-rind"
                >
                  Exit ✕
                </button>
              </div>
            </div>
            <div className="flex flex-1 items-center justify-center px-6 py-10">
              <div className="scale-[1.8] sm:scale-[2.4] md:scale-[3] origin-center">
                <LipBalm fillPct={fillPct} working={running} />
              </div>
            </div>
            <p className="px-6 pb-8 text-center text-sm text-husk">
              {running
                ? "Focus mode on. Fresh balm is pouring in — keep going."
                : "Start the timer to begin the pour."}
            </p>
          </div>
        )}
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

  // Color darkens as more tasks are completed.
  const t = clamped / 100;
  const lTop = (0.88 - 0.22 * t).toFixed(3);
  const cTop = (0.12 + 0.06 * t).toFixed(3);
  const lBot = (0.74 - 0.30 * t).toFixed(3);
  const cBot = (0.14 + 0.08 * t).toFixed(3);
  const hue = 55 - 12 * t;
  const fillGradient = `linear-gradient(180deg, oklch(${lTop} ${cTop} ${hue}) 0%, oklch(${lBot} ${cBot} ${hue - 5}) 100%)`;
  const meniscusColor = `oklch(${(parseFloat(lTop) + 0.05).toFixed(3)} ${cTop} ${hue + 5})`;

  return (
    <div className="relative mx-auto flex h-72 w-full max-w-[260px] flex-col items-center">
      {/* Cap — sits on top of the tube when NOT working; lifts off and floats aside when working. */}
      <div
        className="pointer-events-none absolute left-1/2 z-30"
        style={{
          top: working ? "-6px" : "34px",
          transform: working
            ? "translateX(-50%) translateY(-26px) rotate(-10deg)"
            : "translateX(-50%) translateY(0) rotate(0deg)",
          transition: "transform 700ms cubic-bezier(.5,1.6,.4,1), top 700ms cubic-bezier(.5,1.6,.4,1)",
        }}
        aria-hidden
      >
        <div className="h-5 w-[104px] rounded-t-xl rounded-b-sm bg-rind shadow-[inset_0_-3px_0_oklch(0.42_0.16_38)]" />
        <div className="mx-auto h-1 w-[92px] rounded-full bg-ink/15" />
      </div>

      {/* Rain cloud pouring balm — appears only while working. */}
      {working && (
        <div className="pointer-events-none absolute left-1/2 z-20 -translate-x-1/2" style={{ top: "-38px" }}>
          <div
            className="relative"
            style={{
              animation: "beaker-tilt 4s ease-in-out infinite",
              transformOrigin: "50% 50%",
              transform: "rotate(-8deg)",
            }}
          >
            <svg width="140" height="70" viewBox="0 0 140 70" fill="none" aria-hidden>
              <defs>
                <radialGradient id="cloudGrad" cx="50%" cy="40%" r="60%">
                  <stop offset="0%" stopColor="oklch(0.99 0.005 75)" />
                  <stop offset="100%" stopColor="oklch(0.9 0.02 60)" />
                </radialGradient>
              </defs>
              {/* fluffy cloud */}
              <ellipse cx="42" cy="40" rx="24" ry="18" fill="url(#cloudGrad)" stroke="oklch(0.55 0.18 38)" strokeWidth="1.5" />
              <ellipse cx="72" cy="32" rx="28" ry="22" fill="url(#cloudGrad)" stroke="oklch(0.55 0.18 38)" strokeWidth="1.5" />
              <ellipse cx="104" cy="42" rx="22" ry="16" fill="url(#cloudGrad)" stroke="oklch(0.55 0.18 38)" strokeWidth="1.5" />
              <ellipse cx="70" cy="46" rx="40" ry="12" fill="url(#cloudGrad)" />
              {/* highlight */}
              <ellipse cx="58" cy="24" rx="10" ry="3" fill="white" opacity="0.7" />
            </svg>

            {/* falling balm droplets */}
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="absolute size-[6px] rounded-full bg-zest"
                style={{
                  left: `${28 + i * 16}%`,
                  top: "58px",
                  boxShadow: "0 0 6px oklch(0.82 0.16 60 / 0.7)",
                  animation: `droplet 0.9s linear ${i * 0.18}s infinite`,
                }}
              />
            ))}
            {/* central pour stream */}
            <div
              className="absolute left-1/2 top-[58px] h-10 w-[5px] -translate-x-1/2 rounded-full"
              style={{
                background:
                  "linear-gradient(180deg, oklch(0.85 0.16 65) 0%, oklch(0.7 0.18 50) 100%)",
                boxShadow: "0 0 8px oklch(0.82 0.16 60 / 0.6)",
                animation: "stream-pulse 1s ease-in-out infinite",
                transformOrigin: "top center",
              }}
            />
          </div>
        </div>
      )}

      {/* Tube body */}
      <div
        className={`relative mt-12 h-48 w-24 overflow-hidden rounded-b-2xl rounded-t-md bg-paper ring-1 ring-border ${
          working ? "shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-rind)_18%,transparent)]" : ""
        }`}
      >
        {/* Balm fill */}
        <div
          className="absolute inset-x-0 bottom-0 transition-[height,background] duration-700 ease-out"
          style={{
            height: `${visibleFill}%`,
            background: fillGradient,
          }}
        >
          <div
            className="absolute -top-1 left-0 right-0 h-2 rounded-full blur-[1px]"
            style={{ background: meniscusColor, opacity: 0.75 }}
          />
          {working && (
            <>
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
          <div
            className="absolute left-2 top-2 h-10 w-1.5 rounded-full bg-white/35"
            style={{ animation: "shine 3s ease-in-out infinite" }}
          />
        </div>

        <div className="pointer-events-none absolute left-2 top-0 h-full w-1.5 rounded-full bg-white/40" />
        <div className="pointer-events-none absolute right-3 top-0 h-full w-0.5 rounded-full bg-ink/5" />

        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 border-y border-rind/30 bg-paper/80 py-1 text-center backdrop-blur-sm">
          <span className="font-serif text-[10px] italic tracking-wide text-rind whitespace-pre-line">
            {"R2\n"}
          </span>
        </div>
      </div>

      <div className="h-3 w-28 rounded-b-lg bg-rind/80" />
      <div className="mt-3 text-center text-[10px] font-medium uppercase tracking-[0.22em] text-husk">
        {working ? "Pouring…" : `${Math.round(clamped)}% full`}
      </div>
    </div>
  );
}


const TONE_BG: Record<string, string> = {
  rind: "bg-rind/10 border-l-2 border-rind",
  balm: "bg-balm/20 border-l-2 border-balm",
  muted: "bg-cream border-l-2 border-husk/30",
};
const TONE_LABEL: Record<string, string> = {
  rind: "text-rind",
  balm: "text-ink",
  muted: "text-husk",
};

function WeeklyGrid({
  weekDates,
  eventsByDate,
  onRemove,
  onAdd,
}: {
  weekDates: Date[];
  eventsByDate: Map<string, ScheduleEvent[]>;
  onRemove: (id: string) => void;
  onAdd: (date: string, label: string, time: string, tone?: ScheduleEvent["tone"]) => void;
}) {
  const todayISO = toISO(new Date());
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
      {weekDates.map((d, i) => {
        const iso = toISO(d);
        const dayEvents = eventsByDate.get(iso) ?? [];
        const isToday = iso === todayISO;
        return (
          <div key={iso} className="space-y-2">
            <div className="flex items-baseline justify-between">
              <span
                className={`block text-[10px] font-medium uppercase tracking-[0.2em] ${
                  isToday ? "text-rind" : "text-husk"
                }`}
              >
                {DOW_LABELS[i]}
              </span>
              <span className={`font-serif text-sm ${isToday ? "text-rind" : "text-ink/70"}`}>
                {d.getDate()}
              </span>
            </div>
            <div
              className={`min-h-28 space-y-1.5 rounded-lg p-2 ring-1 ring-border ${
                isToday ? "bg-paper" : "bg-cream/50"
              }`}
            >
              {dayEvents.map((e) => (
                <div
                  key={e.id}
                  className={`group relative rounded p-2 ${TONE_BG[e.tone]}`}
                >
                  <p className={`text-[11px] font-semibold uppercase tracking-wide ${TONE_LABEL[e.tone]}`}>
                    {e.label}
                  </p>
                  <p className="mt-0.5 text-[11px] font-medium text-ink/70">{e.time}</p>
                  <button
                    onClick={() => onRemove(e.id)}
                    className="absolute right-1 top-1 text-[10px] text-husk opacity-0 transition group-hover:opacity-100 hover:text-rind"
                    aria-label="Remove event"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <QuickAddEvent date={iso} onAdd={onAdd} compact />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function QuickAddEvent({
  date,
  onAdd,
  compact,
}: {
  date: string;
  onAdd: (date: string, label: string, time: string, tone?: ScheduleEvent["tone"]) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [time, setTime] = useState("");
  const [tone, setTone] = useState<ScheduleEvent["tone"]>("balm");

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className={`flex w-full items-center justify-center gap-1 rounded border border-dashed border-husk/30 py-1 text-[11px] text-husk transition hover:border-rind hover:text-rind ${
          compact ? "" : "py-2"
        }`}
      >
        + Task
      </button>
    );
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onAdd(date, label, time, tone);
        setLabel("");
        setTime("");
        setOpen(false);
      }}
      className="space-y-1.5 rounded border border-rind/30 bg-paper p-2"
    >
      <input
        autoFocus
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Task"
        className="w-full rounded bg-cream/60 px-2 py-1 text-[11px] text-ink placeholder:text-husk focus:outline-none"
      />
      <input
        value={time}
        onChange={(e) => setTime(e.target.value)}
        placeholder="Time"
        className="w-full rounded bg-cream/60 px-2 py-1 text-[11px] text-ink placeholder:text-husk focus:outline-none"
      />
      <div className="flex items-center justify-between gap-1">
        <div className="flex gap-1">
          {(["rind", "balm", "muted"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTone(t)}
              className={`size-3.5 rounded-full ring-1 ring-border transition ${
                tone === t ? "ring-2 ring-ink" : ""
              } ${t === "rind" ? "bg-rind" : t === "balm" ? "bg-balm" : "bg-husk/40"}`}
              aria-label={`Tone ${t}`}
            />
          ))}
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded px-2 py-0.5 text-[10px] text-husk hover:text-rind"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded bg-rind px-2 py-0.5 text-[10px] font-medium text-paper hover:opacity-90"
          >
            Save
          </button>
        </div>
      </div>
    </form>
  );
}

function MonthCalendar({
  cursor,
  setCursor,
  eventsByDate,
  onClose,
  onAdd,
  onRemove,
}: {
  cursor: Date;
  setCursor: (d: Date) => void;
  eventsByDate: Map<string, ScheduleEvent[]>;
  onClose: () => void;
  onAdd: (date: string, label: string, time: string, tone?: ScheduleEvent["tone"]) => void;
  onRemove: (id: string) => void;
}) {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const gridStart = startOfWeek(firstOfMonth);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const todayISO = toISO(new Date());

  const goMonth = (delta: number) => {
    const d = new Date(year, month + delta, 1);
    setCursor(d);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl bg-paper ring-1 ring-border"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-4 border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <h2 className="font-serif text-2xl font-medium">
              {MONTHS[month]} <span className="text-husk">{year}</span>
            </h2>
            <div className="flex items-center gap-1 rounded-full bg-cream p-1 ring-1 ring-border">
              <button
                onClick={() => goMonth(-1)}
                className="grid size-7 place-items-center rounded-full text-husk hover:bg-rind/10 hover:text-rind"
                aria-label="Previous month"
              >
                ‹
              </button>
              <button
                onClick={() => {
                  const d = new Date();
                  d.setDate(1);
                  d.setHours(0, 0, 0, 0);
                  setCursor(d);
                }}
                className="rounded-full px-3 py-0.5 text-[11px] font-medium uppercase tracking-[0.16em] text-husk hover:text-rind"
              >
                Today
              </button>
              <button
                onClick={() => goMonth(1)}
                className="grid size-7 place-items-center rounded-full text-husk hover:bg-rind/10 hover:text-rind"
                aria-label="Next month"
              >
                ›
              </button>
            </div>
          </div>
          <button
            onClick={onClose}
            className="grid size-9 place-items-center rounded-full bg-cream text-husk hover:bg-rind/10 hover:text-rind"
            aria-label="Close calendar"
          >
            ✕
          </button>
        </header>

        <div className="grid grid-cols-7 border-b border-border bg-cream/50">
          {DOW_LABELS.map((d) => (
            <div
              key={d}
              className="px-3 py-2 text-[10px] font-medium uppercase tracking-[0.18em] text-husk"
            >
              {d}
            </div>
          ))}
        </div>

        <div className="grid flex-1 grid-cols-7 overflow-y-auto">
          {cells.map((d, i) => {
            const iso = toISO(d);
            const inMonth = d.getMonth() === month;
            const isToday = iso === todayISO;
            const dayEvents = eventsByDate.get(iso) ?? [];
            return (
              <div
                key={iso + i}
                className={`min-h-[120px] border-b border-r border-border p-2 ${
                  inMonth ? "bg-paper" : "bg-cream/30"
                }`}
              >
                <div className="mb-1 flex items-center justify-between">
                  <span
                    className={`font-serif text-sm ${
                      isToday
                        ? "grid size-6 place-items-center rounded-full bg-rind text-paper"
                        : inMonth
                        ? "text-ink"
                        : "text-husk/50"
                    }`}
                  >
                    {d.getDate()}
                  </span>
                </div>
                <div className="space-y-1">
                  {dayEvents.map((e) => (
                    <div
                      key={e.id}
                      className={`group relative rounded px-1.5 py-1 ${TONE_BG[e.tone]}`}
                    >
                      <p className={`truncate text-[10px] font-semibold uppercase tracking-wide ${TONE_LABEL[e.tone]}`}>
                        {e.label}
                      </p>
                      <p className="text-[10px] text-ink/60">{e.time}</p>
                      <button
                        onClick={() => onRemove(e.id)}
                        className="absolute right-0.5 top-0.5 text-[9px] text-husk opacity-0 transition group-hover:opacity-100 hover:text-rind"
                        aria-label="Remove event"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  {inMonth && <QuickAddEvent date={iso} onAdd={onAdd} compact />}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function WeeklyTaskChart({ completed, todayIdx }: { completed: number[]; todayIdx: number }) {
  const labels = ["M", "T", "W", "T", "F", "S", "S"];
  const n = completed.length;
  // Linear regression over completed series (intended pace trendline)
  const xs = completed.map((_, i) => i);
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = completed.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (completed[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  const m = den ? num / den : 0;
  const b = my - m * mx;
  const regression = xs.map((x) => Math.max(0, m * x + b));

  const maxY = Math.max(5, ...completed, ...regression) * 1.15;
  const W = 280;
  const H = 180;
  const padL = 24;
  const padR = 12;
  const padT = 14;
  const padB = 24;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const xAt = (i: number) => padL + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const yAt = (v: number) => padT + innerH - (v / maxY) * innerH;
  const barW = (innerW / n) * 0.55;

  const linePath = regression
    .map((v, i) => `${i === 0 ? "M" : "L"} ${xAt(i).toFixed(1)} ${yAt(v).toFixed(1)}`)
    .join(" ");

  const weekTotal = completed.reduce((a, b) => a + b, 0);
  const intendedTotal = Math.round(regression.reduce((a, b) => a + b, 0));

  return (
    <div className="rounded-2xl bg-paper p-4 ring-1 ring-border">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h4 className="font-serif text-sm font-medium text-ink">This week</h4>
        <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-husk">
          {weekTotal} done · {intendedTotal} intended
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Weekly tasks completed with intended trendline">
        {/* gridlines */}
        {[0, 0.25, 0.5, 0.75, 1].map((p) => (
          <line
            key={p}
            x1={padL}
            x2={W - padR}
            y1={padT + innerH * p}
            y2={padT + innerH * p}
            stroke="var(--color-border)"
            strokeWidth={p === 1 ? 1 : 0.5}
            strokeDasharray={p === 1 ? "0" : "2 3"}
          />
        ))}
        {/* bars */}
        {completed.map((v, i) => {
          const isToday = i === todayIdx;
          const isFuture = i > todayIdx;
          const y = yAt(v);
          const h = padT + innerH - y;
          return (
            <g key={i}>
              <rect
                x={xAt(i) - barW / 2}
                y={y}
                width={barW}
                height={Math.max(0.5, h)}
                rx={3}
                fill={isFuture ? "var(--color-cream)" : isToday ? "var(--color-rind)" : "var(--color-balm)"}
                opacity={isFuture ? 0.7 : 1}
              />
              <text
                x={xAt(i)}
                y={H - 8}
                textAnchor="middle"
                fontSize={9}
                fill="var(--color-husk)"
                fontFamily="var(--font-sans)"
                style={{ letterSpacing: "0.08em" }}
              >
                {labels[i]}
              </text>
            </g>
          );
        })}
        {/* regression line */}
        <path d={linePath} fill="none" stroke="var(--color-rind)" strokeWidth={1.75} strokeDasharray="4 3" />
        {regression.map((v, i) => (
          <circle key={i} cx={xAt(i)} cy={yAt(v)} r={2.25} fill="var(--color-rind)" />
        ))}
      </svg>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] uppercase tracking-[0.14em] text-husk">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block size-2 rounded-sm bg-balm" /> Completed
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block size-2 rounded-sm bg-rind" /> Today
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg width="14" height="6"><line x1="0" y1="3" x2="14" y2="3" stroke="var(--color-rind)" strokeWidth="1.5" strokeDasharray="3 2" /></svg>
          Intended (LR)
        </span>
      </div>
    </div>
  );
}

function TodayPanel({
  streak,
  sessionsToday,
  minutesToday,
  tasksDone,
  tasksTotal,
  nextEvent,
}: {
  streak: number;
  sessionsToday: number;
  minutesToday: number;
  tasksDone: number;
  tasksTotal: number;
  nextEvent?: ScheduleEvent;
}) {
  const today = new Date();
  return (
    <div className="rounded-3xl bg-paper p-6 ring-1 ring-border">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-husk">Today</p>
          <h2 className="font-serif text-lg font-medium leading-tight">
            {today.toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </h2>
        </div>
        <span
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-rind/10 px-3 py-1.5 text-rind"
          title="Consecutive days with at least one finished session"
        >
          <span className="text-base leading-none">🔥</span>
          <span className="text-sm font-medium tabular-nums">{streak}</span>
          <span className="text-[10px] uppercase tracking-[0.16em]">streak</span>
        </span>
      </div>
      <dl className="grid grid-cols-3 gap-2">
        <Stat label="Sessions" value={String(sessionsToday)} />
        <Stat label="Minutes" value={String(minutesToday)} />
        <Stat label="Tasks" value={`${tasksDone}/${tasksTotal}`} />
      </dl>
      <div className="mt-4 rounded-2xl bg-cream p-3">
        <p className="text-[10px] uppercase tracking-[0.18em] text-husk">Next up</p>
        {nextEvent ? (
          <p className="mt-1 text-sm">
            <span className="font-medium text-ink">{nextEvent.label}</span>{" "}
            <span className="text-husk">· {nextEvent.time}</span>
          </p>
        ) : (
          <p className="mt-1 text-sm text-husk">Nothing scheduled. Pick a task and go.</p>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-cream p-3 text-center">
      <div className="font-serif text-xl text-rind tabular-nums leading-none">{value}</div>
      <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-husk">{label}</div>
    </div>
  );
}

function BalmShelf({
  sessions,
  onSelect,
}: {
  sessions: SavedSession[];
  onSelect: (s: SavedSession) => void;
}) {
  return (
    <div className="rounded-3xl bg-cream p-6 ring-1 ring-border">
      <div className="mb-4 flex items-baseline justify-between">
        <div>
          <h2 className="font-serif text-lg font-medium">Balm shelf</h2>
          <p className="text-xs text-husk">Each tube is a finished focus session — tap to inspect.</p>
        </div>
        <span className="text-[10px] uppercase tracking-[0.18em] text-husk">
          {sessions.length} stored
        </span>
      </div>
      {sessions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-paper/60 p-6 text-center text-sm text-husk">
          Empty shelf. Finish a focus session and a fresh tube lands here.
        </div>
      ) : (
        <div>
          <div className="flex gap-3 overflow-x-auto pb-3">
            {sessions.map((s) => (
              <button
                key={s.id}
                onClick={() => onSelect(s)}
                className="group flex shrink-0 flex-col items-center gap-1.5"
                title={`${s.dateISO} · ${s.durationMin} min · ${s.tasks.length} tasks`}
              >
                <MiniTube durationMin={s.durationMin} taskCount={s.tasks.length} />
                <span className="text-[10px] uppercase tracking-[0.14em] text-husk group-hover:text-rind">
                  {new Date(s.dateISO + "T00:00:00").toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </button>
            ))}
          </div>
          <div className="h-1.5 rounded-full bg-rind/30" />
          <div className="h-3 rounded-b-xl bg-rind/15" />
        </div>
      )}
    </div>
  );
}

function MiniTube({ durationMin, taskCount }: { durationMin: number; taskCount: number }) {
  const fill = Math.min(100, (durationMin / 60) * 100);
  const t = Math.min(1, taskCount / 5);
  const lTop = (0.86 - 0.18 * t).toFixed(3);
  const lBot = (0.7 - 0.24 * t).toFixed(3);
  const hue = 60 - 12 * t;
  return (
    <div className="relative h-16 w-8 overflow-hidden rounded-b-lg rounded-t-sm bg-paper ring-1 ring-border transition group-hover:ring-rind">
      <div
        className="absolute inset-x-0 bottom-0"
        style={{
          height: `${fill}%`,
          background: `linear-gradient(180deg, oklch(${lTop} 0.15 ${hue}) 0%, oklch(${lBot} 0.17 ${hue - 5}) 100%)`,
        }}
      />
      <div className="pointer-events-none absolute inset-x-1 top-1 h-6 w-1 rounded-full bg-white/40" />
      <div className="absolute -top-1 inset-x-0.5 h-2 rounded-sm bg-rind/80" />
    </div>
  );
}

function SessionDetailModal({
  session,
  onClose,
}: {
  session: SavedSession;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-3xl bg-paper p-6 ring-1 ring-border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-husk">Stored balm</p>
            <h3 className="font-serif text-xl leading-tight">
              {new Date(session.dateISO + "T00:00:00").toLocaleDateString(undefined, {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-full border border-border bg-paper px-2 py-1 text-xs text-husk hover:border-rind hover:text-rind"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-cream p-3">
            <div className="text-[10px] uppercase tracking-[0.14em] text-husk">Duration</div>
            <div className="font-serif text-lg text-rind">{session.durationMin} min</div>
          </div>
          <div className="rounded-xl bg-cream p-3">
            <div className="text-[10px] uppercase tracking-[0.14em] text-husk">Started</div>
            <div className="font-serif text-lg text-rind">
              {new Date(session.startedAt).toLocaleTimeString(undefined, {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
          </div>
        </div>
        <div className="mt-5">
          <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-husk">
            Tasks ticked ({session.tasks.length})
          </div>
          {session.tasks.length === 0 ? (
            <p className="rounded-xl bg-cream/60 p-3 text-sm text-husk">
              No tasks were ticked during this session.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {session.tasks.map((t, i) => (
                <li
                  key={i}
                  className="flex items-center gap-2 rounded-lg bg-cream/60 px-3 py-2 text-sm text-ink"
                >
                  <span className="size-2 rounded-full bg-rind" />
                  {t}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

