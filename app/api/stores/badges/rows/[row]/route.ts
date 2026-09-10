import { proxyToApi } from "@/lib/api-proxy";

export async function DELETE(_req: Request, { params }: { params: Promise<{ row: string }> }) {
  const { row } = await params;
  return proxyToApi(`/stores/badges/rows/${row}`, { method: "DELETE" });
}
