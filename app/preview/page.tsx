import { notFound } from "next/navigation";

import { DashboardView } from "@/components/dashboard-view";
import { getDashboard } from "@/lib/dashboard";
import { istMinutesNow } from "@/lib/today";

export const metadata = { title: "Preview" };

// Attendance moves, and a cached dashboard showing yesterday's number is worse
// than a slightly slower page.
export const dynamic = "force-dynamic";

/** The seeded sample account. Internal name; nothing user-facing says "demo". */
const SAMPLE_NET_ID = "demo01";

export default async function PreviewPage() {
  const data = await getDashboard(SAMPLE_NET_ID);
  if (!data) notFound();

  return (
    <DashboardView
      data={data}
      nowMin={istMinutesNow()}
      basePath="/preview"
      footnote="Sample data · not a real student"
    />
  );
}
