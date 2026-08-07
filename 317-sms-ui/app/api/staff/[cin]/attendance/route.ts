import { NextRequest } from "next/server";
import { proxyToApi } from "@/lib/api-proxy";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ cin: string }> }) {
  const { cin } = await params;
  return proxyToApi(`/staff/${cin}/attendance`);
}
