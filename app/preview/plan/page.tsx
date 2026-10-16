import { notFound } from "next/navigation";

import { PlanView } from "@/components/plan-view";
import { getPlanData } from "@/lib/plan";

export const metadata = { title: "Plan" };
export const dynamic = "force-dynamic";

/** The seeded sample account. Internal name; nothing user-facing says "demo". */
const SAMPLE_NET_ID = "am7301";

export default async function PreviewPlanPage() {
  const data = await getPlanData(SAMPLE_NET_ID);
  if (!data) notFound();

  // Interactive in the preview too: the planner changes nothing on the server,
  // so a visitor dragging sliders affects nobody, and this is the feature most
  // worth letting someone try before signing in.
  return <PlanView data={data} basePath="/preview" footnote="Sample data · not a real student" />;
}
