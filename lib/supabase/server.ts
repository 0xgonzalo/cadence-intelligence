import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./types";

export async function createClient() {
  const store = await cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (toSet) => {
          try {
            toSet.forEach(({ name, value, options }) => store.set(name, value, options));
          } catch {
            // Setting cookies from a server component is unsupported.
            // The middleware refreshes sessions so this is a safe no-op.
          }
        },
      },
    },
  );
}

export function createServiceClient() {
  // Service-role client — bypasses RLS. NEVER expose to the browser.
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } },
  );
}

/** A typed Supabase client (RLS-bound or service-role — both share this type). */
export type DbClient = ReturnType<typeof createServiceClient>;
