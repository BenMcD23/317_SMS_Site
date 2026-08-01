import { proxyToApi } from "@/lib/api-proxy";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { id, itemId } = await params;
  return proxyToApi(`/stores/orders/${id}/items/${itemId}/mark-ready`, { method: "POST" });
}
