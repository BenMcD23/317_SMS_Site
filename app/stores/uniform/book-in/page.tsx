"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Camera, ListPlus, PackageOpen, ScanBarcode, Undo2 } from "lucide-react";

import { Button } from "@317/ui-common/components/ui/button";
import { Input } from "@317/ui-common/components/ui/input";
import { EmptyState } from "@317/ui-common/components/empty-state";
import { ErrorAlert } from "@317/ui-common/components/error-alert";
import { PageHeader } from "@317/ui-common/components/page-header";
import { SectionHeading } from "@317/ui-common/components/section-heading";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { BarcodeScanner } from "@/components/barcode-scanner";
import { ListSkeleton } from "@/components/list-skeleton";
import { SearchableSelect } from "@/components/searchable-select";
import {
  ItemPickerDialog,
  type PickerRequest,
} from "@/app/stores/uniform/book-in/components/item-picker-dialog";
import { suggestLocation } from "@/lib/stock-form";
import { useStoresStock } from "@/lib/stores-stock";
import {
  bookIn,
  formatNsn,
  lookupNsn,
  normaliseNsn,
  readLabel,
  shrinkPhoto,
  teachNsn,
  startingPlace,
  withLine,
  type BookInBody,
  type Place,
} from "@/lib/stores-scan";
import { useApiQuery } from "@/lib/use-api-query";

/** One booking made on this visit, newest first, so a wrong scan can be undone. */
type Booked = {
  key: number;
  itemType: string;
  size: string;
  box: string;
  section: string;
  quantityAfter: number;
  nsn: string | null;
  undone: boolean;
};

// The camera reads a bag every frame it's in view. A code counts again only
// once it's been out of view this long: a bag held up is one booking however
// long it's held, and the next of ten identical shirts counts once the one
// before has been taken away.
const OUT_OF_VIEW_MS = 1200;
const PLACE_KEY = "sms:book-in-place";

function savedPlace(): Place | null {
  try {
    const value = JSON.parse(localStorage.getItem(PLACE_KEY) ?? "null");
    return value && typeof value.box === "string" ? value : null;
  } catch {
    return null;
  }
}

function sizeText(size: string) {
  return size === "N/A" || !size ? "" : ` ${size}`;
}

/**
 * Book uniform into stock by scanning each item's stock number: the bag's
 * barcode with the camera or a handheld scanner, the number typed, or a photo
 * of the sewn-in label once it's out of the bag. Each scan books one in at
 * once (no confirm step on parade night), with an undo beside it.
 */
