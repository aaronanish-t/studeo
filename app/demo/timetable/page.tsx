import { notFound } from "next/navigation";

import { TimetableView } from "@/components/timetable-view";
import { getTimetableDay } from "@/lib/timetable";
import { getAcademicDay } from "@/lib/today";

export const metadata = { title: "Timetable" };
export const dynamic = "force-dynamic";

const DEMO_NET_ID = "demo01";

export default async function DemoTimetablePage({
  searchParams,
}: {
  searchParams: Promise<{ day?: string }>;
}) {
  const params = await searchParams;
  const today = await getAcademicDay();

  // Default to today's day order, falling back to Day 1 on a holiday — a
  // holiday has no day order at all, and an empty screen would look broken.
  const requested = Number(params.day);
  const dayOrder =
    requested >= 1 && requested <= 5 ? requested : (today.dayOrder ?? 1);

  const day = await getTimetableDay(DEMO_NET_ID, dayOrder);
  if (!day) notFound();

  return (
    <TimetableView
      day={day}
      dayOrder={dayOrder}
      today={today}
      basePath="/demo"
      badge={
        <span className="hidden rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-text-muted sm:inline">
          Demo data
        </span>
      }
    />
  );
}
