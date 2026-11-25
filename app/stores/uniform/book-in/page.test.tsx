// @vitest-environment jsdom
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import BookInPage from "@/app/stores/uniform/book-in/page";
import { canAccess } from "@/lib/access";
import { API_BASE } from "@/lib/config";
import type { NsnLookup } from "@/lib/stores-scan";
import type { ShelfStructure, StockItem } from "@/lib/stores-types";
import { renderWithQuery } from "@/tests/render-with-query";

// One stable object, like the real hook — pages key effects on `session`.
const SESSION = {
  data: { id_token: "tok", role: "staff", user: { email: "staff@317atc.co.uk" } },
  status: "authenticated",
  update: () => Promise.resolve(null),
};
vi.mock("next-auth/react", () => ({ useSession: () => SESSION, signIn: vi.fn(), signOut: vi.fn() }));

vi.mock("@/lib/reference", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/reference")>();
  return {
    ...real,
    useReference: () => ({
      loaded: true,
      stockItemTypes: ["Beret", "Tie", "Working Blue Female"],
      noSizeItems: new Set(["Tie"]),
      sizes: { Beret: ["55", "56"], "Working Blue Female": ["95/36", "110/40"] },
    }),
  };
});

// The camera is its own component with its own tests; here it's a stand-in
// whose buttons "see" codes, so the page's handling of each one is what's tested.
vi.mock("@/components/barcode-scanner", () => ({
  BarcodeScanner: ({ onDetected, onClose }: { onDetected: (c: string) => void; onClose: () => void }) => (
    <div>
      <button onClick={() => onDetected("8405998456634")}>See the shirt barcode</button>
      <button onClick={() => onDetected("1")}>See the quantity barcode</button>
      <button onClick={() => onDetected("EACH")}>See the unit barcode</button>
      <button onClick={onClose}>Stop scanning</button>
    </div>
  ),
}));

const SHIRT: NsnLookup = {
  nsn: "8405998456634",
  formatted: "8405-99-845-6634",
  description: "Shirt Long Sleeve Mid Blue Male Size 110/40",
  itemType: "Working Blue Male",
  size: "110/40",
  source: "logs_form",
  addedBy: null,
};
const GLOVES: NsnLookup = {
  ...SHIRT,
  nsn: "8415991234567",
  formatted: "8415-99-123-4567",
  description: "Gloves Men’s Tri-Service Black Size 8",
  itemType: null,
  size: null,
};

const STRUCTURE: ShelfStructure = {
  boxes: ["A", "B"].map((label, i) => ({
    label,
    shelfLevel: 1,
    shelfPosition: i,
    boxWidth: 100,
    topEnd: "left",
    sections: ["1", "2"].map((s, j) => ({ label: s, position: j, row: 0, sectionWidth: 100 })),
  })),
};

