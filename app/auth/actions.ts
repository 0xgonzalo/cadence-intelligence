"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { isEmailAllowed } from "@/lib/auth/allowlist";

export type SignInState = { error?: string; sent?: boolean };

export async function signInWithEmail(
  _prev: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Enter your email address." };
  if (!isEmailAllowed(email)) {
    return { error: "This email isn't on the CADENCE access list." };
  }

  const origin =
    (await headers()).get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL!;
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/callback?next=/radar` },
  });
  if (error) return { error: error.message };

  return { sent: true };
}
