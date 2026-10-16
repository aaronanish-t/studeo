import { redirect } from "next/navigation";

import { FriendsView } from "@/components/friends-view";
import { getFriendsData } from "@/lib/friends";
import { currentSession } from "@/lib/session";

export const metadata = { title: "Friends" };
export const dynamic = "force-dynamic";

export default async function FriendsPage() {
  const session = await currentSession();
  if (!session) redirect("/sign-in");

  const data = await getFriendsData(session.netId);
  if (!data) redirect("/dashboard");

  return (
    <FriendsView
      data={data}
      basePath=""
      interactive
      badge={
        <span className="hidden text-xs text-text-muted sm:inline">{session.netId}</span>
      }
    />
  );
}
