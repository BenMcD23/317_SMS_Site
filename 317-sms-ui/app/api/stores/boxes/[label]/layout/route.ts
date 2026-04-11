import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";

const API_BASE = process.env.API_BASE || "http://localhost:8000";

async function getToken(): Promise<string | undefined> {
  const session = await auth();
  return (session as { id_token?: string } | null)?.id_token;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ label: string }> }
) {
  const { label } = await params;
  const token = await getToken();
  const body = await req.json();
  const res = await fetch(`${API_BASE}/stores/boxes/${label}/layout`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) return NextResponse.json({ error: "Failed" }, { status: res.status });
  return NextResponse.json(await res.json());
}
