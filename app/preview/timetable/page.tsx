import { notFound } from "next/navigation";

import { TimetableView } from "@/components/timetable-view";
import { getTimetableDay } from "@/lib/timetable";
import { getAcademicDay } from "@/lib/today";

export const metadata = { title: "Timetable" };
export const dynamic = "force-dynamic";

/** The seeded sample account. Internal name; nothing user-facing says "demo". */
const SAMPLE_NET_ID = "demo01";

export default async function PreviewTimetablePage({
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

  const day = await getTimetableDay(SAMPLE_NET_ID, dayOrder);
  if (!day) notFound();

  return (
    <TimetableView
      day={day}
      dayOrder={dayOrder}
      today={today}
      basePath="/preview"
      footnote="Sample data · not a real student"
    />
  );
}
