// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const SESSION = {
  data: { id_token: "tok", role: "nco", user: { email: "nco@317atc.co.uk", name: "Dev NCO" } },
  status: "authenticated",
};
vi.mock("next-auth/react", () => ({ useSession: () => SESSION, signIn: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/assessments/radio",
}));

import RadioAssessmentPage from "@/app/assessments/radio/page";
import { readOutbox } from "@/lib/outbox";
import { renderWithQuery } from "@/tests/render-with-query";

const DRAFT_KEY = "assessment_draft_radio_nco@317atc.co.uk";

/** A finished sheet, as the draft autosave would have left it on the phone. */
function finishedDraft() {
  localStorage.setItem(
    DRAFT_KEY,
    JSON.stringify({
      cadetCin: 1234,
      cadetName: "Cdt Zoë Ünal",
      criteria: {},
      cyberSecDate: "2026-10-01",
      comments: "",
      assessorName: "Sgt Dev",
      assessorRole: "",
      date: "2026-10-22",
    })
  );
}

function api(submit: () => Promise<Response>) {
  const fetch = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async (url) => {
    const path = new URL(url).pathname;
    if (path === "/settings/assessor-name") return new Response(JSON.stringify({ assessor_name: "Sgt Dev" }));
    if (path === "/get-signature") return new Response("png", { headers: { "Content-Type": "image/png" } });
    if (path === "/assessments/radio/add-assessment") return submit();
    return new Response(JSON.stringify([]), { status: 200 });
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

async function submitSheet() {
  renderWithQuery(<RadioAssessmentPage />);
  const button = await screen.findByRole("button", { name: /Submit Assessment/ });
  // The saved signature loads asynchronously; submitting before it lands is a
  // validation error, which isn't what these tests are about.
  await screen.findByRole("img", { name: /signature/i });
  await new Promise((r) => setTimeout(r, 0));
  await userEvent.click(button);
}

beforeEach(() => {
  localStorage.clear();
  // jsdom has no object URLs, and its FileReader can't read Node's Blob: stand
  // in for the saved signature's preview and data URL.
  Object.defineProperty(URL, "createObjectURL", { value: () => "blob:sig", configurable: true });
  vi.stubGlobal(
    "FileReader",
    class {
      result = "data:image/png;base64,cG5n";
      onloadend: (() => void) | null = null;
      readAsDataURL() {
        queueMicrotask(() => this.onloadend?.());
      }
    }
  );
  finishedDraft();
});

describe("radio assessment: submitting", () => {
  it("with signal, records it and shows the assessment ID", async () => {
    const fetch = api(async () => new Response(JSON.stringify({ assessment_id: 42 }), { status: 201 }));
    await submitSheet();
    expect(await screen.findByRole("heading", { name: "Assessment Saved" })).toBeInTheDocument();
    expect(screen.getByText("Assessment ID: #42")).toBeInTheDocument();
    const [, init] = fetch.mock.calls.find(([u]) => String(u).endsWith("/add-assessment"))!;
    expect(JSON.parse(init!.body as string)).toMatchObject({ cadet_cin: 1234, cyber_sec_date: "2026-10-01" });
    expect(readOutbox()).toEqual([]);
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it("without signal, keeps it on the phone and says so instead of failing", async () => {
    api(() => Promise.reject(new TypeError("Failed to fetch")));
    await submitSheet();
    expect(await screen.findByRole("heading", { name: "Saved on this phone" })).toBeInTheDocument();
    expect(screen.getByText(/sends by itself when you're back online/)).toBeInTheDocument();
    expect(screen.queryByText(/Assessment ID/)).not.toBeInTheDocument();

    const [item] = readOutbox();
    expect(item).toMatchObject({
      url: expect.stringMatching(/\/assessments\/radio\/add-assessment$/),
      method: "POST",
      label: "Radio assessment — Cdt Zoë Ünal",
      owner: "nco@317atc.co.uk",
      body: expect.objectContaining({ cadet_cin: 1234, assessor_name: "Sgt Dev" }),
    });
    // The queued copy is the one that counts now; a restored draft would invite a duplicate.
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();

    // "Submit another" starts a fresh sheet, not the queued screen again.
    await userEvent.click(screen.getByRole("button", { name: /Submit Another Assessment/ }));
    expect(await screen.findByRole("button", { name: /Submit Assessment/ })).toBeInTheDocument();
  });

  it("a refusal from the server is shown and nothing is queued", async () => {
    api(async () => new Response(JSON.stringify({ detail: "Cadet not found" }), { status: 404 }));
    await submitSheet();
    expect(await screen.findByText("Cadet not found")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Saved/ })).not.toBeInTheDocument();
    expect(readOutbox()).toEqual([]);
  });
});
