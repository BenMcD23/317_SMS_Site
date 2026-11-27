import { NextRequest } from "next/server";
import { proxyToApi } from "@/lib/api-proxy";

export async function GET() {
  return proxyToApi("/parade-reports/settings");
}

export async function PUT(req: NextRequest) {
  return proxyToApi("/parade-reports/settings", { method: "PUT", body: await req.json() });
}
