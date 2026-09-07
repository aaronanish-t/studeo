/**
 * End-to-end smoke test for /api/ingest.
 *
 * The extension is the one path in this project that can't be exercised from a
 * test suite — it needs a real browser, signed into two real portals. This
 * script stands in for it: it posts the same payload shape, built from the HTML
 * actually captured from those portals, at a running dev server.
 *
 * That covers everything downstream of the browser — routing, validation,
 * every parser, the upserts, timetable derivation from slots, and the claim
 * token — leaving only the extension's own fetching untested.
 *
 *   npm run smoke:ingest          post, verify, then remove the test account
 *   npm run smoke:ingest -- --keep   leave the account behind to click around
 *
 * It writes a REAL user row (whoever the profile fixture names) and, unless
 * --keep is passed, deletes it again. It also writes campus-wide calendar rows,
 * so re-run `npm run db:seed` afterwards to restore the demo calendar.
 */

import "../lib/env";

import { prisma } from "../lib/db";
import { COURSE_TABLE_HTML, STUDENT_PROFILE_HTML } from "../lib/sources/fixtures/academia";
import {
  ATTENDANCE_PAGE_HTML,
  CALENDAR_HTML,
  MARKS_DETAIL_HTML,
  MARKS_SUMMARY_HTML,
} from "../lib/sources/fixtures/student-portal";

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const KEEP = process.argv.includes("--keep");

const ok = (label: string, value: unknown) => console.log(`  ✓ ${label}`, value ?? "");
const bad = (label: string, value: unknown) => console.log(`  ✗ ${label}`, value ?? "");

async function main() {
  console.log(`Posting a full payload to ${BASE}/api/ingest …\n`);

  const response = await fetch(`${BASE}/api/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      profileHtml: STUDENT_PROFILE_HTML,
      attendanceHtml: ATTENDANCE_PAGE_HTML,
      marksHtml: MARKS_SUMMARY_HTML,
      // One course with its component breakdown, one without — so the run
      // exercises both branches: real components, and the placeholder total.
      marksDetail: [{ courseCode: "21CSS201T", html: MARKS_DETAIL_HTML }],
      calendarHtml: CALENDAR_HTML,
      coursesHtml: COURSE_TABLE_HTML,
    }),
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    bad(`HTTP ${response.status}`, result.error);
    process.exitCode = 1;
    return;
  }

  ok("HTTP 200, identified as", result.netId);
  console.log("  wrote:", result.wrote);
  ok("claim URL issued", result.claimUrl ? "yes" : "NO");

  // --- verify what actually landed in the database ------------------------
  console.log("\nChecking the database …");

  const user = await prisma.user.findUnique({
    where: { netId: result.netId },
    include: {
      courses: { include: { attendance: true, marks: true } },
      timetable: true,
    },
  });

  if (!user) {
    bad("user row", "missing");
    process.exitCode = 1;
    return;
  }

  ok("user", `${user.name} (${user.regNo})`);
  ok("overall attendance", `${user.attendanceOverall}%`);
  ok("courses", user.courses.length);

  const withAttendance = user.courses.filter((c) => c.attendance);
  ok("courses with attendance", withAttendance.length);

  const withMarks = user.courses.filter((c) => c.marks.length > 0);
  ok("courses with marks", withMarks.length);

  // The course we sent a breakdown for must hold the real component, and must
  // NOT still hold the placeholder total alongside it.
  const detailed = withMarks.find((c) => c.code === "21CSS201T");
  const codes = detailed?.marks.map((m) => m.testCode) ?? [];
  (codes.includes("FT-I") && !codes.includes("TOTAL") ? ok : bad)(
    "21CSS201T stores components, not the placeholder",
    codes.join(", ")
  );

  // The course we sent no breakdown for keeps its total.
  const summaryOnly = withMarks.find((c) => c.code === "21MAB201T");
  const summaryCodes = summaryOnly?.marks.map((m) => m.testCode) ?? [];
  (summaryCodes.includes("TOTAL") ? ok : bad)(
    "21MAB201T falls back to the summary total",
    summaryCodes.join(", ")
  );

  // The whole reason Academia is in the payload: slots become a real week.
  ok("timetable slots", user.timetable.length);

  const dayOne = user.timetable.filter((slot) => slot.dayOrder === 1);
  const expectedDayOne = 8;
  (dayOne.length === expectedDayOne ? ok : bad)(
    `Day 1 teaching hours (expected ${expectedDayOne})`,
    dayOne.length
  );

  // Spot-check the number a student would verify by hand against their portal.
  const dsa = withAttendance.find((c) => c.code === "21CSC201J");
  (dsa?.attendance?.percentage === 81.25 ? ok : bad)(
    "21CSC201J attendance matches the portal (81.25%)",
    dsa?.attendance?.percentage
  );

  // --- clean up -----------------------------------------------------------
  if (KEEP) {
    console.log(`\nLeaving ${result.netId} in place (--keep).`);
    console.log(`Open ${result.claimUrl} to sign in as them.`);
  } else {
    await prisma.user.delete({ where: { id: user.id } });
    console.log(`\nRemoved the test account. Re-run \`npm run db:seed\` to`);
    console.log(`restore the demo calendar, which this overwrote.`);
  }
}

main()
  .catch((error) => {
    console.error("\nSmoke test failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
