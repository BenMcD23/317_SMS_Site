import { proxyToApi } from "@/lib/api-proxy";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyToApi(`/stores/badges/order-lists/${id}/mark-ordered`, { method: "POST" });
}
