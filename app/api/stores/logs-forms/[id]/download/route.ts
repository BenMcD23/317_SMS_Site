import { proxyToApiRaw } from "@/lib/api-proxy";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return proxyToApiRaw(`/stores/logs-forms/${id}/download`);
}
