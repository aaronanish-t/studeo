/**
 * What has actually synced?
 *
 * A quick read of real (non-demo) accounts and the last few sync runs — the
 * fastest way to tell whether an extension sync landed, and what it wrote.
 *
 *   npm run check:sync
 */

import "../lib/env";

import { prisma } from "../lib/db";

async function main() {
  const users = await prisma.user.findMany({
    where: { isDemo: false },
    select: {
      netId: true,
      name: true,
      lastSyncedAt: true,
      attendanceOverall: true,
      _count: { select: { courses: true, timetable: true } },
    },
  });

  console.log(`Real (non-demo) accounts: ${users.length}`);
  for (const user of users) {
    console.log(
      `  ${user.netId} — ${user.name} · ${user.attendanceOverall ?? "—"}% · ` +
        `${user._count.courses} courses, ${user._count.timetable} slots · ` +
        `synced ${user.lastSyncedAt?.toISOString() ?? "never"}`
    );
  }

  const runs = await prisma.syncRun.findMany({
    orderBy: { startedAt: "desc" },
    take: 6,
    select: {
      status: true,
      startedAt: true,
      durationMs: true,
      error: true,
      wrote: true,
      user: { select: { netId: true } },
    },
  });

  console.log(`\nRecent sync runs: ${runs.length}`);
  for (const run of runs) {
    console.log(
      `  ${run.startedAt.toISOString()} ${run.user.netId} ${run.status} ` +
        `${run.durationMs ?? "-"}ms ${JSON.stringify(run.wrote ?? {})}` +
        (run.error ? ` ERROR: ${run.error}` : "")
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
