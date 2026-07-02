import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

async function getToken(): Promise<string | undefined> {
  const session = await auth();
  return (session as { id_token?: string } | null)?.id_token;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const token = await getToken();
  const res = await fetch(`${API_BASE}/stores/logs-forms/${id}/download`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) return NextResponse.json({ error: "Failed" }, { status: res.status });
  return new NextResponse(res.body, {
    headers: {
      "Content-Type":
        res.headers.get("Content-Type") ??
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":
        res.headers.get("Content-Disposition") ?? "attachment",
    },
  });
}
