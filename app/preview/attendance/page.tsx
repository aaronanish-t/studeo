import { notFound } from "next/navigation";

import { AttendanceView } from "@/components/attendance-view";
import { getDashboard } from "@/lib/dashboard";

export const metadata = { title: "Attendance" };
export const dynamic = "force-dynamic";

/** The seeded sample account. Internal name; nothing user-facing says "demo". */
const SAMPLE_NET_ID = "demo01";

export default async function PreviewAttendancePage() {
  const data = await getDashboard(SAMPLE_NET_ID);
  if (!data) notFound();

  return (
    <AttendanceView
      data={data}
      basePath="/preview"
      footnote="Sample data · not a real student"
    />
  );
}
