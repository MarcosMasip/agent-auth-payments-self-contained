function env(name: string): string | undefined {
  // Use globalThis to avoid requiring Node types
  // optional chaining on process in browser-safe way
  return (globalThis as any)?.process?.env?.[name] ?? (typeof window !== "undefined" ? (window as any)?.[name] : undefined);
}

export function isLocalMode() {
  return env("LOCAL_MODE") === "true" || env("NEXT_PUBLIC_LOCAL_MODE") === "true";
}

export function getLocalJwtSecret() {
  return env("LOCAL_JWT_SECRET") || "dev_local_jwt_secret_change_me";
}
