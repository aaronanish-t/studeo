import { notFound } from "next/navigation";

import { MarksView } from "@/components/marks-view";
import { getMarks } from "@/lib/marks";

export const metadata = { title: "Marks" };
export const dynamic = "force-dynamic";

/** The seeded sample account. Internal name; nothing user-facing says "demo". */
const SAMPLE_NET_ID = "demo01";

export default async function PreviewMarksPage() {
  const marks = await getMarks(SAMPLE_NET_ID);
  if (!marks) notFound();

  return (
    <MarksView
      marks={marks}
      basePath="/preview"
      footnote="Sample data · not a real student"
    />
  );
}
