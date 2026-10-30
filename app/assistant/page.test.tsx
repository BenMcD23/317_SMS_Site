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
  ...extra,
});
const summary = (id: number, title: string): ChatSummary => ({
  id,
  title,
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
  calls.filter((c) => c.method === "POST" && c.path.endsWith("/assistant/ask")).map((c) => c.body);

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
      "POST /assistant/ask": { body: reply(3, "Who is missing parades?", answer(2, "**Ben Brook** (B).")) },
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
      "POST /assistant/ask": { body: reply(7, "And by rank?", answer(4, "Mostly cadets.")) },
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
      "POST /assistant/ask": { body: reply(7, "Show turnout by month", answer(4, "Steady.")) },
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
      "POST /assistant/ask": { body: reply(1, "Chart the squadron by flight and rank", answer(2, "Here.")) },
    });
    await renderPage();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Chart the squadron by flight and rank" }));

    await screen.findByRole("article", { name: /Chart the squadron/ });
    expect(asks(calls)[0]).toMatchObject({ chat_id: null });
  });

  it("'Hide personal data' asks without dates of birth and emails, and says so", async () => {
    setPersonalDataHidden(true);
    const calls = stubApi({
      "GET /assistant/chats": { body: [] },
      "POST /assistant/ask": { body: reply(1, "q", answer(2, "ok")) },
    });
    await renderPage();
    expect(screen.getByText(/Personal data is hidden/)).toBeInTheDocument();
    await ask("q");
    await screen.findByRole("article");
    expect(asks(calls)[0]).toMatchObject({ hide_personal: true });
  });

  it("shows a loading placeholder while it looks things up, and can't be asked twice", async () => {
    let respond!: (r: Response) => void;
    stubApi({
      "GET /assistant/chats": { body: [] },
      "POST /assistant/ask": () => new Promise<Response>((resolve) => (respond = resolve)),
    });
    await renderPage();
    await ask("Who is missing parades?");

    expect(screen.getByRole("region", { name: "Answer loading" })).toHaveTextContent(
      "Who is missing parades?"
    );
    expect(screen.getByRole("button", { name: /Looking it up/ })).toBeDisabled();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();

    await act(async () =>
      respond(new Response(JSON.stringify(reply(1, "Who is missing parades?", answer(2, "Ben.")))))
    );
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
      "POST /assistant/ask": { body: reply(1, "Hi", answer(2, "Hello.", { calls: [] })) },
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
      "POST /assistant/ask": { body: reply(1, "q", answer(2, "ok")) },
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
    await user.click(await screen.findByRole("button", { name: 'Delete chat "Report on flights"' }));
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
    await user.click(await screen.findByRole("button", { name: 'Delete chat "Report on flights"' }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Database down"));
    expect(screen.getByRole("article", { name: "Answer to: Report on flights" })).toBeInTheDocument();
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
      "POST /assistant/ask": () =>
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
      "POST /assistant/ask": { body: { detail: "proxy says no" } },
    });
    await renderPage();
    await ask("q");
    expect(await screen.findByRole("alert")).toHaveTextContent("an answer it couldn't read");
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
    expect(screen.getByRole("button", { name: /flight and rank/ })).toBeDisabled();
    expect(calls).toEqual([]);
  });
});
