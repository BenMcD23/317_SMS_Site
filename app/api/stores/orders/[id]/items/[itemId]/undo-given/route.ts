import { proxyToApi } from "@/lib/api-proxy";

export async function POST(req: Request, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { id, itemId } = await params;
  return proxyToApi(`/stores/orders/${id}/items/${itemId}/undo-given`, {
    method: "POST",
    body: await req.json().catch(() => ({})),
  });
}
