import { proxyToApi } from "@/lib/api-proxy";

export async function DELETE(_req: Request, { params }: { params: Promise<{ cin: string; issuanceId: string }> }) {
  const { cin, issuanceId } = await params;
  return proxyToApi(`/stores/issuances/${issuanceId}`, { method: "DELETE" });
}
