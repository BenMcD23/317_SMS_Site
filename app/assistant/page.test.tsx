// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AssistantPage from "@/app/assistant/page";

// One stable object, like the real hook — swapped per test to sign out.
const SESSION = {
  data: { id_token: "tok", role: "staff", user: { email: "staff@317atc.co.uk", name: "Sam Staff" } },
  status: "authenticated",
  update: () => Promise.resolve(null),
};
const SIGNED_OUT = { data: null, status: "unauthenticated", update: () => Promise.resolve(null) };
let session: typeof SESSION | typeof SIGNED_OUT = SESSION;

vi.mock("next-auth/react", () => ({ useSession: () => session, signIn: () => Promise.resolve() }));

const reply = (answer: string, extra: Record<string, unknown> = {}) => ({
  answer,
  calls: [{ tool: "attendance", args: { flight: "B" }, ok: true }],
  model: "z-ai/glm-5.3",
  model_label: "GLM 5.3",
  fallback: false,
  ...extra,
});

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

const sent = (fetchMock: ReturnType<typeof stubApi>, n: number) =>
  JSON.parse(String(fetchMock.mock.calls[n][1]?.body));

async function ask(text: string, label = "Question") {
  const user = userEvent.setup();
  await user.type(screen.getByRole("textbox", { name: label }), text);
  await user.click(screen.getByRole("button", { name: "Ask" }));
  return user;
}

beforeEach(() => {
  session = SESSION;
  Element.prototype.scrollIntoView = vi.fn();
});

