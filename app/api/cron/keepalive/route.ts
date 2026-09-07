import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A daily touch to stop the database going to sleep.
 *
 * Supabase pauses a free project after roughly a week of inactivity, and a
 * paused project doesn't wake on its own — someone has to press a button in the
 * dashboard. The failure mode is specific and bad for a portfolio piece: a
 * recruiter opens the link you sent three weeks ago and gets a dead demo.
 *
 * One query a day is enough to count as activity. It's scheduled by
 * vercel.json, and Vercel signs its own cron requests with CRON_SECRET, so this
 * can't be used by anyone else to keep a bill running.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;

  // Refuse rather than run unauthenticated. An open endpoint that touches the
  // database is a free denial-of-wallet for whoever finds it.
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 500 });
  }

  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }

  const started = Date.now();

  try {
    // Deliberately trivial — this is a heartbeat, not a health check. Counting
    // one indexed table proves the connection works without scanning anything.
    const users = await prisma.user.count();

    return NextResponse.json({
      ok: true,
      users,
      ms: Date.now() - started,
      at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("keepalive failed", error);
    return NextResponse.json(
      { ok: false, error: "Database unreachable." },
      { status: 503 }
    );
  }
}
