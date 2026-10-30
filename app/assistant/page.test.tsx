// @vitest-environment jsdom
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AssistantPage from "@/app/assistant/page";
import type { AnswerMessage, AskReply, ChatDetail, ChatSummary } from "@/lib/assistant";
import { setPersonalDataHidden } from "@/lib/privacy";
import { renderWithQuery } from "@/tests/render-with-query";

// One stable object, like the real hook — swapped per test to sign out.
const SESSION = {
  data: { id_token: "tok", role: "staff", user: { email: "staff@317atc.co.uk", name: "Sam Staff" } },
  status: "authenticated",
  update: () => Promise.resolve(null),
};
const SIGNED_OUT = { data: null, status: "unauthenticated", update: () => Promise.resolve(null) };
let session: typeof SESSION | typeof SIGNED_OUT = SESSION;

vi.mock("next-auth/react", () => ({ useSession: () => session, signIn: () => Promise.resolve() }));

const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: { error: (m: string) => toastError(m) } }));

// The open chat is the URL: the page writes it with history.replaceState
// (which Next syncs to useSearchParams); the mock reads it as of each render.
vi.mock("next/navigation", () => ({
  usePathname: () => "/assistant",
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

const answer = (id: number, content: string, extra: Partial<AnswerMessage> = {}): AnswerMessage => ({
  id,
  role: "assistant",
  content,
  created_at: "2026-10-30T19:00:00",
  charts: [],
  tables: [],
  follow_ups: [],
  calls: [{ tool: "attendance", args: {}, ok: true }],
  model: "z-ai/glm-5.3",
  model_label: "GLM 5.3",
  fallback: false,
  cadets: [],
  feedback: null,
  ...extra,
});
const summary = (id: number, title: string, pinned = false): ChatSummary => ({
  id,
  title,
  pinned,
  created_at: "2026-10-30T19:00:00",
  updated_at: "2026-10-30T19:00:00",
});
const reply = (chatId: number, q: string, a: AnswerMessage): AskReply => ({
  chat: summary(chatId, q),
  question: { id: a.id - 1, role: "user", content: q, created_at: a.created_at },
  answer: a,
});

const CHART = {
  type: "bar" as const,
  title: "Cadets by flight",
  labels: ["A", "B"],
  series: [{ name: "Cadets", values: [26, 14] }],
  unit: "",
};
const TABLE = {
  title: "Oldest cadets",
  columns: ["Name", "Date of birth", "Email"],
  rows: [["Amy Ashworth", "2008-04-05", "amy@example.com"]],
};
const SAVED: ChatDetail = {
  ...summary(7, "Report on flights"),
  messages: [
    { id: 1, role: "user", content: "Report on flights", created_at: "2026-10-30T19:00:00" },
    answer(2, "**A flight** is the largest.", {
      charts: [CHART],
      tables: [TABLE],
      follow_ups: ["Show turnout by month"],
    }),
  ],
};

/** The API's streamed answer: a line per step, then the reply (or an error line). */
const ndjson = (events: unknown[]) => events.map((e) => JSON.stringify(e)).join("\n") + "\n";
const streamed =
  (r: AskReply, steps: string[] = ["Thinking", "Checking attendance"]) =>
  () =>
    new Response(ndjson([...steps.map((label) => ({ type: "step", label })), { type: "done", ...r }]), {
      headers: { "Content-Type": "application/x-ndjson" },
    });

type Route = { status?: number; body: unknown } | (() => Response | Promise<Response>);

/** A fake API: answers by method and path, recording every call. */
function stubApi(routes: Record<string, Route | Route[]>) {
  const calls: { method: string; path: string; body: unknown }[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const path = new URL(url, "http://x").pathname;
    calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const key = `${method} ${path}`;
    let route = routes[key];
    if (Array.isArray(route)) route = route.length > 1 ? route.shift()! : route[0];
    if (!route) return new Response(JSON.stringify({ detail: "Not Found" }), { status: 404 });
    if (typeof route === "function") return route();
    return new Response(JSON.stringify(route.body), { status: route.status ?? 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

const asks = (calls: { method: string; path: string; body: unknown }[]) =>
  calls.filter((c) => c.method === "POST" && c.path.endsWith("/assistant/ask/stream")).map((c) => c.body);

async function renderPage(url = "/assistant") {
  window.history.replaceState(null, "", url);
  let result!: ReturnType<typeof renderWithQuery>;
  await act(async () => {
    result = renderWithQuery(<AssistantPage />);
  });
  return result;
}

async function ask(text: string, label = "Question") {
  const user = userEvent.setup();
  await user.type(screen.getByRole("textbox", { name: label }), text);
  await user.click(screen.getByRole("button", { name: "Ask" }));
  return user;
}

beforeEach(() => {
  session = SESSION;
  toastError.mockClear();
  Element.prototype.scrollIntoView = vi.fn();
  setPersonalDataHidden(false);
});

describe("Assistant: asking", () => {
  it("a first question starts a new chat, shows the answer and puts the chat in the URL", async () => {
    const calls = stubApi({
      "GET /assistant/chats": [{ body: [] }, { body: [summary(3, "Who is missing parades?")] }],
      "POST /assistant/ask/stream": streamed(
        reply(3, "Who is missing parades?", answer(2, "**Ben Brook** (B)."))
      ),
    });
    await renderPage();
    await ask("  Who is missing parades?  ");

    const a = await screen.findByRole("article", { name: "Answer to: Who is missing parades?" });
    expect(within(a).getByText("Ben Brook").tagName).toBe("STRONG");
    expect(a).toHaveTextContent("Checked attendance · GLM 5.3");
    expect(asks(calls)).toEqual([
      { question: "Who is missing parades?", chat_id: null, hide_personal: false },
    ]);
    expect(window.location.search).toBe("?chat=3");
    // The new chat joins the list, and the box is cleared for a follow-up.
    expect(await screen.findByRole("button", { name: /^Who is missing parades\?/ })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Follow-up question" })).toHaveValue("");
  });

  it("a follow-up carries on the open chat", async () => {
    const calls = stubApi({
      "GET /assistant/chats": { body: [summary(7, "Report on flights")] },
      "GET /assistant/chats/7": { body: SAVED },
      "POST /assistant/ask/stream": streamed(reply(7, "And by rank?", answer(4, "Mostly cadets."))),
    });
    await renderPage("/assistant?chat=7");
    await screen.findByRole("article", { name: "Answer to: Report on flights" });
    await ask("And by rank?", "Follow-up question");

    await screen.findByRole("article", { name: "Answer to: And by rank?" });
    expect(asks(calls)[0]).toMatchObject({ question: "And by rank?", chat_id: 7 });
    const thread = within(screen.getByRole("list", { name: "Conversation" }));
    expect(thread.getAllByRole("article").map((x) => x.getAttribute("aria-label"))).toEqual([
      "Answer to: Report on flights",
      "Answer to: And by rank?",
    ]);
  });

  it("a suggested follow-up asks straight away", async () => {
    const calls = stubApi({
      "GET /assistant/chats": { body: [] },
      "GET /assistant/chats/7": { body: SAVED },
      "POST /assistant/ask/stream": streamed(reply(7, "Show turnout by month", answer(4, "Steady."))),
    });
    await renderPage("/assistant?chat=7");
    await userEvent.setup().click(await screen.findByRole("button", { name: "Show turnout by month" }));

    expect(
      await screen.findByRole("article", { name: "Answer to: Show turnout by month" })
    ).toBeInTheDocument();
    expect(asks(calls)[0]).toMatchObject({ question: "Show turnout by month", chat_id: 7 });
  });

  it("an example question asks straight away in a new chat", async () => {
    const calls = stubApi({
      "GET /assistant/chats": { body: [] },
      "POST /assistant/ask/stream": streamed(
        reply(1, "Which NCOs are overdue an appraisal?", answer(2, "Here."))
      ),
    });
    await renderPage();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Which NCOs are overdue an appraisal?" }));

    await screen.findByRole("article", { name: /overdue an appraisal/ });
    expect(asks(calls)[0]).toMatchObject({ chat_id: null });
  });

  it("'Hide personal data' asks without dates of birth and emails, and says so", async () => {
    setPersonalDataHidden(true);
    const calls = stubApi({
      "GET /assistant/chats": { body: [] },
      "POST /assistant/ask/stream": streamed(reply(1, "q", answer(2, "ok"))),
    });
    await renderPage();
    expect(screen.getByText(/Personal data is hidden/)).toBeInTheDocument();
    await ask("q");
    await screen.findByRole("article");
    expect(asks(calls)[0]).toMatchObject({ hide_personal: true });
  });

  it("shows each step as it works, then the answer, and can't be asked twice", async () => {
    // A stream the test feeds line by line, as the API sends them.
    let push!: (event: unknown) => void;
    let end!: () => void;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const enc = new TextEncoder();
        push = (event) => controller.enqueue(enc.encode(JSON.stringify(event) + "\n"));
        end = () => controller.close();
      },
    });
    stubApi({
      "GET /assistant/chats": { body: [] },
      "POST /assistant/ask/stream": () => new Response(body),
    });
    await renderPage();
    await ask("Who is missing parades?");

    const loading = await screen.findByRole("region", { name: "Answer loading" });
    expect(loading).toHaveTextContent("Who is missing parades?");
    expect(screen.getByRole("button", { name: /Looking it up/ })).toBeDisabled();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();

    await act(async () => push({ type: "step", label: "Checking attendance" }));
    expect(await within(loading).findByText(/Checking attendance…/)).toBeInTheDocument();
    await act(async () => push({ type: "step", label: "Writing the answer" }));
    expect(await within(loading).findByText(/Writing the answer…/)).toBeInTheDocument();

    await act(async () => {
      push({ type: "done", ...reply(1, "Who is missing parades?", answer(2, "Ben.")) });
      end();
    });
    expect(await screen.findByRole("article")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Answer loading" })).not.toBeInTheDocument();
  });
});

describe("Assistant: answers", () => {
  it("shows charts and tables with a CSV download each, and the backup-model note", async () => {
    stubApi({
      "GET /assistant/chats": { body: [] },
      "GET /assistant/chats/7": {
        body: {
          ...SAVED,
          messages: [
            SAVED.messages[0],
            { ...SAVED.messages[1], model_label: "Groq gpt-oss-120b", fallback: true },
          ],
        },
      },
    });
    await renderPage("/assistant?chat=7");
    const a = await screen.findByRole("article", { name: "Answer to: Report on flights" });

    expect(within(a).getByText("Cadets by flight")).toBeInTheDocument();
    expect(within(a).getByRole("button", { name: "Download Cadets by flight as CSV" })).toBeInTheDocument();
    const table = within(a).getByRole("table", { name: "Oldest cadets" });
    expect(table).toHaveTextContent("amy@example.com");
    expect(table).toHaveTextContent("2008-04-05");
    expect(a).toHaveTextContent("Groq gpt-oss-120b (backup model)");
  });

  it("'Hide personal data' takes date of birth and email columns out of saved tables", async () => {
    setPersonalDataHidden(true);
    stubApi({ "GET /assistant/chats": { body: [] }, "GET /assistant/chats/7": { body: SAVED } });
    await renderPage("/assistant?chat=7");

    const table = await screen.findByRole("table", { name: "Oldest cadets" });
    expect(table).toHaveTextContent("Amy Ashworth");
    expect(table).not.toHaveTextContent("amy@example.com");
    expect(table).not.toHaveTextContent("Date of birth");
  });

  it("says when nothing was looked up", async () => {
    stubApi({
      "GET /assistant/chats": { body: [] },
      "POST /assistant/ask/stream": streamed(reply(1, "Hi", answer(2, "Hello.", { calls: [] }))),
    });
    await renderPage();
    await ask("Hi");
    expect(await screen.findByRole("article")).toHaveTextContent("Answered without checking the records");
  });

  it("copies an answer, and a blocked clipboard is a toast", async () => {
    stubApi({ "GET /assistant/chats": { body: [] }, "GET /assistant/chats/7": { body: SAVED } });
    await renderPage("/assistant?chat=7");
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    await user.click(await screen.findByRole("button", { name: "Copy answer" }));
    expect(writeText).toHaveBeenCalledWith("**A flight** is the largest.");

    writeText.mockRejectedValue(new Error("denied"));
    await user.click(screen.getByRole("button", { name: "Copy answer" }));
    expect(toastError).toHaveBeenCalledWith(expect.stringContaining("Couldn't copy"));
  });
});

describe("Assistant: links, ratings and printing", () => {
  const LINKED: ChatDetail = {
    ...SAVED,
    messages: [
      SAVED.messages[0],
      answer(2, "**Amy Ashworth** and Ben Brook lead.", {
        cadets: [
          { cin: 1001, name: "Amy Ashworth" },
          { cin: 1002, name: "Ben Brook" },
        ],
        tables: [{ title: "Leaders", columns: ["Name", "Flight"], rows: [["Ben Brook", "B"]] }],
      }),
    ],
  };

  it("cadets named in the answer and its tables link to their records", async () => {
    stubApi({ "GET /assistant/chats": { body: [] }, "GET /assistant/chats/7": { body: LINKED } });
    await renderPage("/assistant?chat=7");
    const a = await screen.findByRole("article");
    expect(within(a).getByRole("link", { name: "Amy Ashworth" })).toHaveAttribute("href", "/cadets/1001");
    const links = within(a).getAllByRole("link", { name: "Ben Brook" });
    expect(links).toHaveLength(2); // in the text and in the table
    expect(links.every((l) => l.getAttribute("href") === "/cadets/1002")).toBe(true);
  });

  it("a thumb rates the answer, pressing it again takes it back, and a failure undoes it", async () => {
    const calls = stubApi({
      "GET /assistant/chats": { body: [] },
      "GET /assistant/chats/7": { body: SAVED },
      "PUT /assistant/messages/2/feedback": [
        { body: { id: 2, feedback: -1 } },
        { body: { id: 2, feedback: null } },
        { status: 500, body: { detail: "Database down" } },
      ],
    });
    await renderPage("/assistant?chat=7");
    const user = userEvent.setup();
    const down = await screen.findByRole("button", { name: "Bad answer" });

    await user.click(down);
    expect(down).toHaveAttribute("aria-pressed", "true");
    await user.click(down);
    expect(down).toHaveAttribute("aria-pressed", "false");
    const puts = calls.filter((c) => c.method === "PUT").map((c) => c.body);
    expect(puts).toEqual([{ value: -1 }, { value: null }]);

    await user.click(screen.getByRole("button", { name: "Good answer" }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Database down"));
    expect(screen.getByRole("button", { name: "Good answer" })).toHaveAttribute("aria-pressed", "false");
  });

  it("Print prints the chat", async () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    stubApi({ "GET /assistant/chats": { body: [] }, "GET /assistant/chats/7": { body: SAVED } });
    await renderPage("/assistant?chat=7");
    await userEvent.setup().click(await screen.findByRole("button", { name: "Print" }));
    expect(print).toHaveBeenCalled();
  });

  it("there's nothing to print in a new chat", async () => {
    stubApi({ "GET /assistant/chats": { body: [] } });
    await renderPage();
    expect(screen.queryByRole("button", { name: "Print" })).not.toBeInTheDocument();
  });
});

describe("Assistant: saved chats", () => {
  it("lists your chats and opens one", async () => {
    stubApi({
      "GET /assistant/chats": { body: [summary(7, "Report on flights"), summary(5, "Older chat")] },
      "GET /assistant/chats/7": { body: SAVED },
    });
    await renderPage();
    const list = within(await screen.findByRole("list", { name: "Your chats" }));
    await userEvent.setup().click(list.getByRole("button", { name: /^Report on flights/ }));

    expect(await screen.findByRole("article", { name: "Answer to: Report on flights" })).toBeInTheDocument();
    expect(window.location.search).toBe("?chat=7");
    expect(list.getByRole("button", { name: /^Report on flights/ })).toHaveAttribute("aria-current", "page");
  });

  it("an empty list says chats will appear there", async () => {
    stubApi({ "GET /assistant/chats": { body: [] } });
    await renderPage();
    expect(await screen.findByText("Your chats appear here, to carry on later.")).toBeInTheDocument();
  });

  it("a list that fails to load says so, and asking still works", async () => {
    stubApi({
      "GET /assistant/chats": { status: 500, body: { detail: "Database down" } },
      "POST /assistant/ask/stream": streamed(reply(1, "q", answer(2, "ok"))),
    });
    await renderPage();
    expect(await screen.findByText("Database down")).toBeInTheDocument();
    await ask("q");
    expect(await screen.findByRole("article")).toBeInTheDocument();
  });

  it("'New chat' clears the thread and the URL", async () => {
    stubApi({ "GET /assistant/chats": { body: [] }, "GET /assistant/chats/7": { body: SAVED } });
    await renderPage("/assistant?chat=7");
    await screen.findByRole("article");
    await userEvent.setup().click(screen.getByRole("button", { name: "New chat" }));

    expect(screen.queryByRole("list", { name: "Conversation" })).not.toBeInTheDocument();
    expect(screen.getByText("Ask a question")).toBeInTheDocument();
    expect(window.location.search).toBe("");
  });

  it("deleting the open chat asks first, then clears it", async () => {
    const calls = stubApi({
      "GET /assistant/chats": [{ body: [summary(7, "Report on flights")] }, { body: [] }],
      "GET /assistant/chats/7": { body: SAVED },
      "DELETE /assistant/chats/7": () => new Response(null, { status: 204 }),
    });
    await renderPage("/assistant?chat=7");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: 'More for "Report on flights"' }));
    await user.click(await screen.findByRole("menuitem", { name: "Delete" }));
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(calls.some((c) => c.method === "DELETE")).toBe(true));
    await waitFor(() => expect(window.location.search).toBe(""));
    expect(screen.getByText("Ask a question")).toBeInTheDocument();
  });

  it("a failed delete is a toast and the chat stays", async () => {
    stubApi({
      "GET /assistant/chats": { body: [summary(7, "Report on flights")] },
      "GET /assistant/chats/7": { body: SAVED },
      "DELETE /assistant/chats/7": { status: 500, body: { detail: "Database down" } },
    });
    await renderPage("/assistant?chat=7");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: 'More for "Report on flights"' }));
    await user.click(await screen.findByRole("menuitem", { name: "Delete" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Database down"));
    expect(screen.getByRole("article", { name: "Answer to: Report on flights" })).toBeInTheDocument();
  });

  it("pinning a chat asks the API and refreshes the list", async () => {
    const calls = stubApi({
      "GET /assistant/chats": [
        { body: [summary(7, "Report on flights")] },
        { body: [summary(7, "Report on flights", true)] },
      ],
      "PATCH /assistant/chats/7": { body: summary(7, "Report on flights", true) },
    });
    await renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: 'More for "Report on flights"' }));
    await user.click(await screen.findByRole("menuitem", { name: "Pin to top" }));

    await waitFor(() => expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ pinned: true }));
    expect(await screen.findByLabelText("Pinned")).toBeInTheDocument();
  });

  it("renaming a chat checks the name, saves it, and shows the API's refusal", async () => {
    const calls = stubApi({
      "GET /assistant/chats": { body: [summary(7, "Report on flights")] },
      "PATCH /assistant/chats/7": [
        { status: 422, body: { detail: "Give the chat a name" } },
        { body: summary(7, "Flight report") },
      ],
    });
    await renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: 'More for "Report on flights"' }));
    await user.click(await screen.findByRole("menuitem", { name: "Rename" }));
    const name = await screen.findByRole("textbox", { name: "Name" });
    expect(name).toHaveValue("Report on flights");

    await user.clear(name);
    await user.click(screen.getByRole("button", { name: "Save name" }));
    expect(await screen.findByText("Give the chat a name")).toBeInTheDocument();
    expect(calls.some((c) => c.method === "PATCH")).toBe(false);

    await user.type(name, "Flight report");
    await user.click(screen.getByRole("button", { name: "Save name" }));
    expect(await screen.findByText("Not renamed")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save name" }));
    await waitFor(() => expect(screen.queryByRole("textbox", { name: "Name" })).not.toBeInTheDocument());
    expect(calls.filter((c) => c.method === "PATCH").map((c) => c.body)).toEqual([
      { title: "Flight report" },
      { title: "Flight report" },
    ]);
  });

  it("a chat that's gone (or someone else's) says it may have been deleted", async () => {
    stubApi({
      "GET /assistant/chats": { body: [] },
      "GET /assistant/chats/99": { status: 404, body: { detail: "Chat not found" } },
    });
    await renderPage("/assistant?chat=99");
    expect(await screen.findByText("It may have been deleted.")).toBeInTheDocument();
  });

  it("a nonsense chat id in the URL is a new chat", async () => {
    const calls = stubApi({ "GET /assistant/chats": { body: [] } });
    await renderPage("/assistant?chat=abc");
    expect(screen.getByText("Ask a question")).toBeInTheDocument();
    expect(calls.some((c) => c.path.includes("/chats/"))).toBe(false);
  });
});

