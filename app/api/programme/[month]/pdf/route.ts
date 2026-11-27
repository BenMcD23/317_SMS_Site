import { NextRequest } from "next/server";
import { proxyToApiRaw } from "@/lib/api-proxy";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ month: string }> }) {
  const { month } = await params;
  return proxyToApiRaw(`/programme-builder/months/${month}/pdf`);
}
