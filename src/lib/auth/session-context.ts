import { createContext, useContext } from "react";

export type SessionStatus = "loading" | "signedIn" | "signedOut";

export type Session = {
  status: SessionStatus;
  email?: string;
  /** Full-page navigation to the BCB unified login; defaults to returning to the current page. */
  signIn: (nextPath?: string) => void;
  /** Ends the session on the server (POST /api/logout). Callers decide where to navigate next. */
  signOut: () => Promise<void>;
  /** Re-reads GET /api/me. */
  refresh: () => Promise<void>;
};

export const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession must be used inside <SessionProvider>");
  return session;
}
