import { proxyToApi } from "@/lib/api-proxy";

export async function GET(_req: Request, { params }: { params: Promise<{ cin: string }> }) {
  const { cin } = await params;
  return proxyToApi(`/stores/issuances/${cin}/history`);
}
