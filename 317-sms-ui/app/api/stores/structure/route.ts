import { NextRequest } from "next/server";
import { proxyToApi } from "@/lib/api-proxy";

export async function GET() {
  return proxyToApi("/stores/structure");
}

export async function POST(req: NextRequest) {
  return proxyToApi("/stores/structure", { method: "POST", body: await req.json() });
}
