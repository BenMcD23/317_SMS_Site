import { NextRequest } from "next/server";
import { proxyToApi } from "@/lib/api-proxy";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { id, itemId } = await params;
  return proxyToApi(`/stores/orders/${id}/items/${itemId}/stock`, { method: "POST", body: await req.json() });
}
