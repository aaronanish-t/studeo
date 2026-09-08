import { prisma } from "./db";
import { parseCourseTable } from "./sources/academia-portal";
import { buildTimetable } from "./sources/slot-grid";
import {
  parseAttendance,
  parseCalendar,
  parseMarksDetail,
  parseMarksSummary,
  parseProfile,
} from "./sources/student-portal";

/**
 * Turning captured portal HTML into rows.
 *
 * The extension fetches a student's own pages in their own browser — where
 * their cookies are attached automatically and they completed the login
 * themselves — and posts the HTML here. Nothing about a credential or a session
 * ever reaches this server; the payload is the same markup the student is
 * looking at.
 *
 * Every section is optional. A student might be signed into the Student Portal
 * but not Academia, or the marks page might not exist yet this semester. A
 * partial payload updates what it can and leaves the rest alone, rather than
 * failing the whole sync.
 */

export interface IngestPayload {
  /** Required: identifies who this belongs to. */
  profileHtml: string;
  /** Student Portal form 9. */
  attendanceHtml?: string;
  /** Student Portal form 13 — the summary list. */
  marksHtml?: string;
  /**
   * The per-course component breakdowns, one entry per graded course.
   *
   * Separate from marksHtml because the portal hides components behind a second
   * request per course, keyed on an internal id that appears only in the
   * summary's onclick handler. The extension makes those requests and sends the
   * results here alongside the summary.
   */
  marksDetail?: Array<{ courseCode: string; html: string }>;
  /** Student Portal form 129 — campus-wide, shared by everyone. */
  calendarHtml?: string;
  /** Academia's course table — the only source of slots. */
  coursesHtml?: string;
}

export interface IngestResult {
  userId: string;
  netId: string;
  wrote: {
    courses: number;
    attendance: number;
    marks: number;
    timetableSlots: number;
    calendarDays: number;
  };
}

export class IngestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IngestError";
  }
}

export async function ingest(payload: IngestPayload): Promise<IngestResult> {
  const profile = parseProfile(payload.profileHtml);

  if (!profile.netId) {
    throw new IngestError(
      "Couldn't identify you from that page. Make sure you're signed in to the Student Portal, then try again."
    );
  }

  const user = await prisma.user.upsert({
    where: { netId: profile.netId },
    create: {
      netId: profile.netId,
      email: profile.email ?? `${profile.netId}@srmist.edu.in`,
      name: profile.name ?? profile.netId,
      regNo: profile.regNo,
      program: profile.program,
      section: profile.section,
      year: profile.semester ? Math.ceil(profile.semester / 2) : null,
      lastSyncedAt: new Date(),
    },
    update: {
      // Don't overwrite a known value with a null from a partial page.
      ...(profile.name ? { name: profile.name } : {}),
      ...(profile.regNo ? { regNo: profile.regNo } : {}),
      ...(profile.program ? { program: profile.program } : {}),
      ...(profile.section ? { section: profile.section } : {}),
      ...(profile.semester ? { year: Math.ceil(profile.semester / 2) } : {}),
      lastSyncedAt: new Date(),
    },
  });

  const run = await prisma.syncRun.create({
    data: { userId: user.id, status: "RUNNING" },
  });

  const wrote = {
    courses: 0,
    attendance: 0,
    marks: 0,
    timetableSlots: 0,
    calendarDays: 0,
  };

  try {
    if (payload.coursesHtml) {
      const result = await ingestCourses(user.id, payload.coursesHtml);
      wrote.courses += result.courses;
      wrote.timetableSlots += result.slots;
    }

    if (payload.attendanceHtml) {
      wrote.attendance = await ingestAttendance(user.id, payload.attendanceHtml);
    }

    if (payload.marksHtml) {
      wrote.marks = await ingestMarks(user.id, payload.marksHtml, payload.marksDetail);
    }

    if (payload.calendarHtml) {
      wrote.calendarDays = await ingestCalendar(payload.calendarHtml);
    }

    await prisma.syncRun.update({
      where: { id: run.id },
      data: {
        status: "OK",
        finishedAt: new Date(),
        durationMs: Date.now() - run.startedAt.getTime(),
        wrote,
      },
    });

    await refreshOverall(user.id);

    return { userId: user.id, netId: profile.netId, wrote };
  } catch (error) {
    await prisma.syncRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        error: error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
  }
}

