import { notFound } from "next/navigation";

import { FriendsView } from "@/components/friends-view";
import { getFriendsData } from "@/lib/friends";

export const metadata = { title: "Friends" };
export const dynamic = "force-dynamic";

/** The seeded sample account. Internal name; nothing user-facing says "demo". */
const SAMPLE_NET_ID = "am7301";

export default async function PreviewFriendsPage() {
  const data = await getFriendsData(SAMPLE_NET_ID);
  if (!data) notFound();

  return (
    <FriendsView
      data={data}
      basePath="/preview"
      // Read-only on purpose: the preview is a shared account, and a visitor
      // removing a seeded friendship would break it for everyone after them.
      interactive={false}
      footnote="Sample data · not a real student"
    />
  );
}
