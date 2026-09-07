import { statusOf, summarise, verdictFor, type AttendanceVerdict } from "./attendance";
import { prisma } from "./db";
import { getAcademicDay } from "./today";

/**
 * Everything the dashboard needs, in one query pass.
 *
 * Kept out of the page component so the shape is testable and so the "calm"
 * dashboard and the eventual dense course list can share it rather than each
 * inventing their own reads.
 */

export interface CourseLine {
  id: string;
  code: string;
  title: string;
  kind: string;
  verdict: AttendanceVerdict;
  summary: string;
}

export interface UpcomingClass {
  courseCode: string | null;
  courseTitle: string | null;
  slotCode: string;
  room: string | null;
  startMin: number;
  endMin: number;
}

export interface DashboardData {
  student: { name: string; program: string | null; semester: number | null };
  today: { date: Date; dayOrder: number | null; label: string | null; isHoliday: boolean };
  overall: { percentage: number; totalHours: number; attendedHours: number };
  courses: CourseLine[];
  atRisk: CourseLine[];
  schedule: UpcomingClass[];
}

// Date handling lives in lib/today.ts — see the note there on why "today" has
// to mean today in Chennai rather than today on the server.

export async function getDashboard(
  netId: string,
  now: Date = new Date()
): Promise<DashboardData | null> {
  const user = await prisma.user.findUnique({
    where: { netId },
    include: {
      courses: { include: { attendance: true } },
    },
  });

  if (!user) return null;

  const day = await getAcademicDay(now);

  // A holiday has no day order, so there is nothing to show for today. That's
  // a legitimate state, not an error — the UI says "no classes" and means it.
  const dayOrder = day.dayOrder;

  const schedule: UpcomingClass[] =
    dayOrder === null
      ? []
      : (
          await prisma.timetableSlot.findMany({
            where: { userId: user.id, dayOrder },
            orderBy: { startMin: "asc" },
            include: { course: true },
          })
        ).map((slot) => ({
          courseCode: slot.course?.code ?? null,
          courseTitle: slot.course?.title ?? null,
          slotCode: slot.slotCode,
          room: slot.room,
          startMin: slot.startMin,
          endMin: slot.endMin,
        }));

  const courses: CourseLine[] = user.courses
    .filter((course) => course.attendance !== null)
    .map((course) => {
      const record = course.attendance!;

      // The database stores what the portal reports. SRM reports HOURS, and
      // counts on-duty as attended — see lib/attendance.ts.
      const input = {
        totalHours: record.conducted,
        attendedHours: record.present + record.onDuty,
      };

      const verdict = verdictFor(input);

      return {
        id: course.id,
        code: course.code,
        title: course.title,
        kind: course.kind,
        verdict,
        summary: summarise(verdict),
      };
    })
    .sort((a, b) => a.verdict.percentage - b.verdict.percentage);

  const totalHours = courses.reduce((sum, c) => sum + c.verdict.totalHours, 0);
  const attendedHours = courses.reduce((sum, c) => sum + c.verdict.attendedHours, 0);

  return {
    student: {
      name: user.name,
      program: user.program,
      semester: user.year ?? null,
    },
    today: {
      date: day.date,
      dayOrder,
      label: day.label,
      isHoliday: day.isHoliday,
    },
    overall: {
      percentage: totalHours === 0 ? 0 : Number(((attendedHours / totalHours) * 100).toFixed(2)),
      totalHours,
      attendedHours,
    },
    courses,
    atRisk: courses.filter(
      (c) => statusOf({ totalHours: c.verdict.totalHours, attendedHours: c.verdict.attendedHours }) !== "safe"
    ),
    schedule,
  };
}
