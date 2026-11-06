import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { apiFetch, signInUrl } from "@/lib/api";
import { SessionContext, type Session, type SessionStatus } from "./session-context";

type State = { status: SessionStatus; email?: string };

const SIGNED_OUT: State = { status: "signedOut" };

/** GET /api/me → signed in only for a 200 with a JSON `{ email: string }` body. Anything else is signed out. */
async function fetchSession(): Promise<State> {
  try {
    const res = await apiFetch("/api/me", { headers: { Accept: "application/json" } });
    if (!res.ok) return SIGNED_OUT;
    // A static host without the Worker may answer with index.html (200); that is signed out too
    const data: unknown = await res.json();
    const email = (data as { email?: unknown } | null)?.email;
    return typeof email === "string" ? { status: "signedIn", email } : SIGNED_OUT;
  } catch {
    return SIGNED_OUT;
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: "loading" });
  // Only the newest request may write state (StrictMode double effects, refresh races)
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++requestId.current;
    const next = await fetchSession();
    if (id === requestId.current) setState(next);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signIn = useCallback((nextPath?: string) => {
    const target = nextPath ?? `${window.location.pathname}${window.location.search}`;
    window.location.assign(signInUrl(target));
  }, []);

  const signOut = useCallback(async () => {
    let ok: boolean;
    try {
      ok = (await apiFetch("/api/logout", { method: "POST" })).ok;
    } catch {
      ok = false;
    }
    if (ok) {
      requestId.current++;
      setState(SIGNED_OUT);
    } else {
      // Logout was not confirmed; ask the server what the session really is
      await refresh();
    }
  }, [refresh]);

  const value = useMemo<Session>(
    () => ({ ...state, signIn, signOut, refresh }),
    [state, signIn, signOut, refresh],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
