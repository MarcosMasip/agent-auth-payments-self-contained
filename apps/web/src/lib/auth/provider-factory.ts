import { isLocalMode } from "@/lib/environment";
import { SupabaseAuthProvider } from "@/lib/auth/supabase-utils";
import { LocalAuthProvider } from "@/lib/auth/providers/local";
import type { AuthProvider } from "@/lib/auth/types";

// Lazy import to avoid bundling server-only code on client if not needed
export function createAuthProvider(): AuthProvider {
  if (isLocalMode()) {
    return new LocalAuthProvider();
  }
  return new SupabaseAuthProvider({
    redirectUrl: typeof window !== "undefined" ? window.location.origin : undefined,
  });
}
