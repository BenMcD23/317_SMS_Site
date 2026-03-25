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

  const patch = { ...body };
  // Ensure any new items without an id get one assigned
  if (Array.isArray(patch.items)) {
    patch.items = patch.items.map((item: { id?: string; itemType: string; size: string; needSizing?: boolean }) => ({
      needSizing: false,
      ...item,
      id: item.id ?? crypto.randomUUID(),
    }));
  }
  data.orders[idx] = { ...data.orders[idx], ...patch, id };
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
