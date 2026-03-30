import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";

const API_BASE = process.env.API_BASE || "http://localhost:8000";

async function getToken(): Promise<string | undefined> {
  const session = await auth();
  return (session as { id_token?: string } | null)?.id_token;
}

export async function GET() {
  const token = await getToken();
  const res = await fetch(`${API_BASE}/stores/stock`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) return NextResponse.json({ error: "Failed" }, { status: res.status });
  return NextResponse.json(await res.json());
}

export async function POST(req: NextRequest) {
  const token = await getToken();
  const body = await req.json();
  const res = await fetch(`${API_BASE}/stores/stock`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) return NextResponse.json({ error: "Failed" }, { status: res.status });
  return NextResponse.json(await res.json(), { status: 201 });
}