// ---------------------------------------------------------------------------

async function ingestCourses(userId: string, html: string) {
  const rows = parseCourseTable(html);
  if (rows.length === 0) return { courses: 0, slots: 0 };

  for (const row of rows) {
    await prisma.course.upsert({
      where: { userId_code_kind: { userId, code: row.code, kind: row.kind } },
      create: {
        userId,
        code: row.code,
        kind: row.kind,
        title: row.title,
        credits: row.credits,
        faculty: row.faculty,
        slot: row.slot,
        room: row.room,
        category: row.category,
        academicYear: row.academicYear,
      },
      update: {
        title: row.title,
        credits: row.credits,
        faculty: row.faculty,
        slot: row.slot,
        room: row.room,
        category: row.category,
        academicYear: row.academicYear,
      },
    });
  }

  // The timetable is derived, not stored incrementally: a dropped course must
  // vanish from the grid, so it's cheaper and safer to rebuild the week than to
  // reconcile it row by row.
  const courses = await prisma.course.findMany({
    where: { userId },
    select: { id: true, code: true, kind: true, slot: true, room: true },
  });

  const idBySlotAndCode = new Map(
    courses.map((course) => [`${course.code}|${course.slot ?? ""}`, course.id])
  );

  const placements = buildTimetable(
    courses.map((course) => ({
      courseCode: `${course.code}|${course.slot ?? ""}`,
      slot: course.slot,
      room: course.room,
    }))
  );

  await prisma.timetableSlot.deleteMany({ where: { userId } });
  await prisma.timetableSlot.createMany({
    data: placements.map((placement) => ({
      userId,
      dayOrder: placement.dayOrder,
      slotCode: placement.slot,
      startMin: placement.startMin,
      endMin: placement.endMin,
      room: placement.room,
      courseId: idBySlotAndCode.get(placement.courseCode) ?? null,
    })),
    skipDuplicates: true, // two courses timetabled into one hour is the portal's bug, not ours
  });

  return { courses: rows.length, slots: placements.length };
}

async function ingestAttendance(userId: string, html: string): Promise<number> {
  const { courses } = parseAttendance(html);
  let written = 0;

  for (const row of courses) {
    // The Student Portal reports ONE attendance figure per course code, while
    // Academia lists theory and lab as separate rows. Attach the figure to the
    // theory row (the primary registration); the lab row correctly ends up with
    // no attendance of its own, because SRM doesn't track it separately.
    const course =
      (await prisma.course.findFirst({
        where: { userId, code: row.courseCode, kind: "THEORY" },
      })) ??
      (await prisma.course.findFirst({ where: { userId, code: row.courseCode } })) ??
      // Attendance can arrive before Academia's course table — the student may
      // not be signed into Academia at all. Create a stub so the number isn't
      // silently dropped; a later sync fills in slot, faculty and room.
      (await prisma.course.create({
        data: { userId, code: row.courseCode, title: row.title, kind: "THEORY" },
      }));

    const attended = row.attendedHours;
    const percentage =
      row.totalHours === 0 ? 0 : Number(((attended / row.totalHours) * 100).toFixed(2));

    await prisma.attendanceRecord.upsert({
      where: { courseId: course.id },
      create: {
        courseId: course.id,
        conducted: row.totalHours,
        present: attended,
        absent: row.absentHours,
        onDuty: 0, // already folded into "Att. hours" upstream
        percentage,
      },
      update: {
        conducted: row.totalHours,
        present: attended,
        absent: row.absentHours,
        percentage,
        capturedAt: new Date(),
      },
    });

    // Append-only history, but only when the numbers actually moved — otherwise
    // a sync every four hours writes a row every four hours forever.
    const latest = await prisma.attendanceSnapshot.findFirst({
      where: { courseId: course.id },
      orderBy: { takenAt: "desc" },
    });

    if (!latest || latest.conducted !== row.totalHours || latest.present !== attended) {
      await prisma.attendanceSnapshot.create({
        data: {
          courseId: course.id,
          conducted: row.totalHours,
          present: attended,
          percentage,
        },
      });
    }

    written++;
  }

  return written;
}

