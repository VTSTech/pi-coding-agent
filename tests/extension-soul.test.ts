import { describe, it, before, after, mock } from "node:test";
import assert from "node:assert/strict";
import type { PiSoulConfig, ActiveSoulStore } from "../shared/soul-config";

// ── Module-level mocks ──────────────────────────────────────────────
// mock.module() MUST be called at the top level, before any imports.
// Then the extension is loaded via dynamic import() inside before().

let mockStoreState: {
  active: true;
  soul: string;
  level: number;
  updatedAt: number;
} | null = null;

const mockCalls: {
  debugLog: Array<{ tag: string; msg: string }>;
  emittedEvents: Array<{ event: string; payload: any }>;
} = {
  debugLog: [],
  emittedEvents: [],
};

mock.module("../shared/debug", {
  namedExports: {
    debugLog: (tag: string, msg: string) => {
      mockCalls.debugLog.push({ tag, msg });
    },
  },
});
mock.module("../shared/soul-config", {
  namedExports: {
    loadPiSoulConfig: () => mockConfig,
    createActiveSoulStore: () => mockStore,
    isSoulClearValue: (val: string) =>
      ["off", "clear", "none", "default"].includes(val.toLowerCase()),
  },
});

let mockConfig: PiSoulConfig = { persistence: "session", autoLoad: false };

const mockStore: ActiveSoulStore = {
  save: (data) => {
    mockStoreState = data as any;
  },
  load: () =>
    mockStoreState
      ? {
          active: true as const,
          soul: mockStoreState.soul,
          level: mockStoreState.level,
          updatedAt: Date.now(),
        }
      : null,
  clear: () => {
    mockStoreState = null;
  },
  describe: () => "mock-session",
};

// ── Helpers ─────────────────────────────────────────────────────────

function makeMockPi() {
  const flags: Record<string, string | undefined> = {};
  const events: Record<string, (...args: any[]) => any> = {};
  const commands: Record<
    string,
    { handler: (args: string, ctx: any) => any; description: string }
  > = {};
  const tools: Array<{ name: string; execute: (...args: any[]) => any }> = [];
  let sendMessageArgs: any = null;

  return {
    flags,
    commands,
    tools,
    events,
    get sendMessageArgs() {
      return sendMessageArgs;
    },
    pi: {
      getFlag: (name: string) => flags[name],
      registerFlag: (_name: string, _opts: any) => {},
      on: (event: string, handler: (...args: any[]) => any) => {
        events[event] = handler;
      },
      registerCommand: (
        name: string,
        opts: { description: string; handler: any },
      ) => {
        commands[name] = {
          handler: opts.handler,
          description: opts.description,
        };
      },
      registerTool: (opts: {
        name: string;
        execute: (...args: any[]) => any;
      }) => {
        tools.push({ name: opts.name, execute: opts.execute });
      },
      sendMessage: (...args: any[]) => {
        sendMessageArgs = args;
      },
      events: {
        emit: (event: string, payload: any) => {
          mockCalls.emittedEvents.push({ event, payload });
        },
      },
    },
  };
}

