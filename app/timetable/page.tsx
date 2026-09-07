import { redirect } from "next/navigation";

import { TimetableView } from "@/components/timetable-view";
import { currentSession } from "@/lib/session";
import { getTimetableDay } from "@/lib/timetable";
import { getAcademicDay } from "@/lib/today";

export const metadata = { title: "Timetable" };
export const dynamic = "force-dynamic";

export default async function TimetablePage({
  searchParams,
}: {
  searchParams: Promise<{ day?: string }>;
}) {
  const session = await currentSession();
  if (!session) redirect("/connect");

  const params = await searchParams;
  const today = await getAcademicDay();

  const requested = Number(params.day);
  const dayOrder =
    requested >= 1 && requested <= 5 ? requested : (today.dayOrder ?? 1);

  const day = await getTimetableDay(session.netId, dayOrder);
  if (!day) redirect("/dashboard");

  return (
    <TimetableView
      day={day}
      dayOrder={dayOrder}
      today={today}
      basePath=""
      badge={<span className="hidden text-xs text-text-muted sm:inline">{session.netId}</span>}
    />
  );
}
