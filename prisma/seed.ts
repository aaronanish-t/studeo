/**
 * Seeds the demo accounts.
 *
 * Idempotent — safe to run repeatedly against the same database. Everything it
 * writes is flagged isDemo, so a real user can never be clobbered by a reseed
 * and the demo can be wiped without touching production rows.
 *
 *   npm run db:seed
 */

// MUST be first: loads .env.local before anything reads process.env.
// See lib/env.ts for why this is a side-effect import and not a function call.
import "../lib/env";

import { prisma } from "../lib/db";
import {
  attendancePercentage,
  COURSE_CATALOGUE,
  DEMO_FRIENDSHIPS,
  DEMO_STUDENTS,
} from "../lib/demo/fixtures";
import { buildTimetable } from "../lib/sources/slot-grid";

async function main() {
  console.log("Seeding demo data…");

  // Wipe previous demo rows only. Cascades handle the dependent tables.
  const removed = await prisma.user.deleteMany({ where: { isDemo: true } });
  if (removed.count > 0) console.log(`  cleared ${removed.count} existing demo users`);

  const userIdByNetId = new Map<string, string>();

  for (const student of DEMO_STUDENTS) {
    const user = await prisma.user.create({
      data: {
        netId: student.netId,
        email: `${student.netId}@srmist.edu.in`,
        name: student.name,
        regNo: student.regNo,
        department: student.department,
        program: student.program,
        year: student.year,
        section: student.section,
        // Demo timetables are placed against Batch 1's grid, so the row has to
        // say Batch 1. Leaving it null would make the seeded data incoherent:
        // a student with a timetable we could not have derived for them.
        batch: 1,
        isDemo: true,
        lastSyncedAt: new Date(),
      },
    });

    userIdByNetId.set(student.netId, user.id);

    let conductedTotal = 0;
    let attendedTotal = 0;

    for (const enrolment of student.enrolments) {
      const spec = COURSE_CATALOGUE[enrolment.course];
      const percentage = attendancePercentage(enrolment.attendance);

      conductedTotal += enrolment.attendance.conducted;
      attendedTotal += enrolment.attendance.present + enrolment.attendance.onDuty;

      const course = await prisma.course.create({
        data: {
          userId: user.id,
          code: spec.code,
          title: spec.title,
          credits: spec.credits,
          faculty: spec.faculty,
          slot: spec.slot,
          room: spec.room,
          kind: spec.kind,

          attendance: {
            create: {
              conducted: enrolment.attendance.conducted,
              present: enrolment.attendance.present,
              absent:
                enrolment.attendance.conducted -
                enrolment.attendance.present -
                enrolment.attendance.onDuty,
              onDuty: enrolment.attendance.onDuty,
              percentage,
            },
          },

          marks: {
            create: enrolment.marks.map((mark) => ({
              testCode: mark.testCode,
              maxMarks: mark.maxMarks,
              obtained: mark.obtained,
              weightage: mark.weightage,
            })),
          },
        },
      });

      // Placements are DERIVED from the slot grid, never invented.
      //
      // This is the same buildTimetable() that real synced data goes through:
      // Academia tells us "this course is in slot A", and the Unified Time
      // Table says where slot A falls. Hand-writing (day, hour) pairs here
      // produced a demo that contradicted the grid — a course sitting in slot
      // A but appearing at hours slot A doesn't occupy — which is both wrong
      // and, worse, means the demo exercises none of the real code path.
      for (const placement of buildTimetable([
        { courseCode: spec.code, slot: spec.slot, room: spec.room },
      ])) {
        await prisma.timetableSlot.create({
          data: {
            userId: user.id,
            dayOrder: placement.dayOrder,
            slotCode: placement.slot,
            startMin: placement.startMin,
            endMin: placement.endMin,
            room: placement.room,
            courseId: course.id,
          },
        });
      }
    }

    const overall = conductedTotal === 0 ? 0 : (attendedTotal / conductedTotal) * 100;
    await prisma.user.update({
      where: { id: user.id },
      data: { attendanceOverall: Number(overall.toFixed(2)) },
    });

    console.log(
      `  ${student.name} — ${student.enrolments.length} courses, ${overall.toFixed(1)}% overall`
    );
  }

  for (const [a, b] of DEMO_FRIENDSHIPS) {
    const requesterId = userIdByNetId.get(a);
    const addresseeId = userIdByNetId.get(b);
    if (!requesterId || !addresseeId) continue;

    await prisma.friendship.create({
      data: { requesterId, addresseeId, status: "ACCEPTED", respondedAt: new Date() },
    });
  }

  console.log(`  ${DEMO_FRIENDSHIPS.length} friendships`);

  await seedCalendar();
  console.log("Done.");
}

/**
 * The AY2026-27 ODD calendar.
 *
 * Holidays are the real ones from SRM's published academic planner. The day
 * orders are then derived the way the institution actually derives them: the
 * cycle advances only on working days, so a holiday PAUSES it rather than
 * consuming a number. Get this wrong and every timetable is silently offset
 * after the first festival.
 *
 * Unlike the students above this is campus-wide data with no isDemo flag, so
 * it's cleared by date range rather than by owner.
 */
async function seedCalendar() {
  const TERM_START = new Date(Date.UTC(2026, 6, 21)); // 21 Jul 2026, a Tuesday
  const TERM_END = new Date(Date.UTC(2026, 11, 7)); // 7 Dec 2026

  const HOLIDAYS: Record<string, string> = {
    "2026-08-15": "Independence Day",
    "2026-08-24": "Classes Suspended",
    "2026-08-26": "Milad-un-Nabi",
    "2026-09-04": "Krishna Jayanthi",
    "2026-09-14": "Vinayakar Chathurthi",
    "2026-10-02": "Gandhi Jayanthi",
    "2026-10-19": "Ayutha Pooja",
    "2026-10-20": "Vijaya Dasami",
    "2026-11-08": "Deepavali",
  };

  const days: Array<{
    date: Date;
    dayOrder: number | null;
    label: string | null;
    isHoliday: boolean;
  }> = [];

  let cycle = 1; // next day order to hand out

  for (
    let cursor = new Date(TERM_START);
    cursor <= TERM_END;
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  ) {
    const date = new Date(cursor);
    const key = date.toISOString().slice(0, 10);
    const weekday = date.getUTCDay(); // 0 Sun, 6 Sat

    const isWeekend = weekday === 0 || weekday === 6;
    const holidayName = HOLIDAYS[key];

    if (isWeekend || holidayName) {
      // Only named holidays get a label. Tagging a Saturday "Saturday" makes
      // the UI read "Saturday · Saturday", and the weekday is already shown.
      days.push({ date, dayOrder: null, label: holidayName ?? null, isHoliday: true });
      continue; // the cycle does not advance
    }

    days.push({ date, dayOrder: cycle, label: null, isHoliday: false });
    cycle = cycle === 5 ? 1 : cycle + 1;
  }

  await prisma.academicDay.deleteMany({
    where: { date: { gte: TERM_START, lte: TERM_END } },
  });
  await prisma.academicDay.createMany({ data: days });

  const working = days.filter((d) => !d.isHoliday).length;
  console.log(
    `  calendar: ${days.length} days, ${working} working, ${days.length - working} holidays`
  );
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
