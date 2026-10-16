import { CalendarView } from "@/components/calendar-view";
import { getCalendar } from "@/lib/calendar";

export const metadata = { title: "Calendar" };
export const dynamic = "force-dynamic";

/**
 * The calendar is campus-wide rather than per-student, so the preview shows
 * the real thing — there is no sample version of it and nothing invented here.
 */
export default async function PreviewCalendarPage() {
  return <CalendarView data={await getCalendar()} basePath="/preview" />;
}