export default function BookInPage() {
  const { data: session } = useSession();
  const token = session?.id_token;
  const { stock, shelfStructure, loading, loadError, setStock } = useStoresStock();

  // What staff picked on this visit; until then, the place last used on this
  // device, else the first box (worked out below once the shelves load).
  const [chosen, setChosen] = useState<Place | null>(null);
  const [saved] = useState(savedPlace);
  const [scanning, setScanning] = useState(false);
  const [typed, setTyped] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [booked, setBooked] = useState<Booked[]>([]);
  const [picker, setPicker] = useState<PickerRequest | null>(null);
  // Each opening of the picker is a fresh dialog, so it starts empty.
  const [pickerKey, setPickerKey] = useState(0);
  // Whether the API can read label photos (it needs a Gemini key); a failed
  // check just hides the button, the other ways in still work.
  const nsnInfo = useApiQuery<{ labelReading: boolean }>(["stores", "nsns"], "/stores/nsns");
  const canReadLabels = nsnInfo.data?.labelReading === true;

  const photoInput = useRef<HTMLInputElement>(null);
  const lastCode = useRef<{ nsn: string; seenAt: number } | null>(null);
  // Scans are handled one at a time, in the order they were read.
  const queue = useRef<Promise<void>>(Promise.resolve());
  const nextKey = useRef(1);
  // The latest stock, for scans queued before the last booking re-rendered.
  const stockRef = useRef(stock);
  useEffect(() => {
    stockRef.current = stock;
  }, [stock]);

  const boxes = useMemo(() => shelfStructure?.boxes ?? [], [shelfStructure]);
  const place = useMemo(() => chosen ?? startingPlace(boxes, saved), [chosen, boxes, saved]);
  const { box, section, matchShelf } = place;
  const sections = boxes.find((b) => b.label === box)?.sections.map((s) => s.label) ?? [];

  function choose(next: Partial<Place>) {
    const updated = { ...place, ...next };
    setChosen(updated);
    try {
      localStorage.setItem(PLACE_KEY, JSON.stringify(updated));
    } catch {
      // Remembering the box is a convenience; without storage it's chosen each visit.
    }
  }

  const placeFor = useCallback(
    (itemType: string, size: string) => {
      const found = matchShelf ? suggestLocation(stockRef.current, itemType, size) : null;
      return found ? { box: found.box, section: found.section } : { box, section };
    },
    [matchShelf, box, section]
  );

  const book = useCallback(
    async (body: Omit<BookInBody, "box" | "section">, itemType: string, size: string) => {
      if (!token) return;
      const place = placeFor(itemType, size);
      if (!place.box || !place.section) {
        setError("Choose a box and section first.");
        return;
      }
      const result = await bookIn(token, { ...body, ...place });
      setStock((prev) => withLine(prev, result.item));
      stockRef.current = withLine(stockRef.current, result.item);
      const { item } = result;
      setBooked((prev) => [
        {
          key: nextKey.current++,
          itemType: item.itemType,
          size: item.size,
          box: item.box,
          section: item.section,
          quantityAfter: item.quantity,
          nsn: body.nsn ?? null,
          undone: false,
        },
        ...prev,
      ]);
      setStatus(
        `Booked in ${item.itemType}${sizeText(item.size)} to ${item.box} / ${item.section}. ${item.quantity} there now.`
      );
      navigator.vibrate?.(60);
    },
    [token, placeFor, setStock]
  );

  /** A stock number from any source: book it in, or ask what it is. */
  const handleNsn = useCallback(
    (nsn: string, readSize?: string | null) => {
      queue.current = queue.current.then(async () => {
        if (!token) return;
        setError(null);
        setBusy(true);
        try {
          const found = await lookupNsn(token, nsn);
          if (!found) {
            setStatus(null);
            setPickerKey((k) => k + 1);
            setPicker({ nsn, readSize: readSize ?? null });
          } else if (!found.itemType || !found.size) {
            setError(
              `${found.formatted} is ${found.description ?? "on the logs form"}, which the stores don't keep.`
            );
          } else {
            await book({ nsn }, found.itemType, found.size);
          }
        } catch (e) {
          setError(e instanceof Error ? e.message : "Couldn't book that in.");
        } finally {
          setBusy(false);
        }
      });
    },
    [token, book]
  );

  const onDetected = useCallback(
    (raw: string) => {
      const nsn = normaliseNsn(raw);
      if (!nsn) return; // the bag's "1" and "EACH" barcodes
      const now = Date.now();
      const last = lastCode.current;
      lastCode.current = { nsn, seenAt: now };
      if (last?.nsn === nsn && now - last.seenAt < OUT_OF_VIEW_MS) return;
      handleNsn(nsn);
    },
    [handleNsn]
  );

  function submitTyped(e: React.FormEvent) {
    e.preventDefault();
    const nsn = normaliseNsn(typed);
    if (!nsn) {
      setError("A stock number is 13 digits, like 8405-99-845-6634.");
      return;
    }
    setTyped("");
    // A handheld scanner types the code and Enter, so this is its path too.
    handleNsn(nsn);
  }

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !token) return;
    setError(null);
    setBusy(true);
    setStatus("Reading the label…");
    try {
      const result = await readLabel(token, await shrinkPhoto(file));
      const nsn = result.read.nsn;
      if (!nsn) {
        setStatus(null);
        setError("Couldn't make out the stock number. Try again closer, or choose the item.");
        return;
      }
      setStatus(`Read ${formatNsn(nsn)} off the label.`);
      handleNsn(nsn, result.read.size);
    } catch (err) {
      setStatus(null);
      setError(err instanceof Error ? err.message : "Couldn't read the label.");
    } finally {
      setBusy(false);
    }
  }

  async function onPicked(itemType: string, size: string) {
    if (!token || !picker) return;
    const { nsn } = picker;
    if (nsn) await teachNsn(token, nsn, itemType, size);
    // A taught number books in by its number, so the history says it was scanned.
    await book(nsn ? { nsn } : { itemType, size }, itemType, size);
    setPicker(null);
  }

  async function undo(entry: Booked) {
    if (!token) return;
    setError(null);
    try {
      const body = entry.nsn ? { nsn: entry.nsn } : { itemType: entry.itemType, size: entry.size };
      const result = await bookIn(token, { ...body, box: entry.box, section: entry.section, quantity: -1 });
      setStock((prev) => withLine(prev, result.item));
      stockRef.current = withLine(stockRef.current, result.item);
      setBooked((prev) => prev.map((b) => (b.key === entry.key ? { ...b, undone: true } : b)));
      setStatus(`Took ${entry.itemType}${sizeText(entry.size)} back off ${entry.box} / ${entry.section}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't undo that.");
    }
  }

  const live = booked.filter((b) => !b.undone).length;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 pb-16">
      <PageHeader
        title="Book In Uniform"
        description="Scan each item's stock number and it's added to the shelf."
      />

      {loadError && <ErrorAlert message={loadError} />}
      {loading && <ListSkeleton rows={4} />}

      {!loading && !loadError && boxes.length === 0 && (
        <EmptyState
          icon={PackageOpen}
          title="No boxes yet"
          description="Add a box on the Stock page first, so there's somewhere to put things."
        >
          <Button asChild variant="outline">
            <Link href="/stores/uniform/stock">Go to Stock</Link>
          </Button>
        </EmptyState>
      )}

      {!loading && !loadError && boxes.length > 0 && (
        <>
          <section className="flex flex-col gap-4">
            <SectionHeading title="Where it goes" />
            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel htmlFor="bookin-box">Box</FieldLabel>
                <SearchableSelect
                  id="bookin-box"
                  value={box}
                  onValueChange={(v) =>
                    choose({ box: v, section: boxes.find((b) => b.label === v)?.sections[0]?.label ?? "" })
                  }
                  className="w-full"
                  options={boxes.map((b) => ({ value: b.label, label: b.label }))}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="bookin-section">Section</FieldLabel>
                <SearchableSelect
                  id="bookin-section"
                  value={section}
                  onValueChange={(v) => choose({ section: v })}
                  disabled={sections.length === 0}
                  className="w-full"
                  options={sections.map((s) => ({ value: s, label: s }))}
                />
              </Field>
            </div>
            <Field orientation="horizontal">
              <Switch
                id="bookin-match"
                checked={matchShelf}
                onCheckedChange={(v) => choose({ matchShelf: v })}
              />
              <div className="flex flex-col gap-0.5">
                <FieldLabel htmlFor="bookin-match">Put each item with the same item</FieldLabel>
                <FieldDescription>
                  {matchShelf
                    ? "Goes where that size already is. Anything new goes in the box above."
                    : "Everything goes in the box and section above."}
                </FieldDescription>
              </div>
            </Field>
          </section>

          <section className="flex flex-col gap-4">
            <SectionHeading title="Scan" />
            {scanning ? (
              <BarcodeScanner onDetected={onDetected} onClose={() => setScanning(false)} />
            ) : (
              <Button
                type="button"
                className="h-11 w-full sm:w-auto sm:self-start"
                onClick={() => setScanning(true)}
              >
                <ScanBarcode data-icon="inline-start" />
                Scan barcodes
              </Button>
            )}

            <p role="status" aria-live="polite" className="text-muted-foreground min-h-5 text-sm">
              {status}
            </p>
            <ErrorAlert message={error} />

            <form onSubmit={submitTyped} className="flex flex-col gap-2">
              <FieldLabel htmlFor="bookin-nsn">Or type the stock number</FieldLabel>
              <div className="flex gap-2">
                <Input
                  id="bookin-nsn"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="8405-99-845-6634"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  className="h-10"
                />
                <Button type="submit" variant="outline" className="h-10" disabled={busy || !typed.trim()}>
                  Book in
                </Button>
              </div>
            </form>

            <div className="flex flex-wrap gap-2">
              {canReadLabels && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10"
                    disabled={busy}
                    onClick={() => photoInput.current?.click()}
                  >
                    <Camera data-icon="inline-start" />
                    Photo of the label
                  </Button>
                  <input
                    ref={photoInput}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    aria-label="Photo of the label"
                    onChange={onPhoto}
                  />
                </>
              )}
              <Button
                type="button"
                variant="outline"
                className="h-10"
                onClick={() => {
                  setPickerKey((k) => k + 1);
                  setPicker({ nsn: null, readSize: null });
                }}
              >
                <ListPlus data-icon="inline-start" />
                Choose the item
              </Button>
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <SectionHeading
              title="Booked in"
              description={booked.length ? `${live} item${live === 1 ? "" : "s"} this visit` : undefined}
            />
            {booked.length === 0 ? (
              <EmptyState
                icon={ScanBarcode}
                title="Nothing booked in yet"
                description="Each item you scan shows here, with an undo in case it went on the wrong shelf."
              />
            ) : (
              <ul className="divide-y rounded-lg border">
                {booked.map((b) => (
                  <li
                    key={b.key}
                    className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className={b.undone ? "text-muted-foreground line-through" : "font-medium"}>
                        {b.itemType}
                        {sizeText(b.size)}
                      </p>
                      <p className="text-muted-foreground text-sm">
                        {b.box} / {b.section}
                        {b.undone ? " · undone" : ` · ${b.quantityAfter} there now`}
                        {b.nsn ? ` · ${formatNsn(b.nsn)}` : ""}
                      </p>
                    </div>
                    {!b.undone && (
                      <Button type="button" variant="ghost" className="h-9" onClick={() => undo(b)}>
                        <Undo2 data-icon="inline-start" />
                        Undo
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <ItemPickerDialog
        key={pickerKey}
        request={picker}
        onCancel={() => setPicker(null)}
        onPicked={onPicked}
      />
    </div>
  );
}