describe("Assistant", () => {
  it("posts the trimmed question with the user's token and no history to start", async () => {
    const fetchMock = stubApi(json(reply("Ben Brook.")));
    render(<AssistantPage />);
    await ask("  Who in B flight is missing parades?  ");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/assistant\/ask$/);
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(sent(fetchMock, 0)).toEqual({ question: "Who in B flight is missing parades?", history: [] });
  });

  it("shows the answer as formatted text with what it checked and which model answered", async () => {
    stubApi(json(reply("Two cadets:\n- **Ben Brook** (B, Cadet)\n- Siân Ó Briain")));
    render(<AssistantPage />);
    await ask("Who is missing parades?");

    const answer = await screen.findByRole("article", { name: "Who is missing parades?" });
    expect(within(answer).getByText("Ben Brook").tagName).toBe("STRONG");
    expect(within(answer).getAllByRole("listitem")).toHaveLength(2);
    expect(answer).toHaveTextContent("Checked attendance · GLM 5.3");
    expect(answer).not.toHaveTextContent("backup model");
    // Cleared for the follow-up, which is now labelled as one.
    expect(screen.getByRole("textbox", { name: "Follow-up question" })).toHaveValue("");
  });

  it("a follow-up sends the earlier turn so 'and A flight?' makes sense", async () => {
    const fetchMock = stubApi(json(reply("Ben Brook.")), json(reply("Nobody.")));
    render(<AssistantPage />);
    await ask("Who in B flight is missing parades?");
    await screen.findByRole("article", { name: "Who in B flight is missing parades?" });
    await ask("And A flight?", "Follow-up question");

    await screen.findByRole("article", { name: "And A flight?" });
    expect(sent(fetchMock, 1)).toEqual({
      question: "And A flight?",
      history: [
        { role: "user", content: "Who in B flight is missing parades?" },
        { role: "assistant", content: "Ben Brook." },
      ],
    });
    // Oldest first, as a chat reads.
    const turns = within(screen.getByRole("list", { name: "Conversation" })).getAllByRole("article");
    expect(turns.map((t) => t.getAttribute("aria-label"))).toEqual([
      "Who in B flight is missing parades?",
      "And A flight?",
    ]);
  });

  it("'New chat' clears the conversation so the next question has no history", async () => {
    const fetchMock = stubApi(json(reply("Ben Brook.")), json(reply("Sixty.")));
    render(<AssistantPage />);
    const user = await ask("Who is missing parades?");
    await user.click(await screen.findByRole("button", { name: "New chat" }));

    expect(screen.queryByRole("list", { name: "Conversation" })).not.toBeInTheDocument();
    expect(screen.getByText("Ask a question")).toBeInTheDocument();
    await ask("How many cadets?");
    await screen.findByRole("article", { name: "How many cadets?" });
    expect(sent(fetchMock, 1).history).toEqual([]);
  });

  it("an example question asks straight away", async () => {
    const fetchMock = stubApi(json(reply("Three.")));
    render(<AssistantPage />);
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Whose first aid expires in the next three months?" }));

    expect(await screen.findByRole("article", { name: /first aid/ })).toHaveTextContent("Three.");
    expect(sent(fetchMock, 0).question).toBe("Whose first aid expires in the next three months?");
  });

  it("says when a backup model answered, and when nothing was looked up", async () => {
    stubApi(json(reply("Hello.", { calls: [], model_label: "Groq gpt-oss-120b", fallback: true })));
    render(<AssistantPage />);
    await ask("Hi");

    expect(await screen.findByRole("article", { name: "Hi" })).toHaveTextContent(
      "Answered without checking the records · Groq gpt-oss-120b (backup model)"
    );
  });

  it("shows a loading placeholder while it looks things up, and can't be asked twice", async () => {
    let answer!: (r: Response) => void;
    stubApi(() => new Promise<Response>((resolve) => (answer = resolve)));
    render(<AssistantPage />);
    await ask("Who is missing parades?");

    const loading = screen.getByRole("region", { name: "Answer loading" });
    expect(loading).toHaveTextContent("Who is missing parades?");
    expect(screen.getByRole("button", { name: /Looking it up/ })).toBeDisabled();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();

    answer(new Response(JSON.stringify(reply("Ben."))));
    expect(await screen.findByRole("article", { name: "Who is missing parades?" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Answer loading" })).not.toBeInTheDocument();
  });

  it.each([
    [503, { detail: "The assistant is unavailable. Try again in a minute." }, "The assistant is unavailable"],
    [403, { detail: "Not authorised" }, "Not authorised"],
    [422, { detail: [{ msg: "String should have at most 2000 characters" }] }, "at most 2000 characters"],
    [500, "not json", "The assistant couldn't answer."],
  ])("an API %s shows its reason and keeps the question to retry", async (status, body, message) => {
    stubApi(() => new Response(typeof body === "string" ? body : JSON.stringify(body), { status }));
    render(<AssistantPage />);
    await ask("Who is missing parades?");

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.getByRole("textbox", { name: "Question" })).toHaveValue("Who is missing parades?");
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
  });

  it("an error body that arrives as a 200 is an error, not half an answer", async () => {
    stubApi(json({ detail: "proxy says no" }));
    render(<AssistantPage />);
    await ask("Who is missing parades?");

    expect(await screen.findByRole("alert")).toHaveTextContent("an answer it couldn't read");
  });

  it("the API being unreachable says so", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("Failed to fetch")))
    );
    render(<AssistantPage />);
    await ask("Who is missing parades?");

    expect(await screen.findByRole("alert")).toHaveTextContent("Server unreachable.");
  });

  it("a retry after an error clears the error", async () => {
    stubApi(json({ detail: "busy" }, 503), json(reply("Ben.")));
    render(<AssistantPage />);
    const user = await ask("Who is missing parades?");
    await screen.findByRole("alert");
    await user.click(screen.getByRole("button", { name: "Ask" }));

    await screen.findByRole("article", { name: "Who is missing parades?" });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("can't ask while signed out", () => {
    session = SIGNED_OUT;
    const fetchMock = stubApi(json(reply("x")));
    render(<AssistantPage />);

    expect(screen.getByRole("button", { name: "Ask" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /first aid/ })).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