async function ingestMarks(
  userId: string,
  html: string,
  details: IngestPayload["marksDetail"]
): Promise<number> {
  const summaries = parseMarksSummary(html);
  const detailByCode = new Map((details ?? []).map((d) => [d.courseCode, d.html]));
  let written = 0;

  for (const summary of summaries) {
    const course = await prisma.course.findFirst({
      where: { userId, code: summary.courseCode },
      orderBy: { kind: "asc" },
    });
    if (!course) continue;

    const detailHtml = detailByCode.get(summary.courseCode);
    let components: ReturnType<typeof parseMarksDetail> = [];

    if (detailHtml) {
      try {
        components = parseMarksDetail(detailHtml);
      } catch {
        // A breakdown that won't parse shouldn't cost us the total we already
        // have. Fall through and store the summary instead.
        components = [];
      }
    }

    if (components.length > 0) {
      for (const component of components) {
        await prisma.markRecord.upsert({
          where: {
            courseId_testCode: { courseId: course.id, testCode: component.component },
          },
          create: {
            courseId: course.id,
            testCode: component.component,
            maxMarks: component.maxMark ?? 0,
            obtained: component.obtained,
          },
          update: {
            maxMarks: component.maxMark ?? 0,
            obtained: component.obtained,
            capturedAt: new Date(),
          },
        });
      }

      // Drop the placeholder total now that the real components are here.
      // Keeping both would leave the course ambiguous: is TOTAL a component or
      // a rollup? getMarks would have to guess, and one day guess wrong.
      //
      // deleteMany, not delete: there is usually nothing to remove (this course
      // never had a placeholder), and delete THROWS on a missing row. Catching
      // that works but Prisma still logs an error for it, so every clean sync
      // printed a stack trace that looked like a failure and wasn't.
      await prisma.markRecord.deleteMany({
        where: { courseId: course.id, testCode: "TOTAL" },
      });

      written += components.length;
      continue;
    }

    // No breakdown available: record the summary total under a reserved code.
    await prisma.markRecord.upsert({
      where: { courseId_testCode: { courseId: course.id, testCode: "TOTAL" } },
      create: {
        courseId: course.id,
        testCode: "TOTAL",
        maxMarks: summary.maxMark ?? 0,
        obtained: summary.obtained,
      },
      update: {
        maxMarks: summary.maxMark ?? 0,
        obtained: summary.obtained,
        capturedAt: new Date(),
      },
    });

    written++;
  }

  return written;
}

async function ingestCalendar(html: string): Promise<number> {
  const days = parseCalendar(html);
  if (days.length === 0) return 0;

  // Campus-wide data: one student's sync serves everybody, which is why this
  // isn't scoped to a user and why it's worth syncing rarely.
  for (const day of days) {
    const date = new Date(`${day.date}T00:00:00.000Z`);

    await prisma.academicDay.upsert({
      where: { date },
      create: {
        date,
        dayOrder: day.dayOrder,
        label: day.remark,
        isHoliday: day.isHoliday,
      },
      update: {
        dayOrder: day.dayOrder,
        label: day.remark,
        isHoliday: day.isHoliday,
      },
    });
  }

  return days.length;
}

/** Denormalised header figure, recomputed after every sync. */
async function refreshOverall(userId: string): Promise<void> {
  const records = await prisma.attendanceRecord.findMany({
    where: { course: { userId } },
    select: { conducted: true, present: true, onDuty: true },
  });

  const conducted = records.reduce((sum, r) => sum + r.conducted, 0);
  const attended = records.reduce((sum, r) => sum + r.present + r.onDuty, 0);

  await prisma.user.update({
    where: { id: userId },
    data: {
      attendanceOverall:
        conducted === 0 ? null : Number(((attended / conducted) * 100).toFixed(2)),
    },
  });
}
