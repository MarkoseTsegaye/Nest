import { PageView } from "@/components/PageView";

export default async function PageRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PageView key={id} pageId={id} />;
}
