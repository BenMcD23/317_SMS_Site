import { NextRequest } from "next/server";
import { proxyToApi } from "@/lib/api-proxy";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyToApi(`/stores/badges/orders/${id}`, { method: "PATCH", body: await req.json() });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyToApi(`/stores/badges/orders/${id}`, { method: "DELETE" });
}
