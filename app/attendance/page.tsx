import { redirect } from "next/navigation";

import { AttendanceView } from "@/components/attendance-view";
import { getDashboard } from "@/lib/dashboard";
import { currentSession } from "@/lib/session";

export const metadata = { title: "Attendance" };
export const dynamic = "force-dynamic";

export default async function AttendancePage() {
  const session = await currentSession();
  if (!session) redirect("/connect");

  const data = await getDashboard(session.netId);
  if (!data) redirect("/dashboard");

  return (
    <AttendanceView
      data={data}
      basePath=""
      badge={
        <span className="hidden text-xs text-text-muted sm:inline">{session.netId}</span>
      }
    />
  );
}
