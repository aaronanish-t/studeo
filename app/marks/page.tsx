import { redirect } from "next/navigation";

import { MarksView } from "@/components/marks-view";
import { getMarks } from "@/lib/marks";
import { currentSession } from "@/lib/session";

export const metadata = { title: "Marks" };
export const dynamic = "force-dynamic";

export default async function MarksPage() {
  const session = await currentSession();
  if (!session) redirect("/connect");

  const marks = await getMarks(session.netId);
  if (!marks) redirect("/dashboard");

  return (
    <MarksView
      marks={marks}
      basePath=""
      badge={<span className="text-xs text-text-muted">{session.netId}</span>}
    />
  );
}
