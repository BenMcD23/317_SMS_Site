import { NextRequest } from "next/server";
import { proxyToApi } from "@/lib/api-proxy";

export async function GET(req: NextRequest, { params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  // A night is (date, register type) — the same date can hold more than one
  // register, so the type has to reach the backend.
  const registerType = req.nextUrl.searchParams.get("registerType");
  const query = registerType ? `?registerType=${encodeURIComponent(registerType)}` : "";
  return proxyToApi(`/attendance/nights/${date}${query}`);
}
