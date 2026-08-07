import { NextRequest } from "next/server";
import { proxyToApi } from "@/lib/api-proxy";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ cin: string }> }) {
  const { cin } = await params;
  return proxyToApi(`/leaving-process/${cin}`, { method: "DELETE" });
}
