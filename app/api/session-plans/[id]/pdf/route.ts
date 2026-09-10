import { NextRequest } from "next/server";
import { proxyToApiRaw } from "@/lib/api-proxy";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyToApiRaw(`/session-plans/${id}/pdf`);
}
