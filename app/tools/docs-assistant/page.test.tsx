// @vitest-environment jsdom
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import DocsAssistantPage from "@/app/tools/docs-assistant/page";

// One stable object, like the real hook — swapped per test to sign out.
const SESSION = {
  data: { id_token: "tok", role: "staff", user: { email: "staff@317atc.co.uk", name: "Sam Staff" } },
  status: "authenticated",
  update: () => Promise.resolve(null),
};
const SIGNED_OUT = { data: null, status: "unauthenticated", update: () => Promise.resolve(null) };
let session: typeof SESSION | typeof SIGNED_OUT = SESSION;

const signIn = vi.fn(() => Promise.resolve());
vi.mock("next-auth/react", () => ({ useSession: () => session, signIn: () => signIn() }));

const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: { error: (m: string) => toastError(m) } }));

const TEXT =
  "12. Cadets may sleep overnight in Army Reserve Centres, provided that the OC has written\napproval from the Wing.";
const quoteStart = TEXT.indexOf("provided");

const ANSWER = {
  answer: "Yes, with Wing approval [1].\n- Mixed groups need staff of both sexes [2].",
  found: true,
  sources: [
    {
      n: 1,
      filename: "ACP 20 Overnight.pdf",
      location: "page 14, para 12",
      url: "https://rafac.sharepoint.com/ACP%2020%20Overnight.pdf#page=14",
      snippet: "provided that the OC has written approval from the Wing.",
      score: 7.2,
      text: TEXT,
      quotes: [
        {
          start: quoteStart,
          end: TEXT.length,
          text: TEXT.slice(quoteStart),
          location: "page 14, para 12",
          page: 14,
        },
      ],
    },
    {
      n: 2,
      filename: "Supervision.docx",
      location: "Overnight stays, para 3",
      url: "https://rafac.sharepoint.com/Supervision.docx",
      snippet: "Adult staff of both sexes must be present.",
      score: 5.1,
      text: "3. Adult staff of both sexes must be present.",
      quotes: [
        {
          start: 3,
          end: 45,
          text: "Adult staff of both sexes must be present.",
          location: "Overnight stays, para 3",
          page: null,
        },
      ],
    },
  ],
  related: [],
};

