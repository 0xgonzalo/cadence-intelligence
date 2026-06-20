"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signInWithEmail, type SignInState } from "../actions";

const initialState: SignInState = {};

const PIPELINE = [
  { step: "01", label: "Analyze", desc: "Momentum scanned across markets, languages and platforms." },
  { step: "02", label: "Generate", desc: "AI drafts the angle, the brief and the hook." },
  { step: "03", label: "Package", desc: "Assets and stems assembled, ready to ship." },
  { step: "04", label: "Surface", desc: "The opportunity lands on your radar — newest first." },
];

// Market labels arranged around the scope, with a polar position for each blip.
const BLIPS = [
  { label: "Spotify", top: "16%", left: "70%", delay: "0s" },
  { label: "TikTok", top: "62%", left: "78%", delay: "0.6s" },
  { label: "Radio", top: "78%", left: "34%", delay: "1.2s" },
  { label: "Charts", top: "34%", left: "22%", delay: "1.8s" },
];

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(
    signInWithEmail,
    initialState,
  );

  return (
    <main className="relative flex flex-1 flex-col overflow-hidden">
      <div className="relative mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 items-center gap-14 px-6 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10 lg:py-20">
        {/* ── Left: the pitch + sign-in ── */}
        <section className="flex flex-col">
          <p
            className="animate-rise flex items-center gap-2.5 font-mono text-xs uppercase tracking-[0.32em] text-muted-foreground"
            style={{ animationDelay: "0ms" }}
          >
            <span className="relative flex size-2">
              <span className="absolute inset-0 animate-signal rounded-full bg-brand" />
              <span className="relative size-2 rounded-full bg-brand" />
            </span>
            Cadence Intelligence
          </p>

          <h1
            className="animate-rise mt-6 text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl"
            style={{ animationDelay: "80ms" }}
          >
            <span className="text-phosphor">See the signal</span>
            <br />
            <span className="text-foreground/90">before the chart does.</span>
          </h1>

          <p
            className="animate-rise mt-5 max-w-md text-pretty text-[15px] leading-relaxed text-muted-foreground"
            style={{ animationDelay: "160ms" }}
          >
            An autonomous intelligence layer for your catalog. Cadence watches
            momentum across every market, surfaces the tracks gaining velocity,
            and hands your team a ready-to-run content brief.
          </p>

          <div
            className="animate-rise mt-8 flex flex-wrap items-center gap-3"
            style={{ animationDelay: "240ms" }}
          >
            <Link
              href="/radar"
              className="brand-gradient group inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium text-brand-foreground shadow-[0_0_0_1px_var(--brand-muted)] transition-all hover:-translate-y-px hover:shadow-[0_12px_34px_-12px_var(--brand)] hover:brightness-110"
            >
              Enter the Radar
              <span
                aria-hidden
                className="transition-transform group-hover:translate-x-0.5"
              >
                →
              </span>
            </Link>
            <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              No account needed
            </span>
          </div>

          {/* Sign-in — phosphor-carded, kept fully functional */}
          <div
            className="animate-rise glow-brand relative mt-10 w-full max-w-md overflow-hidden rounded-xl border border-border bg-card/70 p-6 backdrop-blur-xl"
            style={{ animationDelay: "320ms" }}
          >
            <span
              aria-hidden
              className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand to-transparent"
            />
            <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
              Sync your roster
            </p>
            <p className="mt-1.5 text-sm text-muted-foreground">
              We&apos;ll email you a magic link. No password required.
            </p>

            {state.sent ? (
              <div className="mt-4 rounded-lg border border-brand/30 bg-brand/10 p-4 text-sm text-brand-bright">
                Check your inbox for a sign-in link.
              </div>
            ) : (
              <form
                action={formAction}
                className="mt-4 flex flex-col gap-3 sm:flex-row"
              >
                <label htmlFor="email" className="sr-only">
                  Email address
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="you@label.com"
                  className="flex-1 rounded-lg border border-input bg-background/60 px-3 py-2 text-sm outline-none transition-shadow focus:border-brand/40 focus:ring-2 focus:ring-ring"
                />
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-lg border border-brand/40 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.2em] text-brand-bright transition-all hover:bg-brand/10 hover:[box-shadow:0_0_24px_-8px_var(--brand)] disabled:opacity-60"
                >
                  {pending ? "Sending…" : "Send link"}
                </button>
              </form>
            )}
            {state.error ? (
              <p className="mt-3 text-sm text-destructive">{state.error}</p>
            ) : null}
          </div>
        </section>

        {/* ── Right: the radar scope ── */}
        <section className="flex items-center justify-center">
          <div className="relative aspect-square w-full max-w-md">
            {/* expanding sonar pulses */}
            <span className="absolute inset-0 animate-sonar rounded-full border border-brand/40" />
            <span
              className="absolute inset-0 animate-sonar rounded-full border border-brand/30"
              style={{ animationDelay: "1.7s" }}
            />

            {/* concentric rings */}
            <div className="absolute inset-0 rounded-full border border-brand/20" />
            <div className="absolute inset-[14%] rounded-full border border-brand/15" />
            <div className="absolute inset-[30%] rounded-full border border-brand/15" />
            <div className="absolute inset-[46%] rounded-full border border-brand/20" />

            {/* crosshairs */}
            <span className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-gradient-to-r from-transparent via-brand/20 to-transparent" />
            <span className="absolute bottom-0 top-0 left-1/2 w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-brand/20 to-transparent" />

            {/* rotating sweep beam */}
            <div className="absolute inset-0 overflow-hidden rounded-full [mask-image:radial-gradient(circle,black,black)]">
              <div
                className="animate-radar absolute inset-0 rounded-full"
                style={{
                  background:
                    "conic-gradient(from 0deg, oklch(0.62 0.11 191 / 0.34) 0deg, oklch(0.62 0.11 191 / 0.06) 26deg, transparent 70deg, transparent 360deg)",
                }}
              />
            </div>

            {/* market blips */}
            {BLIPS.map((b) => (
              <div
                key={b.label}
                className="absolute flex items-center gap-1.5"
                style={{ top: b.top, left: b.left }}
              >
                <span className="relative flex size-2">
                  <span
                    className="absolute inset-0 animate-signal rounded-full bg-brand-bright"
                    style={{ animationDelay: b.delay }}
                  />
                  <span className="relative size-2 rounded-full bg-brand-bright" />
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                  {b.label}
                </span>
              </div>
            ))}

            {/* center hub */}
            <span className="absolute left-1/2 top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 animate-breathe rounded-full bg-brand [box-shadow:0_0_18px_4px_var(--brand)]" />

            {/* readout */}
            <p className="absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
              <span className="text-brand-bright">●</span> Live · 4 markets
            </p>
          </div>
        </section>
      </div>

      {/* ── Pipeline strip ── */}
      <div className="relative border-t border-border bg-background/40 backdrop-blur-sm">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand/40 to-transparent"
        />
        <div className="mx-auto grid w-full max-w-6xl grid-cols-2 gap-px px-6 py-2 lg:grid-cols-4">
          {PIPELINE.map((p, i) => (
            <div
              key={p.label}
              className="animate-rise flex flex-col gap-1 px-2 py-5"
              style={{ animationDelay: `${400 + i * 80}ms` }}
            >
              <p className="flex items-baseline gap-2">
                <span className="font-mono text-[11px] tabular-nums text-brand-bright">
                  {p.step}
                </span>
                <span className="font-mono text-[11px] uppercase tracking-[0.28em] text-foreground">
                  {p.label}
                </span>
              </p>
              <p className="text-pretty text-xs leading-relaxed text-muted-foreground">
                {p.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
