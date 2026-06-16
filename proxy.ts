import { updateSession } from "@/lib/supabase/middleware";
import type { NextRequest } from "next/server";

export async function proxy(req: NextRequest) {
  return updateSession(req);
}

export const config = {
  // Run on page routes only. API routes do their own auth gating, so
  // including them here would clobber their 401/403 responses with a
  // redirect to /auth/login.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