function stubApi(...replies: (() => Response | Promise<Response>)[]) {
  const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(() => {
    const next = replies.length > 1 ? replies.shift()! : replies[0];
    return Promise.resolve(next());
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const json =
  (body: unknown, status = 200) =>
  () =>
    new Response(JSON.stringify(body), { status });

async function askQuestion(text = "Can cadets sleep overnight?") {
  const user = userEvent.setup();
  await user.type(screen.getByRole("textbox", { name: "Question" }), text);
  await user.click(screen.getByRole("button", { name: "Ask" }));
  return user;
}

beforeEach(() => {
  session = SESSION;
  toastError.mockClear();
  signIn.mockClear();
  Element.prototype.scrollIntoView = vi.fn();
  try {
    sessionStorage.clear();
  } catch {
    // jsdom always has it; the guard mirrors the app's own.
  }
});

describe("Docs Assistant", () => {
  it("posts the trimmed question to the API with the user's token", async () => {
    const fetchMock = stubApi(json(ANSWER));
    render(<DocsAssistantPage />);
    await askQuestion("  Can cadets sleep overnight?  ");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/chat\/ask$/);
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(JSON.parse(String(init?.body))).toEqual({ question: "Can cadets sleep overnight?" });
  });

  it("shows the answer with clickable citations and each source's quoted lines and location", async () => {
    stubApi(json(ANSWER));
    render(<DocsAssistantPage />);
    await askQuestion();

    expect(await screen.findByText("Can cadets sleep overnight?")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Source 1: ACP 20 Overnight.pdf, page 14, para 12" })
    ).toBeInTheDocument();
    expect(screen.getByRole("listitem", { name: "Source 1" })).toHaveTextContent(
      "“provided that the OC has written approval from the Wing.”"
    );
    // The answer's "- " line renders as a list item holding the second citation.
    expect(
      screen.getByRole("button", { name: /^Source 2: Supervision.docx/ }).closest("li")
    ).toHaveTextContent("Mixed groups need staff of both sexes");

    const doc = screen.getByRole("link", { name: "ACP 20 Overnight.pdf" });
    expect(doc).toHaveAttribute("href", "https://rafac.sharepoint.com/ACP%2020%20Overnight.pdf#page=14");
    expect(doc).toHaveAttribute("target", "_blank");
    expect(
      within(screen.getByRole("listitem", { name: "Source 1" })).getByText("page 14, para 12")
    ).toBeInTheDocument();
    // The question box is cleared for the next one.
    expect(screen.getByRole("textbox", { name: "Question" })).toHaveValue("");
  });

  it("clicking a citation jumps to its source and highlights the exact lines in the passage", async () => {
    stubApi(json(ANSWER));
    render(<DocsAssistantPage />);
    const user = await askQuestion();

    expect(screen.queryByLabelText("Passage from ACP 20 Overnight.pdf")).not.toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: /^Source 1:/ }));

    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    const passage = screen.getByLabelText("Passage from ACP 20 Overnight.pdf");
    expect(passage).toHaveTextContent("12. Cadets may sleep overnight");
    const marks = passage.querySelectorAll("mark");
    expect(marks).toHaveLength(1);
    expect(marks[0].textContent).toBe(TEXT.slice(quoteStart));
    expect(screen.getByRole("button", { name: "Hide context" })).toBeInTheDocument();
  });

  it("'Show in context' opens and closes a source's passage", async () => {
    stubApi(json(ANSWER));
    render(<DocsAssistantPage />);
    const user = await askQuestion();
    const source2 = within(await screen.findByRole("listitem", { name: "Source 2" }));

    await user.click(source2.getByRole("button", { name: "Show in context" }));
    expect(screen.getByLabelText("Passage from Supervision.docx")).toBeInTheDocument();
    await user.click(source2.getByRole("button", { name: "Hide context" }));
    expect(screen.queryByLabelText("Passage from Supervision.docx")).not.toBeInTheDocument();
  });

  it("copies the answer with its numbered sources", async () => {
    stubApi(json(ANSWER));
    render(<DocsAssistantPage />);
    const user = await askQuestion();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();

    await user.click(await screen.findByRole("button", { name: "Copy answer with sources" }));
    expect(writeText.mock.calls[0][0]).toContain(
      "Sources:\n[1] ACP 20 Overnight.pdf, page 14, para 12 — https://rafac.sharepoint.com/ACP%2020%20Overnight.pdf#page=14"
    );
    expect(await screen.findByText("Copied")).toBeInTheDocument();
  });

  it("a blocked clipboard is a toast, not a crash", async () => {
    stubApi(json(ANSWER));
    render(<DocsAssistantPage />);
    const user = await askQuestion();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("denied"));

    await user.click(await screen.findByRole("button", { name: "Copy answer with sources" }));
    expect(toastError).toHaveBeenCalledWith(expect.stringContaining("Couldn't copy"));
  });

  it("no answer in the documents offers the closest documents instead of sources", async () => {
    stubApi(
      json({
        answer: "I couldn't find that in the documents.",
        found: false,
        sources: [],
        related: [
          { filename: "Canteen Guide.pdf", location: "page 2", url: "https://sp/Canteen%20Guide.pdf#page=2" },
        ],
      })
    );
    render(<DocsAssistantPage />);
    await askQuestion("When does the canteen open?");

    expect(await screen.findByText("I couldn't find that in the documents.")).toBeInTheDocument();
    const closest = within(screen.getByRole("region", { name: "Closest documents" }));
    expect(closest.getByRole("link", { name: "Canteen Guide.pdf" })).toHaveAttribute(
      "href",
      "https://sp/Canteen%20Guide.pdf#page=2"
    );
    expect(screen.queryByRole("region", { name: "Sources" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copy answer with sources" })).not.toBeInTheDocument();
  });

  it("an answer from an older chatbot without quotes or passage text still shows its sources", async () => {
    stubApi(
      json({
        answer: "Yes [1]. Also see [7].",
        sources: [
          {
            n: 1,
            filename: "Old.pdf",
            location: "page 3",
            url: "https://sp/Old.pdf",
            snippet: "Old snippet",
          },
        ],
      })
    );
    render(<DocsAssistantPage />);
    await askQuestion();

    const source = within(await screen.findByRole("listitem", { name: "Source 1" }));
    expect(source.getByText("Old snippet")).toBeInTheDocument();
    expect(source.queryByRole("button", { name: "Show in context" })).not.toBeInTheDocument();
    // [7] has no source, so it stays as text rather than becoming a button to nowhere.
    expect(screen.getByText(/Also see \[7\]\./)).toBeInTheDocument();
  });

  it.each([
    [
      "the API's own message",
      json({ detail: "Docs assistant is unavailable" }, 503),
      "Docs assistant is unavailable",
    ],
    [
      "a validation list",
      json({ detail: [{ msg: "String should have at most 2000 characters" }] }, 422),
      "String should have at most 2000 characters",
    ],
    [
      "the fallback when the body isn't JSON",
      () => new Response("<html>Bad gateway</html>", { status: 502 }),
      "The docs assistant couldn't answer.",
    ],
    [
      "the fallback when the body is an error object with a 200",
      json({ detail: "odd" }),
      "The docs assistant sent back an answer it couldn't read.",
    ],
  ])("a failed request toasts %s and keeps the question to retry", async (_name, reply, message) => {
    stubApi(reply);
    render(<DocsAssistantPage />);
    await askQuestion("Can cadets sleep overnight?");

    await vi.waitFor(() => expect(toastError).toHaveBeenCalledWith(message));
    expect(screen.getByRole("textbox", { name: "Question" })).toHaveValue("Can cadets sleep overnight?");
    expect(screen.getByRole("button", { name: "Ask" })).toBeEnabled();
    expect(screen.queryByRole("region", { name: "Sources" })).not.toBeInTheDocument();
  });

  it("an unreachable API toasts and the question can be asked again", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValue(new Response(JSON.stringify(ANSWER)));
    vi.stubGlobal("fetch", fetchMock);
    render(<DocsAssistantPage />);
    const user = await askQuestion();

    await vi.waitFor(() => expect(toastError).toHaveBeenCalledWith("Server unreachable."));
    await user.click(screen.getByRole("button", { name: "Ask" }));
    expect(await screen.findByRole("region", { name: "Sources" })).toBeInTheDocument();
  });

  it("a 401 mid-session starts a re-auth and leaves the page waiting rather than erroring", async () => {
    stubApi(json({ detail: "Invalid token" }, 401));
    render(<DocsAssistantPage />);
    await askQuestion();

    await vi.waitFor(() => expect(signIn).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: /Searching the documents/ })).toBeDisabled();
    expect(toastError).not.toHaveBeenCalled();
  });

  it("shows the question and a loading card while it waits, and blocks a second ask", async () => {
    let resolve!: (r: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((r) => (resolve = r)));
    vi.stubGlobal("fetch", fetchMock);
    render(<DocsAssistantPage />);
    const user = await askQuestion("First question?");

    expect(screen.getByLabelText("Answer loading")).toHaveTextContent("First question?");
    await user.type(screen.getByRole("textbox", { name: "Question" }), "{Enter}");
    expect(fetchMock).toHaveBeenCalledOnce();

    await act(async () => resolve(new Response(JSON.stringify(ANSWER))));
    expect(screen.queryByLabelText("Answer loading")).not.toBeInTheDocument();
  });

  it("keeps earlier answers below the newest one", async () => {
    stubApi(json(ANSWER), json({ ...ANSWER, answer: "Second answer [1]." }));
    render(<DocsAssistantPage />);
    const user = await askQuestion("First question?");
    await screen.findByRole("region", { name: "Sources" });
    await user.type(screen.getByRole("textbox", { name: "Question" }), "Second question?{Enter}");

    expect(await screen.findByText("Earlier questions")).toBeInTheDocument();
    const asked = screen.getAllByText(/question\?$/).map((el) => el.textContent);
    expect(asked).toEqual(["Second question?", "First question?"]);
  });

  it("an example question asks straight away and the examples go once there's an answer", async () => {
    const fetchMock = stubApi(json(ANSWER));
    render(<DocsAssistantPage />);
    const user = userEvent.setup();

    await user.click(
      screen.getByRole("button", { name: "Can cadets sleep overnight in Army Reserve centres?" })
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).question).toBe(
      "Can cadets sleep overnight in Army Reserve centres?"
    );
    await screen.findByRole("region", { name: "Sources" });
    expect(screen.queryByRole("region", { name: "Example questions" })).not.toBeInTheDocument();
  });

  it("Shift+Enter adds a new line instead of asking, and a blank question can't be sent", async () => {
    const fetchMock = stubApi(json(ANSWER));
    render(<DocsAssistantPage />);
    const user = userEvent.setup();
    const box = screen.getByRole("textbox", { name: "Question" });

    expect(screen.getByRole("button", { name: "Ask" })).toBeDisabled();
    await user.type(box, "   {Enter}");
    await user.type(box, "Line one{Shift>}{Enter}{/Shift}line two");
    expect(box).toHaveValue("   Line one\nline two");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("without a session nothing can be asked", async () => {
    session = SIGNED_OUT;
    const fetchMock = stubApi(json(ANSWER));
    render(<DocsAssistantPage />);
    const user = userEvent.setup();

    await user.type(screen.getByRole("textbox", { name: "Question" }), "Anything?{Enter}");
    expect(screen.getByRole("button", { name: "Ask" })).toBeDisabled();
    for (const ex of screen.getAllByRole("button", { name: /\?$/ })) expect(ex).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
