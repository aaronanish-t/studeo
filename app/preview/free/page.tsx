import { notFound } from "next/navigation";

import { FreeHoursView } from "@/components/free-hours-view";
import { getGroupDay } from "@/lib/group";

export const metadata = { title: "Free hours" };
export const dynamic = "force-dynamic";

/** The seeded sample account. Internal name; nothing user-facing says "demo". */
const SAMPLE_NET_ID = "demo01";

export default async function PreviewFreeHoursPage({
  searchParams,
}: {
  searchParams: Promise<{ day?: string }>;
}) {
  const params = await searchParams;
  const requested = Number(params.day);
  const dayOrder = requested >= 1 && requested <= 5 ? requested : 1;

  const group = await getGroupDay(SAMPLE_NET_ID, dayOrder);
  if (!group) notFound();

  return (
    <FreeHoursView
      group={group}
      dayOrder={dayOrder}
      basePath="/preview"
      footnote="Sample data · not a real student"
    />
  );
}
