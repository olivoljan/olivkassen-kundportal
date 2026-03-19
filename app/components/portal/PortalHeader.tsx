"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";

type PortalHeaderProps = {
  user?: {
    email?: string | null;
  };
};

export function PortalHeader({ user }: PortalHeaderProps) {
  const router = useRouter();

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  };

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[40px] font-extrabold leading-tight tracking-[-1.9px]">
            Mina sidor
          </h1>

          <p className="mt-3 text-lg text-muted-foreground">
            Här kan du hantera ditt abonnemang, pausa leveranser,
            ändra uppgifter och se din orderhistorik.
          </p>

          {user?.email && (
            <p className="mt-4 text-md text-muted-foreground">
              Inloggad som: <span className="font-medium text-foreground">{user.email}</span>
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <button
          onClick={handleLogout}
          className="text-lg text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          Logga ut
        </button>
      </div>
    </div>
  );
}