function line(over: Partial<StockItem>): StockItem {
  return {
    id: "1",
    itemType: "Beret",
    size: "56",
    box: "A",
    section: "1",
    quantity: 1,
    gender: "unisex",
    ...over,
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

type Call = { url: string; method: string; body: Record<string, unknown> | null };

/**
 * A fake API holding the shelf: GET stock and structure, look numbers up,
 * teach them, and book in (counting up and down like the real one).
 */
function api({
  stock = [] as StockItem[],
  structure = STRUCTURE,
  known = { [SHIRT.nsn]: SHIRT, [GLOVES.nsn]: GLOVES } as Record<string, NsnLookup>,
  labelReading = false,
  lookupStatus = 200,
  bookInError = null as { status: number; detail: string } | null,
  stockStatus = 200,
} = {}) {
  const lines = [...stock];
  const calls: Call[] = [];
  const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const body = typeof init.body === "string" ? JSON.parse(init.body) : null;
    calls.push({ url, method, body });
    if (url === "/api/stores/stock")
      return stockStatus === 200 ? json(lines) : json({ detail: "down" }, stockStatus);
    if (url === "/api/stores/structure") return json(structure);
    if (url === `${API_BASE}/stores/nsns`) return json({ labelReading, added: [] });
    const nsn = url.match(/\/stores\/nsns\/(\d+)$/)?.[1];
    if (nsn && method === "GET") {
      if (lookupStatus !== 200) return json({ detail: "Database is down" }, lookupStatus);
      return known[nsn] ? json(known[nsn]) : json({ detail: "isn't a stock number we know yet" }, 404);
    }
    if (nsn && method === "PUT") {
      known[nsn] = {
        ...SHIRT,
        nsn,
        formatted: nsn,
        itemType: body.itemType,
        size: body.size,
        source: "added",
      };
      return json(known[nsn]);
    }
    if (url === `${API_BASE}/stores/stock/book-in`) {
      if (bookInError) return json({ detail: bookInError.detail }, bookInError.status);
      const item = body.nsn ? known[body.nsn] : { itemType: body.itemType, size: body.size };
      let found = lines.find(
        (l) =>
          l.itemType === item.itemType &&
          l.size === item.size &&
          l.box === body.box &&
          l.section === body.section
      );
      if (!found) {
        found = line({
          id: String(lines.length + 10),
          itemType: item.itemType,
          size: item.size,
          box: body.box,
          section: body.section,
          quantity: 0,
        });
        lines.push(found);
      }
      found.quantity += body.quantity ?? 1;
      return json({ item: { ...found }, lookup: body.nsn ? known[body.nsn] : null });
    }
    return json({ detail: "not found" }, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, lines, bookings: () => calls.filter((c) => c.url.endsWith("/stores/stock/book-in")) };
}

async function renderPage() {
  const user = userEvent.setup();
  renderWithQuery(<BookInPage />);
  await screen.findByRole("heading", { name: "Where it goes" });
  return user;
}

async function typeNumber(user: ReturnType<typeof userEvent.setup>, value: string) {
  await user.type(screen.getByLabelText("Or type the stock number"), value);
  await user.click(screen.getByRole("button", { name: "Book in" }));
}

const bookedList = () => screen.getByRole("list");

/** Waits for the line under the scan controls that says what just happened. */
const statusSays = (text: string | RegExp) =>
  waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(text));

beforeEach(() => {
  vi.stubGlobal("navigator", { ...navigator, vibrate: vi.fn() });
});

describe("Book in page", () => {
  it("is staff only, and in the sidebar under Stores", () => {
    expect(canAccess("staff", "/stores/uniform/book-in")).toBe(true);
    expect(canAccess("snco", "/stores/uniform/book-in")).toBe(false);
    expect(canAccess("nco", "/stores/uniform/book-in")).toBe(false);
  });

  it("a typed stock number books the item in to the box chosen", async () => {
    const fake = api();
    const user = await renderPage();
    await typeNumber(user, "8405-99-845-6634");

    await screen.findByText("Booked in Working Blue Male 110/40 to A / 1. 1 there now.");
    expect(fake.bookings().map((c) => c.body)).toEqual([{ nsn: "8405998456634", box: "A", section: "1" }]);
    expect(within(bookedList()).getByText("Working Blue Male 110/40")).toBeInTheDocument();
    expect(screen.getByText("1 item this visit")).toBeInTheDocument();
    // The box is cleared for the next scan.
    expect(screen.getByLabelText("Or type the stock number")).toHaveValue("");
  });

  it("puts an item where that size already lives, not in the box chosen", async () => {
    const fake = api({
      stock: [line({ itemType: "Working Blue Male", size: "110/40", box: "B", section: "2", quantity: 4 })],
    });
    const user = await renderPage();
    await typeNumber(user, "8405998456634");
    await screen.findByText("Booked in Working Blue Male 110/40 to B / 2. 5 there now.");
    expect(fake.bookings()[0].body).toMatchObject({ box: "B", section: "2" });
  });

  it("with matching off, everything goes in the box chosen", async () => {
    const fake = api({
      stock: [line({ itemType: "Working Blue Male", size: "110/40", box: "B", section: "2" })],
    });
    const user = await renderPage();
    await user.click(screen.getByRole("switch", { name: "Put each item with the same item" }));
    await typeNumber(user, "8405998456634");
    await screen.findByText(/Booked in Working Blue Male 110\/40 to A \/ 1/);
    expect(fake.bookings()[0].body).toMatchObject({ box: "A", section: "1" });
  });

  it("remembers the box chosen on this device for next time", async () => {
    api();
    const user = await renderPage();
    await user.click(screen.getByRole("switch", { name: "Put each item with the same item" }));
    expect(JSON.parse(localStorage.getItem("sms:book-in-place") ?? "null")).toEqual({
      box: "A",
      section: "1",
      matchShelf: false,
    });
  });

  it("the camera books in the stock number and ignores the bag's other barcodes", async () => {
    const fake = api();
    const user = await renderPage();
    await user.click(screen.getByRole("button", { name: "Scan barcodes" }));
    await user.click(screen.getByRole("button", { name: "See the quantity barcode" }));
    await user.click(screen.getByRole("button", { name: "See the unit barcode" }));
    await user.click(screen.getByRole("button", { name: "See the shirt barcode" }));
    await screen.findByText(/Booked in Working Blue Male 110\/40/);
    expect(fake.calls.filter((c) => /\/stores\/nsns\/\d/.test(c.url)).map((c) => c.url)).toEqual([
      `${API_BASE}/stores/nsns/8405998456634`,
    ]);
  });

  it("one bag held in front of the camera is one booking, not one per frame", async () => {
    const fake = api();
    const user = await renderPage();
    await user.click(screen.getByRole("button", { name: "Scan barcodes" }));
    for (let i = 0; i < 5; i++)
      await user.click(screen.getByRole("button", { name: "See the shirt barcode" }));
    await screen.findByText(/Booked in Working Blue Male 110\/40/);
    expect(fake.bookings()).toHaveLength(1);
  });

  it("a bag held in view for a long time is still one booking", async () => {
    // The camera reads it five times a second the whole time it's held up.
    const now = vi.spyOn(Date, "now");
    const fake = api();
    const user = await renderPage();
    await user.click(screen.getByRole("button", { name: "Scan barcodes" }));
    for (let ms = 0; ms <= 10_000; ms += 200) {
      now.mockReturnValue(1_000_000 + ms);
      await user.click(screen.getByRole("button", { name: "See the shirt barcode" }));
    }
    await statusSays(/1 there now/);
    expect(fake.bookings()).toHaveLength(1);
  });

  it("the same barcode again after a pause is the next bag", async () => {
    const now = vi.spyOn(Date, "now");
    now.mockReturnValue(1_000_000);
    const fake = api();
    const user = await renderPage();
    await user.click(screen.getByRole("button", { name: "Scan barcodes" }));
    await user.click(screen.getByRole("button", { name: "See the shirt barcode" }));
    await statusSays(/1 there now/);
    now.mockReturnValue(1_004_000);
    await user.click(screen.getByRole("button", { name: "See the shirt barcode" }));
    await statusSays(/2 there now/);
    expect(fake.bookings()).toHaveLength(2);
  });

  it("an unknown number asks what it is, remembers it, then books it in", async () => {
    const fake = api();
    const user = await renderPage();
    await typeNumber(user, "8410998696671");

    const dialog = await screen.findByRole("dialog", { name: "What is 8410-99-869-6671?" });
    expect(fake.bookings()).toHaveLength(0);
    const save = within(dialog).getByRole("button", { name: "Save and book in" });
    expect(save).toBeDisabled();
    await user.click(within(dialog).getByRole("combobox", { name: "Item" }));
    await user.click(await screen.findByRole("option", { name: "Working Blue Female" }));
    await user.click(within(dialog).getByRole("combobox", { name: "Size" }));
    await user.click(await screen.findByRole("option", { name: "95/36" }));
    await user.click(save);

    await screen.findByText(/Booked in Working Blue Female 95\/36/);
    const teach = fake.calls.find((c) => c.method === "PUT");
    expect(teach).toMatchObject({
      url: `${API_BASE}/stores/nsns/8410998696671`,
      body: { itemType: "Working Blue Female", size: "95/36" },
    });
    // Booked in by its number, so the stock history says it was scanned.
    expect(fake.bookings()[0].body).toMatchObject({ nsn: "8410998696671" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("an unsized item is taught without asking for a size", async () => {
    const fake = api();
    const user = await renderPage();
    await typeNumber(user, "8410998696671");
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("combobox", { name: "Item" }));
    await user.click(await screen.findByRole("option", { name: "Tie" }));
    expect(within(dialog).queryByRole("combobox", { name: "Size" })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Save and book in" }));
    await screen.findByText("Booked in Tie to A / 1. 1 there now.");
    expect(fake.calls.find((c) => c.method === "PUT")?.body).toEqual({ itemType: "Tie", size: "N/A" });
  });

  it("cancelling the question books nothing in", async () => {
    const fake = api();
    const user = await renderPage();
    await typeNumber(user, "8410998696671");
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(fake.bookings()).toHaveLength(0);
    expect(fake.calls.some((c) => c.method === "PUT")).toBe(false);
  });

  it("a teach the API refuses keeps the dialog open with its reason", async () => {
    const fake = api();
    fake.calls.length = 0;
    const user = await renderPage();
    vi.mocked(fetch).mockImplementationOnce(async () => json({ detail: "not found" }, 404));
    await typeNumber(user, "8410998696671");
    const dialog = await screen.findByRole("dialog");
    vi.mocked(fetch).mockImplementationOnce(async () =>
      json({ detail: "Choose one of the Beret sizes" }, 400)
    );
    await user.click(within(dialog).getByRole("combobox", { name: "Item" }));
    await user.click(await screen.findByRole("option", { name: "Beret" }));
    await user.click(within(dialog).getByRole("combobox", { name: "Size" }));
    await user.click(await screen.findByRole("option", { name: "56" }));
    await user.click(within(dialog).getByRole("button", { name: "Save and book in" }));
    expect(await within(dialog).findByText("Choose one of the Beret sizes")).toBeInTheDocument();
    expect(fake.bookings()).toHaveLength(0);
  });

  it("a form line the stores don't keep says so by name", async () => {
    const fake = api();
    const user = await renderPage();
    await typeNumber(user, "8415991234567");
    expect(
      await screen.findByText(
        "8415-99-123-4567 is Gloves Men’s Tri-Service Black Size 8, which the stores don't keep."
      )
    ).toBeInTheDocument();
    expect(fake.bookings()).toHaveLength(0);
  });

  it("a failed lookup is an error, not a question about an unknown number", async () => {
    const fake = api({ lookupStatus: 500 });
    const user = await renderPage();
    await typeNumber(user, "8405998456634");
    expect(await screen.findByText("Database is down")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(fake.bookings()).toHaveLength(0);
  });

  it("a booking the API refuses shows its reason and lists nothing", async () => {
    api({ bookInError: { status: 404, detail: "Box not found" } });
    const user = await renderPage();
    await typeNumber(user, "8405998456634");
    expect(await screen.findByText("Box not found")).toBeInTheDocument();
    expect(screen.getByText("Nothing booked in yet")).toBeInTheDocument();
  });

  it("something that isn't a stock number is caught before asking the API", async () => {
    const fake = api();
    const user = await renderPage();
    await typeNumber(user, "12345");
    expect(screen.getByText("A stock number is 13 digits, like 8405-99-845-6634.")).toBeInTheDocument();
    expect(fake.calls.some((c) => /\/stores\/nsns\/\d/.test(c.url))).toBe(false);
  });

  it("undo takes the item back off and marks it undone", async () => {
    const fake = api();
    const user = await renderPage();
    await typeNumber(user, "8405998456634");
    await statusSays(/1 there now/);
    await user.click(within(bookedList()).getByRole("button", { name: "Undo" }));

    await screen.findByText("Took Working Blue Male 110/40 back off A / 1.");
    expect(fake.bookings()[1].body).toEqual({ nsn: "8405998456634", box: "A", section: "1", quantity: -1 });
    expect(within(bookedList()).getByText(/undone/)).toBeInTheDocument();
    expect(within(bookedList()).queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
    expect(screen.getByText("0 items this visit")).toBeInTheDocument();
  });

  it("an undo the API refuses (the item's since gone) says why and stays undoable", async () => {
    api();
    const user = await renderPage();
    await typeNumber(user, "8405998456634");
    await statusSays(/1 there now/);
    vi.mocked(fetch).mockImplementationOnce(async () =>
      json({ detail: "There aren't that many on the shelf to take back off" }, 409)
    );
    await user.click(within(bookedList()).getByRole("button", { name: "Undo" }));
    expect(
      await screen.findByText("There aren't that many on the shelf to take back off")
    ).toBeInTheDocument();
    expect(within(bookedList()).getByRole("button", { name: "Undo" })).toBeInTheDocument();
  });

  it("an item chosen by hand books in by item and size", async () => {
    const fake = api();
    const user = await renderPage();
    await user.click(screen.getByRole("button", { name: "Choose the item" }));
    const dialog = await screen.findByRole("dialog", { name: "Choose the item" });
    await user.click(within(dialog).getByRole("combobox", { name: "Item" }));
    await user.click(await screen.findByRole("option", { name: "Beret" }));
    await user.click(within(dialog).getByRole("combobox", { name: "Size" }));
    await user.click(await screen.findByRole("option", { name: "55" }));
    await user.click(within(dialog).getByRole("button", { name: "Book in" }));
    await screen.findByText(/Booked in Beret 55/);
    expect(fake.bookings()[0].body).toEqual({ itemType: "Beret", size: "55", box: "A", section: "1" });
    expect(fake.calls.some((c) => c.method === "PUT")).toBe(false);
  });

  describe("label photos", () => {
    function photoFetch(read: unknown, status = 200) {
      const real = vi.mocked(fetch).getMockImplementation()!;
      vi.mocked(fetch).mockImplementation(async (url, init) =>
        url === `${API_BASE}/stores/nsns/read-label` ? json(read, status) : real(url, init)
      );
    }

    beforeEach(() => {
      // jsdom can't decode images: the photo goes up as it was taken.
      vi.stubGlobal(
        "createImageBitmap",
        vi.fn(async () => Promise.reject(new Error("no decoder")))
      );
    });

    it("isn't offered when the API can't read labels", async () => {
      api({ labelReading: false });
      await renderPage();
      expect(screen.queryByRole("button", { name: "Photo of the label" })).not.toBeInTheDocument();
    });

    it("reads the number off the label and books it in", async () => {
      const fake = api({ labelReading: true });
      photoFetch({ read: { nsn: "8405998456634", size: "110/40", description: null }, match: SHIRT });
      const user = await renderPage();
      await screen.findByRole("button", { name: "Photo of the label" });
      await user.upload(
        screen.getByLabelText("Photo of the label", { selector: "input" }),
        new File(["jpeg"], "label.jpg", { type: "image/jpeg" })
      );
      await screen.findByText(/Booked in Working Blue Male 110\/40/);
      expect(fake.bookings()[0].body).toMatchObject({ nsn: "8405998456634" });
    });

    it("an unknown label asks what it is, with the size it read already chosen", async () => {
      api({ labelReading: true });
      photoFetch({ read: { nsn: "8410998696671", size: "110/40(16)", description: null }, match: null });
      const user = await renderPage();
      await screen.findByRole("button", { name: "Photo of the label" });
      await user.upload(
        screen.getByLabelText("Photo of the label", { selector: "input" }),
        new File(["jpeg"], "label.jpg", { type: "image/jpeg" })
      );
      const dialog = await screen.findByRole("dialog", { name: "What is 8410-99-869-6671?" });
      expect(within(dialog).getByText(/The label says size 110\/40\(16\)/)).toBeInTheDocument();
      await user.click(within(dialog).getByRole("combobox", { name: "Item" }));
      await user.click(await screen.findByRole("option", { name: "Working Blue Female" }));
      expect(within(dialog).getByRole("combobox", { name: "Size" })).toHaveTextContent("110/40");
    });

    it("a label it couldn't make out says what to do instead", async () => {
      const fake = api({ labelReading: true });
      photoFetch({ read: { nsn: null, size: null, description: null }, match: null });
      const user = await renderPage();
      await screen.findByRole("button", { name: "Photo of the label" });
      await user.upload(
        screen.getByLabelText("Photo of the label", { selector: "input" }),
        new File(["jpeg"], "label.jpg", { type: "image/jpeg" })
      );
      expect(
        await screen.findByText("Couldn't make out the stock number. Try again closer, or choose the item.")
      ).toBeInTheDocument();
      expect(fake.bookings()).toHaveLength(0);
    });

    it("a read the API couldn't do shows its message", async () => {
      api({ labelReading: true });
      photoFetch({ detail: "Couldn't read the label. Type the stock number, or choose the item" }, 502);
      const user = await renderPage();
      await screen.findByRole("button", { name: "Photo of the label" });
      await user.upload(
        screen.getByLabelText("Photo of the label", { selector: "input" }),
        new File(["jpeg"], "label.jpg", { type: "image/jpeg" })
      );
      expect(
        await screen.findByText("Couldn't read the label. Type the stock number, or choose the item")
      ).toBeInTheDocument();
    });
  });

  it("with no boxes yet, points to the Stock page instead of offering to scan", async () => {
    api({ structure: { boxes: [] } });
    renderWithQuery(<BookInPage />);
    expect(await screen.findByText("No boxes yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to Stock" })).toHaveAttribute(
      "href",
      "/stores/uniform/stock"
    );
    expect(screen.queryByRole("button", { name: "Scan barcodes" })).not.toBeInTheDocument();
  });

  it("a stock list that won't load is an error, not an empty shelf", async () => {
    api({ stockStatus: 500 });
    renderWithQuery(<BookInPage />);
    expect(await screen.findByText("down")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Scan barcodes" })).not.toBeInTheDocument();
  });

  it("scans are booked in one at a time, in order", async () => {
    // Two quick scans of different numbers must not race each other.
    const fake = api({
      known: {
        [SHIRT.nsn]: SHIRT,
        "8405991278130": { ...SHIRT, nsn: "8405991278130", itemType: "Beret", size: "56" },
      },
    });
    const user = await renderPage();
    await act(async () => {
      await typeNumber(user, "8405998456634");
      await typeNumber(user, "8405991278130");
    });
    await waitFor(() => expect(fake.bookings()).toHaveLength(2));
    expect(fake.bookings().map((c) => c.body?.nsn)).toEqual(["8405998456634", "8405991278130"]);
  });
});
