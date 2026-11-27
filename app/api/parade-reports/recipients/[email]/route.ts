import { NextRequest } from "next/server";
import { proxyToApi } from "@/lib/api-proxy";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ email: string }> }) {
  const { email } = await params;
  return proxyToApi(`/parade-reports/recipients/${email}`, { method: "DELETE" });
}
