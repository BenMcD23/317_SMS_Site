import { proxyToApi } from "@/lib/api-proxy";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyToApi(`/stores/badges/order-lists/entries/${id}`, { method: "DELETE" });
}
