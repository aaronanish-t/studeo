import { prisma } from "./db";

/**
 * Data for the bunk planner.
 *
 * The attendance page answers "where do I stand". This answers the question
 * students actually argue about in the corridor: *if I skip Thursday, what
 * happens?* That needs two things the dashboard doesn't carry — every course's
 * raw hours, so the arithmetic can be redone live, and which courses a given
 * day order would cost you.
 */

export interface PlanCourse {
  id: string;
  code: string;
  title: string;
  totalHours: number;
  attendedHours: number;
}

export interface PlanDay {
  dayOrder: number;
  /**
   * Teaching hours this day costs, per course id.
   *
   * One timetable row is one period and one attendance hour — the rows are
   * deliberately unmerged, so a two-period lab is two rows and therefore two
   * hours, which is exactly what the portal would charge you.
   */
  hoursByCourse: Record<string, number>;
  /** Total hours at stake that day, including any slot we can't attribute. */
  totalHours: number;
}

export interface PlanData {
  courses: PlanCourse[];
  days: PlanDay[];
}

export async function getPlanData(netId: string): Promise<PlanData | null> {
  const me = await prisma.user.findUnique({
    where: { netId },
    select: { id: true },
  });
  if (!me) return null;

  const courses = await prisma.course.findMany({
    where: { userId: me.id, attendance: { isNot: null } },
    select: {
      id: true,
      code: true,
      title: true,
      attendance: { select: { conducted: true, present: true, onDuty: true } },
    },
    orderBy: { code: "asc" },
  });

  const slots = await prisma.timetableSlot.findMany({
    where: { userId: me.id },
    select: { dayOrder: true, courseId: true },
  });

  const byDay = new Map<number, PlanDay>();
  for (const slot of slots) {
    const day = byDay.get(slot.dayOrder) ?? {
      dayOrder: slot.dayOrder,
      hoursByCourse: {},
      totalHours: 0,
    };

    day.totalHours += 1;
    // A slot with no course attached is a real teaching hour we can't bill to
    // anything — counted in the day's total, absent from the per-course map,
    // so the day button never claims more than it can actually model.
    if (slot.courseId) {
      day.hoursByCourse[slot.courseId] = (day.hoursByCourse[slot.courseId] ?? 0) + 1;
    }

    byDay.set(slot.dayOrder, day);
  }

  return {
    courses: courses.map((course) => ({
      id: course.id,
      code: course.code,
      title: course.title,
      totalHours: course.attendance?.conducted ?? 0,
      // On-duty is credited as attended, exactly as the portal reports it.
      attendedHours: (course.attendance?.present ?? 0) + (course.attendance?.onDuty ?? 0),
    })),
    days: [...byDay.values()].sort((a, b) => a.dayOrder - b.dayOrder),
  };
}
