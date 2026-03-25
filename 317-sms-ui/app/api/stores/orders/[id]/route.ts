import { NextRequest, NextResponse } from "next/server";
import { readStores, writeStores } from "@/lib/stores-store";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const data = readStores();

  const idx = data.orders.findIndex((order) => order.id === id);
  if (idx === -1) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  data.orders[idx] = { ...data.orders[idx], ...body, id };
  writeStores(data);

  return NextResponse.json(data.orders[idx]);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const data = readStores();

  const idx = data.orders.findIndex((order) => order.id === id);
  if (idx === -1) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  data.orders.splice(idx, 1);
  writeStores(data);

  return new NextResponse(null, { status: 204 });
}
