import { NextRequest } from "next/server";
import { proxyToApi } from "@/lib/api-proxy";

export async function POST(req: NextRequest, { params }: { params: Promise<{ cin: string }> }) {
  const { cin } = await params;
  return proxyToApi(`/leaving-process/${cin}/send`, { method: "POST", body: await req.json() });
}
