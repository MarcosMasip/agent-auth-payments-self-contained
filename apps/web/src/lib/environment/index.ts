function env(name: string): string | undefined {
  // Use globalThis to avoid requiring Node types
  // optional chaining on process in browser-safe way
  return (globalThis as any)?.process?.env?.[name] ?? (typeof window !== "undefined" ? (window as any)?.[name] : undefined);
}

export function isLocalMode() {
  // In client bundles, prefer a direct reference so Next.js can inline
  // the value of NEXT_PUBLIC_LOCAL_MODE at build time.
  if (typeof window !== "undefined") {
    if (process.env.NEXT_PUBLIC_LOCAL_MODE === "true") return true;
  }
  // Fallback for server/edge environments and tests
  return (
    (typeof process !== "undefined" && process.env.LOCAL_MODE === "true") ||
    (typeof process !== "undefined" && process.env.NEXT_PUBLIC_LOCAL_MODE === "true") ||
    env("LOCAL_MODE") === "true" ||
    env("NEXT_PUBLIC_LOCAL_MODE") === "true"
  );
}

export function getLocalJwtSecret() {
  return env("LOCAL_JWT_SECRET") || "dev_local_jwt_secret_change_me";
}
