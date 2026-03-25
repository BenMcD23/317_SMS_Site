import { NextRequest, NextResponse } from "next/server";
import { readStores, writeStores } from "@/lib/stores-store";

export async function GET() {
  const data = readStores();
  return NextResponse.json(data.stock);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { itemType, size, box, section, quantity } = body;

  if (!itemType || !size || !box || !section || quantity === undefined) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const data = readStores();
  const newItem = {
    id: crypto.randomUUID(),
    itemType,
    size,
    box,
    section,
    quantity: Number(quantity),
  };

  data.stock.push(newItem);
  writeStores(data);

  return NextResponse.json(newItem, { status: 201 });
}
