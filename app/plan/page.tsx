import { redirect } from "next/navigation";

import { PlanView } from "@/components/plan-view";
import { getPlanData } from "@/lib/plan";
import { currentSession } from "@/lib/session";

export const metadata = { title: "Plan" };
export const dynamic = "force-dynamic";

export default async function PlanPage() {
  const session = await currentSession();
  if (!session) redirect("/sign-in");

  const data = await getPlanData(session.netId);
  if (!data) redirect("/dashboard");

  return (
    <PlanView
      data={data}
      basePath=""
      badge={
        <span className="hidden text-xs text-text-muted sm:inline">{session.netId}</span>
      }
    />
  );
}
