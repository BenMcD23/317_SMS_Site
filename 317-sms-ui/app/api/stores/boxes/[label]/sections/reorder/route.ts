import { NextRequest } from "next/server";
import { proxyToApi } from "@/lib/api-proxy";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ label: string }> }) {
  const { label } = await params;
  return proxyToApi(`/stores/boxes/${label}/sections/reorder`, { method: "PATCH", body: await req.json() });
}
