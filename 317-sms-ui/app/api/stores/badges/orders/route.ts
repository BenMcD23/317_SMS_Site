import { NextRequest } from "next/server";
import { proxyToApi } from "@/lib/api-proxy";

export async function GET() {
  return proxyToApi("/stores/badges/orders");
}

export async function POST(req: NextRequest) {
  return proxyToApi("/stores/badges/orders", { method: "POST", body: await req.json() });
}
