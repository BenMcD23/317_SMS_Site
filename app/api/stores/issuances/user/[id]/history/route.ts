import { proxyToApi } from "@/lib/api-proxy";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyToApi(`/stores/issuances/user/${id}/history`);
}
