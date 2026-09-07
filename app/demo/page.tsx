import { notFound } from "next/navigation";

import { DashboardView } from "@/components/dashboard-view";
import { getDashboard } from "@/lib/dashboard";
import { istMinutesNow } from "@/lib/today";

export const metadata = { title: "Demo" };

// Attendance moves, and a cached dashboard showing yesterday's number is worse
// than a slightly slower page.
export const dynamic = "force-dynamic";

const DEMO_NET_ID = "demo01";

export default async function DemoPage() {
  const data = await getDashboard(DEMO_NET_ID);
  if (!data) notFound();

  return (
    <DashboardView
      data={data}
      nowMin={istMinutesNow()}
      basePath="/demo"
      badge={
        <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-text-muted">
          Demo data
        </span>
      }
    />
  );
}
