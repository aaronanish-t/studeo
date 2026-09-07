import Link from "next/link";
import { redirect } from "next/navigation";

import { DashboardView } from "@/components/dashboard-view";
import { getDashboard } from "@/lib/dashboard";
import { currentSession } from "@/lib/session";
import { istMinutesNow } from "@/lib/today";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await currentSession();
  if (!session) redirect("/connect");

  const data = await getDashboard(session.netId);

  // Signed in but nothing synced yet — a real state, not an error. It happens
  // between claiming an account and the first successful pull.
  if (!data) {
    return (
      <div className="mx-auto w-full max-w-2xl px-6 py-24 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Nothing synced yet</h1>
        <p className="mx-auto mt-3 max-w-[44ch] text-text-muted">
          Your account exists, but no data has come through. Open the Studeo
          extension while signed in to the Student Portal and run a sync.
        </p>
        <Link
          href="/connect"
          className="mt-8 inline-block rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-accent-fg transition-colors hover:bg-accent-hover"
        >
          How to connect
        </Link>
      </div>
    );
  }

  return (
    <DashboardView
      data={data}
      nowMin={istMinutesNow()}
      basePath=""
      badge={
        <span className="text-xs text-text-muted">
          {session.netId}
        </span>
      }
    />
  );
}
