import { NextRequest } from "next/server";
import { proxyToApi } from "@/lib/api-proxy";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ cin: string }> }) {
  const { cin } = await params;
  return proxyToApi(`/stores/issuances/${cin}`);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ cin: string }> }) {
  const { cin } = await params;
  return proxyToApi(`/stores/issuances/${cin}`, { method: "POST", body: await req.json() });
}
