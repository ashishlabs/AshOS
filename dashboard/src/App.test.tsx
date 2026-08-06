import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "./App";

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  } as Response;
}

type Handler = (url: URL, init?: RequestInit) => unknown;

function createFetchMock(handlers: Record<string, Handler>) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = typeof input === "string" ? input : input.toString();
    const url = new URL(raw, "http://localhost");
    const method = (init?.method ?? "GET").toUpperCase();
    const key = `${method} ${url.pathname.replace(/^\/api/, "")}`;
    const handler = handlers[key];
    if (!handler) {
      throw new Error(`Unhandled fetch in test: ${key}${url.search}`);
    }
    const result = handler(url, init);
    if (result && typeof result === "object" && "ok" in (result as Record<string, unknown>) && "status" in (result as Record<string, unknown>)) {
      return result as Response;
    }
    return jsonResponse(result);
  });
}

/** Every fetch the app makes on first mount (Dashboard is the default tab) — TodaysFocusCard, ReflectionCard, DashboardTab, and the always-mounted StatusPill. Tests override only what they care about. */
function defaultHandlers(): Record<string, Handler> {
  return {
    "GET /health": () => ({ ok: true, provider: "mock" }),
    "GET /events": () => [],
    "GET /inbox": () => [],
    "GET /innovation/opportunities": () => [],
    "GET /memory": () => [],
    "GET /reflect": () => jsonResponse(null, 404),
    "GET /vault": () => [],
    "GET /search": () => []
  };
}

async function selectNavTab(name: string) {
  const user = userEvent.setup();
  const nav = screen.getByRole("navigation");
  await user.click(within(nav).getByRole("button", { name }));
  return user;
}

