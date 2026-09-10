import { proxyToApi } from "@/lib/api-proxy";

export async function DELETE(_req: Request, { params }: { params: Promise<{ col: string }> }) {
  const { col } = await params;
  return proxyToApi(`/stores/badges/cols/${col}`, { method: "DELETE" });
}