describe("Assistant: errors", () => {
  it.each([
    [503, { detail: "The assistant is unavailable. Try again in a minute." }, "The assistant is unavailable"],
    [403, { detail: "Not authorised" }, "Not authorised"],
    [404, { detail: "Chat not found" }, "Chat not found"],
    [422, { detail: [{ msg: "String should have at most 2000 characters" }] }, "at most 2000 characters"],
    [500, "not json", "The assistant couldn't answer."],
  ])("an API %s shows its reason and keeps the question to retry", async (status, body, message) => {
    stubApi({
      "GET /assistant/chats": { body: [] },
      "POST /assistant/ask/stream": () =>
        new Response(typeof body === "string" ? body : JSON.stringify(body), { status }),
    });
    await renderPage();
    await ask("Who is missing parades?");

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.getByRole("textbox", { name: "Question" })).toHaveValue("Who is missing parades?");
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
  });

  it("an error body that arrives as a 200 is an error, not half an answer", async () => {
    stubApi({
      "GET /assistant/chats": { body: [] },
      "POST /assistant/ask/stream": { body: { detail: "proxy says no" } },
    });
    await renderPage();
    await ask("q");
    expect(await screen.findByRole("alert")).toHaveTextContent("stopped before it answered");
  });

  it("an error part-way through the stream shows its reason", async () => {
    stubApi({
      "GET /assistant/chats": { body: [] },
      "POST /assistant/ask/stream": () =>
        new Response(
          ndjson([
            { type: "step", label: "Thinking" },
            { type: "error", detail: "The assistant is unavailable. Try again in a minute." },
          ])
        ),
    });
    await renderPage();
    await ask("q");
    expect(await screen.findByRole("alert")).toHaveTextContent("The assistant is unavailable");
    expect(screen.getByRole("textbox", { name: "Question" })).toHaveValue("q");
  });

  it("a stream cut off before the answer says so", async () => {
    stubApi({
      "GET /assistant/chats": { body: [] },
      "POST /assistant/ask/stream": () => new Response(ndjson([{ type: "step", label: "Thinking" }])),
    });
    await renderPage();
    await ask("q");
    expect(await screen.findByRole("alert")).toHaveTextContent("stopped before it answered");
  });

  it("a garbled line is an error, not a crash", async () => {
    stubApi({
      "GET /assistant/chats": { body: [] },
      "POST /assistant/ask/stream": () => new Response("{not json\n"),
    });
    await renderPage();
    await ask("q");
    expect(await screen.findByRole("alert")).toHaveTextContent("couldn't read");
  });

  it("the API being unreachable says so", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("Failed to fetch")))
    );
    await renderPage();
    await ask("q");
    expect(await screen.findByText("Server unreachable.")).toBeInTheDocument();
  });

  it("can't ask while signed out", async () => {
    session = SIGNED_OUT;
    const calls = stubApi({ "GET /assistant/chats": { body: [] } });
    await renderPage();
    expect(screen.getByRole("button", { name: "Ask" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /overdue an appraisal/ })).toBeDisabled();
    expect(calls).toEqual([]);
  });
});
