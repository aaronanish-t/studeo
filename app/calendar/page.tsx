import { redirect } from "next/navigation";

import { CalendarView } from "@/components/calendar-view";
import { getCalendar } from "@/lib/calendar";
import { currentSession } from "@/lib/session";

export const metadata = { title: "Calendar" };
export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const session = await currentSession();
  if (!session) redirect("/sign-in");

  return (
    <CalendarView
      data={await getCalendar()}
      basePath=""
      badge={
        <span className="hidden text-xs text-text-muted sm:inline">{session.netId}</span>
      }
    />
  );
}
