import { redirect } from "next/navigation";

import { FreeHoursView } from "@/components/free-hours-view";
import { getGroupDay } from "@/lib/group";
import { currentSession } from "@/lib/session";

export const metadata = { title: "Free hours" };
export const dynamic = "force-dynamic";

export default async function FreeHoursPage({
  searchParams,
}: {
  searchParams: Promise<{ day?: string }>;
}) {
  const session = await currentSession();
  if (!session) redirect("/connect");

  const params = await searchParams;
  const requested = Number(params.day);
  const dayOrder = requested >= 1 && requested <= 5 ? requested : 1;

  const group = await getGroupDay(session.netId, dayOrder);
  if (!group) redirect("/dashboard");

  return (
    <FreeHoursView
      group={group}
      dayOrder={dayOrder}
      basePath=""
      badge={<span className="hidden text-xs text-text-muted sm:inline">{session.netId}</span>}
    />
  );
}
