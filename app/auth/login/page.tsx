"use client";

import { useActionState } from "react";
import { signInWithEmail, type SignInState } from "../actions";

const initialState: SignInState = {};

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(
    signInWithEmail,
    initialState,
  );

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-8">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground">
          Cadence Intelligence
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          We&apos;ll email you a magic link. No password required.
        </p>

        {state.sent ? (
          <div className="mt-6 rounded-lg border border-border bg-secondary p-4 text-sm">
            Check your inbox for a sign-in link.
          </div>
        ) : (
          <form action={formAction} className="mt-6 flex flex-col gap-3">
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
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            {state.error ? (
              <p className="text-sm text-destructive">{state.error}</p>
            ) : null}
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity disabled:opacity-50"
            >
              {pending ? "Sending…" : "Send magic link"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
