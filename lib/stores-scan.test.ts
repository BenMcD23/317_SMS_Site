// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));

import { API_BASE } from "@/lib/config";
import {
  bookIn,
  formatNsn,
  lookupNsn,
  normaliseNsn,
  readLabel,
  startingPlace,
  teachNsn,
  withLine,
  type NsnLookup,
} from "@/lib/stores-scan";
import type { ShelfBox, StockItem } from "@/lib/stores-types";

const SHIRT: NsnLookup = {
  nsn: "8405998456634",
  formatted: "8405-99-845-6634",
  description: "Shirt Long Sleeve Mid Blue Male Size 110/40",
  itemType: "Working Blue Male",
  size: "110/40",
  source: "logs_form",
  addedBy: null,
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("stock numbers", () => {
  it.each(["8405998456634", "8405-99-845-6634", " 8405 99 845 6634 "])(
    "reads %j as a stock number",
    (raw) => {
      expect(normaliseNsn(raw)).toBe("8405998456634");
    }
  );

  it.each(["1", "EACH", "", "84059984566341", "840599845663X"])(
    "ignores %j, like the bag's quantity and unit barcodes",
    (raw) => {
      expect(normaliseNsn(raw)).toBeNull();
    }
  );

  it("prints a number the way the label does", () => {
    expect(formatNsn("8405998456634")).toBe("8405-99-845-6634");
  });
});

describe("lookupNsn", () => {
  it("returns what the number means", async () => {
    const fetchMock = vi.fn(async () => json(SHIRT));
    vi.stubGlobal("fetch", fetchMock);
    expect(await lookupNsn("tok", "8405998456634")).toEqual(SHIRT);
    expect(fetchMock).toHaveBeenCalledWith(`${API_BASE}/stores/nsns/8405998456634`, {
      headers: { Authorization: "Bearer tok" },
    });
  });

  it("an unknown number is null, so the page can ask what it is", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ detail: "isn't a stock number we know yet" }, 404))
    );
    expect(await lookupNsn("tok", "8410998696671")).toBeNull();
  });

  it("a failed lookup is an error, never 'unknown'", async () => {
    // Treating a 500 as unknown would ask staff to teach a number the form lists.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ detail: "Database is down" }, 500))
    );
    await expect(lookupNsn("tok", "8405998456634")).rejects.toThrow("Database is down");
  });

  it("an unreachable API says so", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      })
    );
    await expect(lookupNsn("tok", "8405998456634")).rejects.toThrow("Server unreachable.");
  });
});

describe("writes", () => {
  it("teaches a number with PUT and books in with POST", async () => {
    const fetchMock = vi.fn(async () => json({ item: {}, lookup: null }));
    vi.stubGlobal("fetch", fetchMock);
    await teachNsn("tok", "8410998696671", "Working Blue Female", "95/36");
    await bookIn("tok", { nsn: "8410998696671", box: "B", section: "2" });
    const [teach, book] = fetchMock.mock.calls as unknown as [string, RequestInit][];
    expect(teach[0]).toBe(`${API_BASE}/stores/nsns/8410998696671`);
    expect(teach[1].method).toBe("PUT");
    expect(JSON.parse(teach[1].body as string)).toEqual({ itemType: "Working Blue Female", size: "95/36" });
    expect(book[0]).toBe(`${API_BASE}/stores/stock/book-in`);
    expect(JSON.parse(book[1].body as string)).toEqual({ nsn: "8410998696671", box: "B", section: "2" });
  });

  it("a refused booking rejects with the API's own message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ detail: "There aren't that many on the shelf to take back off" }, 409))
    );
    await expect(
      bookIn("tok", { nsn: "8405998456634", box: "A", section: "1", quantity: -1 })
    ).rejects.toThrow("There aren't that many on the shelf to take back off");
  });
});

describe("readLabel", () => {
  it("uploads the photo as multipart and returns what was read", async () => {
    const answer = { read: { nsn: "8405998456634", size: "110/40", description: null }, match: SHIRT };
    const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => json(answer));
    vi.stubGlobal("fetch", fetchMock);
    const result = await readLabel("tok", new Blob(["jpeg"], { type: "image/jpeg" }));
    expect(result.match).toEqual(SHIRT);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE}/stores/nsns/read-label`);
    const photo = (init.body as FormData).get("photo") as File;
    expect(photo.name).toBe("label.jpg");
    expect(photo.type).toBe("image/jpeg");
    // No Content-Type header: the browser must set the multipart boundary.
    expect(init.headers).toEqual({ Authorization: "Bearer tok" });
  });

  it("a photo that couldn't be read rejects with the API's advice", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json({ detail: "Couldn't read the label. Type the stock number, or choose the item" }, 502)
      )
    );
    await expect(readLabel("tok", new Blob(["x"], { type: "image/jpeg" }))).rejects.toThrow(
      "Couldn't read the label. Type the stock number, or choose the item"
    );
  });
});

describe("startingPlace", () => {
  const box = (label: string, sections: string[]): ShelfBox => ({
    label,
    shelfLevel: 1,
    shelfPosition: 0,
    boxWidth: 100,
    topEnd: "left",
    sections: sections.map((s, i) => ({ label: s, position: i, row: 0, sectionWidth: 100 })),
  });
  const boxes = [box("A", ["1", "2"]), box("B", ["Top", "Bottom"])];

  it("starts at the first box and section", () => {
    expect(startingPlace(boxes, null)).toEqual({ box: "A", section: "1", matchShelf: true });
  });

  it("starts where this device last booked in", () => {
    expect(startingPlace(boxes, { box: "B", section: "Bottom", matchShelf: false })).toEqual({
      box: "B",
      section: "Bottom",
      matchShelf: false,
    });
  });

  it("a remembered box that's since been deleted falls back to the first", () => {
    expect(startingPlace(boxes, { box: "Z", section: "9", matchShelf: true })).toEqual({
      box: "A",
      section: "1",
      matchShelf: true,
    });
  });

  it("a remembered section that's gone falls back to the box's first", () => {
    expect(startingPlace(boxes, { box: "B", section: "Middle", matchShelf: true }).section).toBe("Top");
  });

  it("no boxes at all is an empty place, not a crash", () => {
    expect(startingPlace([], null)).toEqual({ box: "", section: "", matchShelf: true });
  });
});

describe("withLine", () => {
  const line = (id: string, quantity: number): StockItem => ({
    id,
    itemType: "Beret",
    size: "56",
    box: "A",
    section: "1",
    quantity,
    gender: "unisex",
  });

  it("replaces a line it already has and adds a new one", () => {
    expect(withLine([line("1", 2)], line("1", 3))).toEqual([line("1", 3)]);
    expect(withLine([line("1", 2)], line("2", 1))).toEqual([line("1", 2), line("2", 1)]);
  });
});
