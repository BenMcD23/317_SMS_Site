import { NextRequest } from "next/server";
import { proxyToApi } from "@/lib/api-proxy";

export async function POST(req: NextRequest) {
  return proxyToApi("/parade-reports/recipients", { method: "POST", body: await req.json() });
}
