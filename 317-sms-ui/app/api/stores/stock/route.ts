import { NextRequest } from "next/server";
import { proxyToApi } from "@/lib/api-proxy";

export async function GET() {
  return proxyToApi("/stores/stock");
}

export async function POST(req: NextRequest) {
  return proxyToApi("/stores/stock", { method: "POST", body: await req.json() });
}
