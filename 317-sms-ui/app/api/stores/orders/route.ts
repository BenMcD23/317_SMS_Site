import { NextRequest, NextResponse } from "next/server";
import { readStores, writeStores } from "@/lib/stores-store";

export async function GET() {
  const data = readStores();
  return NextResponse.json(data.orders);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { cadetName, items } = body;

  if (!cadetName || !Array.isArray(items)) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const data = readStores();
  const newOrder = {
    id: crypto.randomUUID(),
    cadetName,
    timestamp: new Date().toISOString(),
    items: items.map((item: { itemType: string; size: string; needSizing?: boolean }) => ({
      id: crypto.randomUUID(),
      itemType: item.itemType,
      size: item.size ?? "",
      needSizing: !!item.needSizing,
    })),
  };

  data.orders.push(newOrder);
  writeStores(data);

  return NextResponse.json(newOrder, { status: 201 });
}
