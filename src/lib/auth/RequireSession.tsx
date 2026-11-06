import { useEffect, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { useSession } from "./session-context";

/** Renders children only for a signed-in user; a signed-out user is sent to the BCB login and back to `next`. */
export function RequireSession({ next, children }: { next: string; children: ReactNode }) {
  const { status, signIn } = useSession();

  useEffect(() => {
    if (status === "signedOut") signIn(next);
  }, [status, signIn, next]);

  if (status === "signedIn") return <>{children}</>;
  return (
    <div role="status" aria-label="Loading" className="flex-1 min-h-[50vh] flex items-center justify-center bg-background">
      <Loader2 className="h-10 w-10 animate-spin text-primary" />
    </div>
  );
}
