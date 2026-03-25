import fs from "fs";
import path from "path";
import { StoresData } from "./stores-types";

const DATA_PATH = path.join(process.cwd(), "data", "stores.json");

export function readStores(): StoresData {
  const raw = fs.readFileSync(DATA_PATH, "utf-8");
  return JSON.parse(raw) as StoresData;
}

export function writeStores(data: StoresData): void {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), "utf-8");
}