function mainRegion() {
  return screen.getByRole("main");
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("App — Dashboard tab", () => {
  it("renders health, today's focus, and reflection once data loads", async () => {
    vi.stubGlobal("fetch", createFetchMock(defaultHandlers()));

    render(<App />);

    expect(await screen.findByText("Today's Focus")).toBeInTheDocument();
    expect(await screen.findAllByText("mock")).not.toHaveLength(0);
    expect(await screen.findByText("Nothing unread.")).toBeInTheDocument();
    expect(await screen.findByText("No opportunities discovered yet.")).toBeInTheDocument();
    expect(await screen.findByText("None — nice work.")).toBeInTheDocument();
    expect(await screen.findByText(/No daily reflection saved yet today/)).toBeInTheDocument();
    expect(await screen.findByText(/No events yet/)).toBeInTheDocument();
  });

  it("shows an API-unreachable error when health fails", async () => {
    vi.stubGlobal(
      "fetch",
      createFetchMock({
        ...defaultHandlers(),
        "GET /health": () => jsonResponse({ error: "boom" }, 500)
      })
    );

    render(<App />);

    expect(await screen.findByText(/Could not load from the AshOS API/)).toBeInTheDocument();
  });
});

describe("App — Inbox tab", () => {
  it("captures a new item and lists it", async () => {
    const items: Record<string, unknown>[] = [];
    vi.stubGlobal(
      "fetch",
      createFetchMock({
        ...defaultHandlers(),
        "GET /inbox": () => [...items],
        "POST /inbox": (_url, init) => {
          const body = JSON.parse(String(init?.body));
          const item = {
            id: `inbox-${items.length + 1}`,
            content: body.content,
            sourceType: "text",
            status: "unread",
            tags: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
          items.push(item);
          return item;
        }
      })
    );

    render(<App />);
    const user = await selectNavTab("Inbox");

    expect(await screen.findByText("Nothing captured yet.")).toBeInTheDocument();

    const input = screen.getByPlaceholderText("Capture a note, link, or idea...");
    await user.type(input, "Read about SM-2 spaced repetition");
    await user.click(screen.getByRole("button", { name: "Capture" }));

    expect(await screen.findByText("Read about SM-2 spaced repetition")).toBeInTheDocument();
    expect(input).toHaveValue("");
  });
});

describe("App — Vault tab", () => {
  it("creates a note and lists it", async () => {
    const notes: Record<string, unknown>[] = [];
    vi.stubGlobal(
      "fetch",
      createFetchMock({
        ...defaultHandlers(),
        "GET /vault": () => [...notes],
        "POST /vault": (_url, init) => {
          const body = JSON.parse(String(init?.body));
          const note = {
            id: `vault-${notes.length + 1}`,
            title: body.title,
            content: body.content,
            tags: [],
            links: [],
            status: "active",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
          notes.push(note);
          return note;
        }
      })
    );

    render(<App />);
    const user = await selectNavTab("Vault");

    expect(await screen.findByText("Nothing in the vault yet.")).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("Note title..."), "Second Brain notes");
    await user.type(screen.getByPlaceholderText("Note content..."), "Everything reuses MemoryManager.");
    await user.click(screen.getByRole("button", { name: "Create note" }));

    expect(await screen.findByText("Second Brain notes")).toBeInTheDocument();
  });
});

describe("App — Search tab", () => {
  it("runs a search and renders results", async () => {
    vi.stubGlobal(
      "fetch",
      createFetchMock({
        ...defaultHandlers(),
        "GET /search": (url) => {
          expect(url.searchParams.get("q")).toBe("spaced repetition");
          return [
            {
              source: "vault",
              id: "vault-1",
              title: "Second Brain notes",
              snippet: "Everything reuses MemoryManager.",
              tags: [],
              createdAt: new Date().toISOString(),
              score: 0.92
            }
          ];
        }
      })
    );

    render(<App />);
    const user = await selectNavTab("Search");

    await user.type(screen.getByPlaceholderText("Find everything about..."), "spaced repetition");
    await user.click(within(mainRegion()).getByRole("button", { name: "Search" }));

    expect(await screen.findByText("Second Brain notes")).toBeInTheDocument();
    expect(screen.getByText("0.92")).toBeInTheDocument();
  });

  it("shows an empty state for no matches", async () => {
    vi.stubGlobal("fetch", createFetchMock({ ...defaultHandlers(), "GET /search": () => [] }));

    render(<App />);
    const user = await selectNavTab("Search");

    await user.type(screen.getByPlaceholderText("Find everything about..."), "nothing here");
    await user.click(within(mainRegion()).getByRole("button", { name: "Search" }));

    expect(await screen.findByText('No results for "nothing here".')).toBeInTheDocument();
  });
});

describe("App — Timeline tab", () => {
  it("merges events and memory records into one feed, newest first", async () => {
    vi.stubGlobal(
      "fetch",
      createFetchMock({
        ...defaultHandlers(),
        "GET /events": () => [
          { name: "task:completed", timestamp: "2026-08-05T10:00:00.000Z", payload: { title: "Write tests" } }
        ],
        "GET /memory": () => [
          {
            id: "m1",
            scope: "global",
            key: "note",
            value: { a: 1 },
            tags: [],
            createdAt: "2026-08-06T10:00:00.000Z"
          }
        ]
      })
    );

    render(<App />);
    await selectNavTab("Timeline");

    expect(await screen.findByText(/task:completed — Write tests/)).toBeInTheDocument();
    expect(await screen.findByText("global · note")).toBeInTheDocument();

    const items = await within(mainRegion()).findAllByRole("listitem");
    const texts = items.map((li) => li.textContent ?? "");
    const memoryIndex = texts.findIndex((t) => t.includes("global · note"));
    const eventIndex = texts.findIndex((t) => t.includes("task:completed"));
    expect(memoryIndex).toBeGreaterThanOrEqual(0);
    expect(eventIndex).toBeGreaterThan(memoryIndex);
  });

  it("filters by keyword", async () => {
    vi.stubGlobal(
      "fetch",
      createFetchMock({
        ...defaultHandlers(),
        "GET /events": () => [
          { name: "task:completed", timestamp: "2026-08-05T10:00:00.000Z", payload: { title: "Write tests" } },
          { name: "task:completed", timestamp: "2026-08-05T11:00:00.000Z", payload: { title: "Ship feature" } }
        ]
      })
    );

    render(<App />);
    const user = await selectNavTab("Timeline");

    await screen.findByText(/Write tests/);
    await user.type(screen.getByPlaceholderText("Filter by keyword..."), "Ship");

    await waitFor(() => {
      expect(screen.queryByText(/Write tests/)).not.toBeInTheDocument();
    });
    expect(screen.getByText(/Ship feature/)).toBeInTheDocument();
  });
});
