import { notFound } from "next/navigation";

import { MarksView } from "@/components/marks-view";
import { getMarks } from "@/lib/marks";

export const metadata = { title: "Marks" };
export const dynamic = "force-dynamic";

const DEMO_NET_ID = "demo01";

export default async function DemoMarksPage() {
  const marks = await getMarks(DEMO_NET_ID);
  if (!marks) notFound();

  return (
    <MarksView
      marks={marks}
      basePath="/demo"
      badge={
        <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-text-muted">
          Demo data
        </span>
      }
    />
  );
}
