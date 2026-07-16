import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";

// Same-origin relative path only — prevents open-redirect via ?next=https://evil.com
function safeNext(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//")) return null;
  return raw;
}

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    next: typeof s.next === "string" ? s.next : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Sign in — CoopTrack" },
      { name: "description", content: "Sign in to sync your co-op applications across devices." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const nextPath = safeNext(next);
  const returnTo = nextPath
    ? `${window.location.origin}${nextPath}`
    : window.location.origin;

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        if (nextPath) window.location.href = returnTo;
        else navigate({ to: "/", replace: true });
      }
    });
  }, [navigate, nextPath, returnTo]);

  const goNext = () => {
    if (nextPath) window.location.href = returnTo;
    else navigate({ to: "/", replace: true });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: returnTo },
        });
        if (error) throw error;
        toast.success("Account created. Signing you in…");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      goNext();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setBusy(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: returnTo,
    });
    if (result.error) {
      toast.error(result.error.message);
      setBusy(false);
      return;
    }
    if (!result.redirected) goNext();
  };

  return (
    <div className="min-h-screen bg-background text-foreground grid place-items-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border/70 bg-card/80 p-6 shadow-2xl backdrop-blur">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-md bg-signal text-abyss">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="4" width="4" height="16" rx="1" fill="currentColor" />
              <rect x="10" y="4" width="4" height="10" rx="1" fill="currentColor" opacity="0.7" />
              <rect x="17" y="4" width="4" height="6" rx="1" fill="currentColor" opacity="0.4" />
            </svg>
          </div>
          <div>
            <div className="font-display text-lg font-semibold tracking-tight">CoopTrack</div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              {mode === "signin" ? "Welcome back" : "Create account"}
            </div>
          </div>
        </div>

        <button
          onClick={google}
          disabled={busy}
          className="mb-4 flex w-full items-center justify-center gap-2 rounded-md border border-border bg-input/40 px-3 py-2 text-sm font-medium transition hover:border-steel disabled:opacity-50"
        >
          <svg width="16" height="16" viewBox="0 0 24 24">
            <path fill="#4285f4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34a853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.98.66-2.24 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/>
            <path fill="#fbbc05" d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84z"/>
            <path fill="#ea4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/>
          </svg>
          Continue with Google
        </button>

        <div className="mb-4 flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          <span className="h-px flex-1 bg-border/70" /> or email <span className="h-px flex-1 bg-border/70" />
        </div>

        <form onSubmit={submit} className="space-y-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@school.edu"
            className="w-full rounded-md border border-border bg-input/40 px-3 py-2 text-sm focus:border-steel focus:outline-none"
          />
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password (min 6 chars)"
            className="w-full rounded-md border border-border bg-input/40 px-3 py-2 text-sm focus:border-steel focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-signal px-3 py-2 text-sm font-medium text-abyss transition hover:bg-signal/85 disabled:opacity-50"
          >
            {busy ? "…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        <button
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="mt-4 w-full text-center text-xs text-muted-foreground hover:text-foreground"
        >
          {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}
