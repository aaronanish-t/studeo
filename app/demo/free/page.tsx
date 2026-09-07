import { notFound } from "next/navigation";

import { FreeHoursView } from "@/components/free-hours-view";
import { getGroupDay } from "@/lib/group";

export const metadata = { title: "Free hours" };
export const dynamic = "force-dynamic";

const DEMO_NET_ID = "demo01";

export default async function DemoFreeHoursPage({
  searchParams,
}: {
  searchParams: Promise<{ day?: string }>;
}) {
  const params = await searchParams;
  const requested = Number(params.day);
  const dayOrder = requested >= 1 && requested <= 5 ? requested : 1;

  const group = await getGroupDay(DEMO_NET_ID, dayOrder);
  if (!group) notFound();

  return (
    <FreeHoursView
      group={group}
      dayOrder={dayOrder}
      basePath="/demo"
      badge={
        <span className="hidden rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-text-muted sm:inline">
          Demo data
        </span>
      }
    />
  );
}