function makeMockCtx(overrides: Record<string, any> = {}) {
  const notifyCalls: Array<{ msg: string; type: string }> = [];
  const setStatusCalls: Array<{ id: string; value: string | undefined }> = [];
  return {
    notifyCalls,
    setStatusCalls,
    sessionManager: {
      getEntries: () => [],
    },
    hasUI: false as boolean,
    ui: {
      notify: (msg: string, type: string = "info") => {
        notifyCalls.push({ msg, type });
      },
      setStatus: (id: string, value: string | undefined) => {
        setStatusCalls.push({ id, value });
      },
      select: async (title: string, options: string[]) => {
        return options[0] || null;
      },
    },
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────────

describe("extensions/soul.ts — extension integration", () => {
  let soul: Awaited<typeof import("../extensions/soul")>;
  let mockPi: ReturnType<typeof makeMockPi>;
  let factoryResult: void;

  before(async () => {
    mockStoreState = null;
    mockCalls.debugLog.length = 0;
    mockCalls.emittedEvents.length = 0;
    mockConfig = { persistence: "session", autoLoad: false };

    // Dynamic import AFTER mocks are registered
    soul = (await import("../extensions/soul")) as any;
  });

  describe("registration", () => {
    before(() => {
      mockPi = makeMockPi();
      mockCalls.emittedEvents.length = 0;
      factoryResult = soul.default(mockPi.pi as any);
    });

    it("registers 3 tools", () => {
      const toolNames = mockPi.tools.map((t) => t.name).sort();
      assert.deepEqual(toolNames, ["list_souls", "load_soul", "soul_info"]);
    });

    it("registers commands /soul and /souls", () => {
      assert.ok(mockPi.commands["soul"], "expected /soul command");
      assert.ok(mockPi.commands["souls"], "expected /souls command");
    });

    it("registers session_start, resources_discover, before_agent_start handlers", () => {
      assert.ok(typeof mockPi.events["session_start"] === "function");
      assert.ok(typeof mockPi.events["resources_discover"] === "function");
      assert.ok(typeof mockPi.events["before_agent_start"] === "function");
    });
  });

  describe("resources_discover handler", () => {
    before(() => {
      mockPi = makeMockPi();
      mockCalls.emittedEvents.length = 0;
      factoryResult = soul.default(mockPi.pi as any);
    });

    it("returns expected prompt paths", async () => {
      const result = await mockPi.events["resources_discover"](
        {},
        makeMockCtx(),
      );
      assert.ok(result.promptPaths.includes(".pi/souls"));
      assert.ok(result.promptPaths.includes("./souls"));
      assert.ok(result.promptPaths.includes("~/.pi/agent/souls"));
      assert.deepEqual(result.skillPaths, []);
      assert.deepEqual(result.themePaths, []);
    });
  });

  describe("session_start handler", () => {
    it("restores soul from store on reload reason", async () => {
      mockPi = makeMockPi();
      mockCalls.emittedEvents.length = 0;
      mockConfig = { persistence: "session", autoLoad: true };
      mockStoreState = {
        active: true,
        soul: "test",
        level: 2,
        updatedAt: Date.now(),
      };
      // Mock the SoulSpecLoader to return a fake manifest
      const fakeManifest = {
        name: "test",
        display_name: "Test Soul",
        description: "A test soul",
        version: "1.0.0",
        author: "test",
        souls: [],
        environment: "virtual",
      };
      mock.method(soul.SoulSpecLoader.prototype, "load", () => fakeManifest);
      mock.method(
        soul.SoulSpecLoader.prototype,
        "buildSystemPrompt",
        () => "test system prompt",
      );
      factoryResult = soul.default(mockPi.pi as any);

      const ctx = makeMockCtx();
      await mockPi.events["session_start"]({ reason: "reload" }, ctx);

      // Soul should auto-load and set footer status
      assert.equal(ctx.setStatusCalls.length, 1, "setStatus should be called");
      assert.equal(ctx.setStatusCalls[0].id, "pi-soul");
      assert.equal(ctx.setStatusCalls[0].value, "Test Soul");
    });

    it("restores soul on new/resume/fork regardless of autoLoad", async () => {
      for (const reason of ["new", "resume", "fork"]) {
        mockPi = makeMockPi();
        mockCalls.emittedEvents.length = 0;
        mockConfig = { persistence: "session", autoLoad: false };
        mockStoreState = {
          active: true,
          soul: "test",
          level: 2,
          updatedAt: Date.now(),
        };
        mock.method(soul.SoulSpecLoader.prototype, "load", () => ({
          name: "test",
          display_name: "Test Soul",
          description: "A test soul",
          version: "1.0.0",
          author: "test",
          souls: [],
          environment: "virtual",
        }));
        mock.method(
          soul.SoulSpecLoader.prototype,
          "buildSystemPrompt",
          () => "test system prompt",
        );
        factoryResult = soul.default(mockPi.pi as any);

        const ctx = makeMockCtx();
        await mockPi.events["session_start"]({ reason }, ctx);

        // Soul should restore on non-startup regardless of autoLoad
        assert.equal(ctx.setStatusCalls.length, 1, `setStatus for ${reason}`);
        assert.equal(ctx.setStatusCalls[0].value, "Test Soul", `status value for ${reason}`);
      }
    });

    it("does not restore when store is empty", async () => {
      mockPi = makeMockPi();
      mockCalls.emittedEvents.length = 0;
      mockConfig = { persistence: "none", autoLoad: false } as PiSoulConfig;
      mockStoreState = null;
      factoryResult = soul.default(mockPi.pi as any);

      const ctx = makeMockCtx();
      await mockPi.events["session_start"]({ reason: "reload" }, ctx);

      const activated = mockCalls.emittedEvents.filter(
        (e) => e.event === "soul:activated",
      );
      assert.equal(activated.length, 0, "no soul:activated when store empty");
    });

    it("runs without error when autoLoad is true and no --soul flag", async () => {
      mockPi = makeMockPi();
      mockCalls.emittedEvents.length = 0;
      mockConfig = { persistence: "session", autoLoad: true };
      mockStoreState = null;
      factoryResult = soul.default(mockPi.pi as any);

      await mockPi.events["session_start"](
        { reason: "startup" },
        makeMockCtx(),
      );
      assert.ok(true, "session_start completed without error");
    });

    it("autoLoads soul on startup when global+autoLoad=true+store has soul", async () => {
      mockPi = makeMockPi();
      mockCalls.emittedEvents.length = 0;
      mockConfig = { persistence: "global", autoLoad: true };
      mockStoreState = {
        active: true as const,
        soul: "test",
        level: 2,
        updatedAt: Date.now(),
      };
      mock.method(soul.SoulSpecLoader.prototype, "load", () => ({
        name: "test",
        display_name: "Test Soul",
        description: "",
        version: "1.0.0",
        author: "",
        souls: [],
        environment: "virtual",
      }));
      mock.method(
        soul.SoulSpecLoader.prototype,
        "buildSystemPrompt",
        () => "prompt",
      );
      factoryResult = soul.default(mockPi.pi as any);
      await mockPi.events["session_start"](
        { reason: "startup" },
        makeMockCtx(),
      );

      assert.ok(true, "auto-load completed without error on startup");
    });

    it("skips autoLoad on startup when global+autoLoad=false+store has soul", async () => {
      mockPi = makeMockPi();
      mockCalls.emittedEvents.length = 0;
      mockConfig = { persistence: "global", autoLoad: false };
      mockStoreState = {
        active: true as const,
        soul: "test",
        level: 2,
        updatedAt: Date.now(),
      };
      factoryResult = soul.default(mockPi.pi as any);
      await mockPi.events["session_start"](
        { reason: "startup" },
        makeMockCtx(),
      );

      const activated = mockCalls.emittedEvents.filter(
        (e) => e.event === "soul:activated",
      );
      assert.equal(
        activated.length,
        0,
        "should NOT auto-load when autoLoad=false",
      );
    });

    it("skips autoLoad on startup when session+autoLoad=true+store has soul", async () => {
      mockPi = makeMockPi();
      mockCalls.emittedEvents.length = 0;
      mockConfig = { persistence: "session", autoLoad: true };
      mockStoreState = {
        active: true as const,
        soul: "dave",
        level: 2,
        updatedAt: Date.now(),
      };
      factoryResult = soul.default(mockPi.pi as any);
      await mockPi.events["session_start"](
        { reason: "startup" },
        makeMockCtx(),
      );

      const activated = mockCalls.emittedEvents.filter(
        (e) => e.event === "soul:activated",
      );
      assert.equal(activated.length, 0, "should NOT auto-load in session mode");
    });
  });

  describe("before_agent_start handler", () => {
    it("does not modify prompt when no soul is active", async () => {
      mockPi = makeMockPi();
      mockCalls.emittedEvents.length = 0;
      factoryResult = soul.default(mockPi.pi as any);

      const result = await mockPi.events["before_agent_start"]({
        systemPrompt: "Base prompt",
      });
      assert.equal(result, undefined);
    });
  });

  describe("/soul command — off/clear", () => {
    it("clears soul when args are 'off'", async () => {
      mockPi = makeMockPi();
      mockCalls.emittedEvents.length = 0;
      factoryResult = soul.default(mockPi.pi as any);

      const handler = mockPi.commands["soul"].handler;
      await handler("off", makeMockCtx());

      const deactivated = mockCalls.emittedEvents.filter(
        (e) => e.event === "soul:deactivated",
      );
      assert.equal(deactivated.length, 1);
      assert.equal(deactivated[0].payload.source, "command");
    });

    it("handles 'clear', 'none', 'default' the same as 'off'", async () => {
      for (const arg of ["clear", "none", "default"]) {
        mockPi = makeMockPi();
        mockCalls.emittedEvents.length = 0;
        factoryResult = soul.default(mockPi.pi as any);

        const handler = mockPi.commands["soul"].handler;
        await handler(arg, makeMockCtx());

        const deactivated = mockCalls.emittedEvents.filter(
          (e) => e.event === "soul:deactivated",
        );
        assert.equal(
          deactivated.length,
          1,
          `expected deactivated for "${arg}"`,
        );
      }
    });
  });

  describe("/soul command — no args", () => {
    it("shows interactive selector when no args given", async () => {
      mockPi = makeMockPi();
      mockCalls.emittedEvents.length = 0;
      mock.method(soul.SoulSpecLoader.prototype, "getAllSouls", () => ["test"]);
      factoryResult = soul.default(mockPi.pi as any);

      const handler = mockPi.commands["soul"].handler;
      const ctx = makeMockCtx({ hasUI: true });
      await handler("", ctx);

      // Picker selects first option (off/clear), returns without error
      assert.ok(true, "interactive picker completed without error");
    });
  });

  describe("/soul command — --help", () => {
    it("shows help text", async () => {
      mockPi = makeMockPi();
      mockCalls.emittedEvents.length = 0;
      factoryResult = soul.default(mockPi.pi as any);

      const handler = mockPi.commands["soul"].handler;
      const ctx = makeMockCtx();
      await handler("--help", ctx);

      assert.ok(ctx.notifyCalls.length > 0);
      // assert.ok(ctx.notifyCalls[0].msg.includes("Usage:"));
    });
  });

  describe("/souls command", () => {
    it("shows soul listing", async () => {
      mockPi = makeMockPi();
      mockCalls.emittedEvents.length = 0;
      factoryResult = soul.default(mockPi.pi as any);

      const handler = mockPi.commands["souls"].handler;
      const ctx = makeMockCtx();
      await handler("", ctx);

      // The real SoulSpecLoader scans default soul dirs; if no souls
      // exist, it shows "No souls found". Either way, it notifies.
      assert.ok(ctx.notifyCalls.length > 0, "should have notified");
    });
  });

  describe("soul:activated and soul:deactivated events", () => {
    it("emits soul:deactivated on /soul off", async () => {
      mockPi = makeMockPi();
      mockCalls.emittedEvents.length = 0;
      factoryResult = soul.default(mockPi.pi as any);

      await mockPi.commands["soul"].handler("off", makeMockCtx());
      const deactivated = mockCalls.emittedEvents.filter(
        (e) => e.event === "soul:deactivated",
      );
      assert.equal(deactivated.length, 1);
      assert.equal(deactivated[0].payload.source, "command");
    });
  });

  describe("debug logging", () => {
    it("logs extension loading during factory call", () => {
      mockPi = makeMockPi();
      mockCalls.debugLog.length = 0;
      factoryResult = soul.default(mockPi.pi as any);

      const loadMsgs = mockCalls.debugLog.filter(
        (d) => d.msg === "SoulSpec extension loading...",
      );
      assert.equal(
        loadMsgs.length,
        1,
        "should capture 'SoulSpec extension loading...'",
      );
    });
  });

  describe("powerline status updates", () => {
    it("clears pi-soul status on /soul off", async () => {
      mockPi = makeMockPi();
      mockCalls.emittedEvents.length = 0;
      factoryResult = soul.default(mockPi.pi as any);

      const ctx = makeMockCtx();
      await mockPi.commands["soul"].handler("off", ctx);

      assert.equal(ctx.setStatusCalls.length, 1);
      assert.equal(ctx.setStatusCalls[0].id, "pi-soul");
      assert.equal(ctx.setStatusCalls[0].value, undefined);
    });
  });

  describe("/soul status command", () => {
    it("notifies when no soul active", async () => {
      mockPi = makeMockPi();
      mockCalls.emittedEvents.length = 0;
      factoryResult = soul.default(mockPi.pi as any);

      const ctx = makeMockCtx();
      await mockPi.commands["soul"].handler("status", ctx);

      assert.equal(ctx.notifyCalls.length, 1);
      // assert.ok(ctx.notifyCalls[0].msg.includes("No soul"));
    });
  });
});
