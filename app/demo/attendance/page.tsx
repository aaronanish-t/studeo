import { notFound } from "next/navigation";

import { AttendanceView } from "@/components/attendance-view";
import { getDashboard } from "@/lib/dashboard";

export const metadata = { title: "Attendance" };
export const dynamic = "force-dynamic";

const DEMO_NET_ID = "demo01";

export default async function DemoAttendancePage() {
  const data = await getDashboard(DEMO_NET_ID);
  if (!data) notFound();

  return (
    <AttendanceView
      data={data}
      basePath="/demo"
      badge={
        <span className="hidden rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-text-muted sm:inline">
          Demo data
        </span>
      }
    />
  );
}
