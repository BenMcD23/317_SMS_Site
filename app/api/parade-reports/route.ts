import { NextRequest } from "next/server";
import { proxyToApi } from "@/lib/api-proxy";

export async function GET() {
  return proxyToApi("/parade-reports");
}

export async function POST(req: NextRequest) {
  return proxyToApi("/parade-reports", { method: "POST", body: await req.json() });
}
