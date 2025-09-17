import type {
  AuthCredentials,
  AuthError,
  AuthProvider,
  Session,
  User,
} from "@/lib/auth/types";

export class LocalAuthProvider implements AuthProvider {
  private listeners: Array<(s: Session | null) => void> = [];

  private notify(session: Session | null) {
    for (const cb of this.listeners) cb(session);
  }

  async signUp(credentials: AuthCredentials) {
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
      });
      const data = await res.json();
      if (!res.ok) return { user: null, session: null, error: { message: data.error || "Signup failed", status: res.status } as AuthError };
      const session: Session = data.session;
      this.notify(session);
      return { user: session.user, session, error: null };
    } catch (e: any) {
      return { user: null, session: null, error: { message: e.message } };
    }
  }

  async signIn(credentials: AuthCredentials) {
    try {
      const res = await fetch("/api/auth/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
      });
      const data = await res.json();
      if (!res.ok) return { user: null, session: null, error: { message: data.error || "Signin failed", status: res.status } as AuthError };
      const session: Session = data.session;
      this.notify(session);
      return { user: session.user, session, error: null };
    } catch (e: any) {
      return { user: null, session: null, error: { message: e.message } };
    }
  }

  async signInWithGoogle() {
    return { user: null, session: null, error: { message: "Google auth disabled in Local Mode" } };
  }

  async signOut() {
    try {
      const res = await fetch("/api/auth/signout", { method: "POST" });
      if (!res.ok) return { error: { message: "Signout failed", status: res.status } };
      this.notify(null);
      return { error: null };
    } catch (e: any) {
      return { error: { message: e.message } };
    }
  }

  async getSession(): Promise<Session | null> {
    try {
      const res = await fetch("/api/auth/session");
      if (!res.ok) return null;
      const data = await res.json();
      return data.session ?? null;
    } catch {
      return null;
    }
  }

  async refreshSession(): Promise<Session | null> {
    return this.getSession();
  }

  async getCurrentUser(): Promise<User | null> {
    const session = await this.getSession();
    return session?.user ?? null;
  }

  async updateUser(_attributes: Partial<User>) {
    // For Local Mode MVP, skip profile updates
    const user = await this.getCurrentUser();
    return { user, error: null };
  }

  async resetPassword(_email: string) {
    return { error: { message: "Password reset disabled in Local Mode" } };
  }

  async updatePassword(_newPassword: string) {
    return { error: { message: "Password update disabled in Local Mode" } };
  }

  onAuthStateChange(callback: (session: Session | null) => void) {
    this.listeners.push(callback);
    return {
      unsubscribe: () => {
        this.listeners = this.listeners.filter((cb) => cb !== callback);
      },
    };
  }
}
