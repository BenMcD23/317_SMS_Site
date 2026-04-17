import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

async function getToken(): Promise<string | undefined> {
  const session = await auth();
  return (session as { id_token?: string } | null)?.id_token;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const token = await getToken();
  const body = await req.json();
  const res = await fetch(`${API_BASE}/stores/stock/${id}`, {
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

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const token = await getToken();
  const res = await fetch(`${API_BASE}/stores/stock/${id}`, {
    method: "DELETE",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) return NextResponse.json({ error: "Failed" }, { status: res.status });
  return new NextResponse(null, { status: 204 });
}
