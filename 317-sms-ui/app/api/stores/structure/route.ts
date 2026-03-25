import { NextResponse } from "next/server";
import { readStores, writeStores } from "@/lib/stores-store";

export async function GET() {
  const data = readStores();
  return NextResponse.json(data.structure ?? {});
}

export async function POST(request: Request) {
  const body = await request.json();
  const { action, box, section } = body as {
    action: "add-box" | "delete-box" | "add-section" | "delete-section";
    box: string;
    section?: string;
  };

  const data = readStores();
  if (!data.structure) data.structure = {};

  if (action === "add-box") {
    if (!box || data.structure[box] !== undefined) {
      return NextResponse.json({ error: "Box already exists or invalid name" }, { status: 400 });
    }
    data.structure[box] = [];
    writeStores(data);
    return NextResponse.json(data.structure);
  }

  if (action === "delete-box") {
    if (!box || data.structure[box] === undefined) {
      return NextResponse.json({ error: "Box not found" }, { status: 404 });
    }
    delete data.structure[box];
    data.stock = data.stock.filter((i) => i.box !== box);
    writeStores(data);
    return NextResponse.json(data.structure);
  }

  if (action === "add-section") {
    if (!box || !section) {
      return NextResponse.json({ error: "Box and section required" }, { status: 400 });
    }
    if (data.structure[box] === undefined) {
      return NextResponse.json({ error: "Box not found" }, { status: 404 });
    }
    if (data.structure[box].includes(section)) {
      return NextResponse.json({ error: "Section already exists" }, { status: 400 });
    }
    data.structure[box].push(section);
    writeStores(data);
    return NextResponse.json(data.structure);
  }

  if (action === "delete-section") {
    if (!box || !section || data.structure[box] === undefined) {
      return NextResponse.json({ error: "Box or section not found" }, { status: 404 });
    }
    data.structure[box] = data.structure[box].filter((s) => s !== section);
    data.stock = data.stock.filter((i) => !(i.box === box && i.section === section));
    writeStores(data);
    return NextResponse.json(data.structure);
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
