import { describe, it, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs";
import { expandHome } from "../shared/path-utils";
import {
  createActiveSoulStore,
  GlobalFileActiveSoulStore,
  isSoulClearValue,
  loadPiSoulConfig,
  MemoryActiveSoulStore,
  PI_SOUL_DEFAULTS,
} from "../shared/soul-config";
// Note: `SoulSpecLoader` and the extension factory are intentionally not
// imported here. They live in `extensions/soul.ts` which depends on peer
// packages (`typebox`, `@earendil-works/pi-coding-agent`, etc.) that are
// not part of the test surface. Behavioural tests for `soulsDirs`
// membership and extension-level behaviour are covered separately.
// The unit-level concerns tested here are tilde-expansion and the
// configurable soul-config helpers introduced in this PR.

// ============================================================================
// expandHome
// ============================================================================

describe("expandHome", () => {
  it("expands a bare ~ to the user's home directory", () => {
    assert.equal(expandHome("~"), os.homedir());
  });

  it("expands ~/ at the start of a path", () => {
    assert.equal(
      expandHome("~/.pi/agent/souls"),
      path.join(os.homedir(), ".pi/agent/souls"),
    );
  });

  it("expands ~\\ on Windows-style paths", () => {
    assert.equal(
      expandHome("~\\AppData\\souls"),
      path.join(os.homedir(), "AppData\\souls"),
    );
  });

  it("passes absolute paths through unchanged", () => {
    assert.equal(expandHome("/etc/passwd"), "/etc/passwd");
  });

  it("passes relative paths through unchanged", () => {
    assert.equal(expandHome("./souls"), "./souls");
    assert.equal(expandHome(".pi/souls"), ".pi/souls");
  });

  it("does not expand ~user style paths (only ~ and ~/)", () => {
    // We deliberately do not expand `~user` — Node has no resolver for it
    // and silently rewriting would mask user errors.
    assert.equal(expandHome("~user/souls"), "~user/souls");
  });

  it("does not modify paths where ~ appears mid-string", () => {
    assert.equal(expandHome("/tmp/~backup"), "/tmp/~backup");
    assert.equal(expandHome("./foo~bar"), "./foo~bar");
  });
});

// ============================================================================
// expandHome — end-to-end via a real temp directory
// ============================================================================

describe("expandHome — resolves to a real readable directory", () => {
  it("resolves ~ to a path that exists on disk", async () => {
    const fs = await import("node:fs");
    assert.ok(fs.existsSync(expandHome("~")), "home directory should exist");
  });

  it("resolves ~/<segment> to the same path as path.join(os.homedir(), segment)", () => {
    const cases = [
      "~/.pi/agent/souls",
      "~/.openclaw/souls/clawsouls",
      "~/some/deep/nested/path",
    ];
    for (const c of cases) {
      const expected = path.join(os.homedir(), c.slice(2));
      assert.equal(expandHome(c), expected, `case: ${c}`);
    }
  });
});

// ============================================================================
// loadPiSoulConfig
// ============================================================================

describe("loadPiSoulConfig", () => {
  let tmpDir: string;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-soul-cfg-test-"));
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns defaults when no config files exist", () => {
    const config = loadPiSoulConfig({
      globalSoulConfigPath: path.join(tmpDir, "missing-global.json"),
      projectSoulConfigPath: path.join(tmpDir, "missing-project.json"),
    });

    assert.deepEqual(config, PI_SOUL_DEFAULTS);
  });

  it("returns defaults when piSoul key is absent from settings", () => {
    const settingsPath = path.join(tmpDir, "settings-nosoul.json");
    fs.writeFileSync(settingsPath, JSON.stringify({ theme: "dark" }), "utf-8");

    const config = loadPiSoulConfig({
      globalSoulConfigPath: settingsPath,
      projectSoulConfigPath: path.join(tmpDir, "missing-project.json"),
    });

    assert.deepEqual(config, PI_SOUL_DEFAULTS);
  });

  it("warns and returns defaults when settings JSON is malformed", () => {
    const settingsPath = path.join(tmpDir, "settings-malformed.json");
    fs.writeFileSync(settingsPath, "{ not valid json", "utf-8");
    const originalWarn = console.warn;
    const warnings: string[] = [];
    console.warn = (message?: unknown) => {
      warnings.push(String(message));
    };

    try {
      const config = loadPiSoulConfig({
        globalSoulConfigPath: settingsPath,
        projectSoulConfigPath: path.join(tmpDir, "missing-project.json"),
      });

      assert.deepEqual(config, PI_SOUL_DEFAULTS);
      assert.ok(
        warnings.some((warning) =>
          warning.includes("Failed to read config file"),
        ),
        "expected malformed settings warning",
      );
    } finally {
      console.warn = originalWarn;
    }
  });

  it("reads persistence and autoLoad from global settings", () => {
    const settingsPath = path.join(tmpDir, "settings-global.json");
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({ piSoul: { persistence: "none", autoLoad: false } }),
      "utf-8",
    );

    const config = loadPiSoulConfig({
      globalSoulConfigPath: settingsPath,
      projectSoulConfigPath: path.join(tmpDir, "missing-project.json"),
    });

    assert.equal(config.persistence, "none");
    assert.equal(config.autoLoad, false);
  });

  it("project config shallow-overrides global config", () => {
    const globalPath = path.join(tmpDir, "settings-global-merge.json");
    const projectPath = path.join(tmpDir, "settings-project-merge.json");
    fs.writeFileSync(
      globalPath,
      JSON.stringify({ piSoul: { persistence: "global", autoLoad: true } }),
      "utf-8",
    );
    fs.writeFileSync(
      projectPath,
      JSON.stringify({ piSoul: { persistence: "session" } }),
      "utf-8",
    );

    const config = loadPiSoulConfig({
      globalSoulConfigPath: globalPath,
      projectSoulConfigPath: projectPath,
    });

    assert.equal(config.persistence, "session");
    assert.equal(config.autoLoad, true);
  });

  it("invalid persistence falls back to default global", () => {
    const settingsPath = path.join(tmpDir, "settings-invalid-persistence.json");
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({ piSoul: { persistence: "bad-value", autoLoad: false } }),
      "utf-8",
    );

    const config = loadPiSoulConfig({
      globalSoulConfigPath: settingsPath,
      projectSoulConfigPath: path.join(tmpDir, "missing-project.json"),
    });

    assert.equal(config.persistence, "global");
    assert.equal(config.autoLoad, false);
  });

  it("invalid autoLoad falls back to default true", () => {
    const settingsPath = path.join(tmpDir, "settings-invalid-autoload.json");
    fs.writeFileSync(
      settingsPath,
      JSON.stringify({ piSoul: { persistence: "session", autoLoad: "yes" } }),
      "utf-8",
    );

    const config = loadPiSoulConfig({
      globalSoulConfigPath: settingsPath,
      projectSoulConfigPath: path.join(tmpDir, "missing-project.json"),
    });

    assert.equal(config.persistence, "session");
    assert.equal(config.autoLoad, true);
  });

  it("accepts all valid persistence values", () => {
    for (const persistence of ["global", "session", "none"] as const) {
      const settingsPath = path.join(tmpDir, `settings-${persistence}.json`);
      fs.writeFileSync(
        settingsPath,
        JSON.stringify({ piSoul: { persistence } }),
        "utf-8",
      );

      const config = loadPiSoulConfig({
        globalSoulConfigPath: settingsPath,
        projectSoulConfigPath: path.join(tmpDir, "missing-project.json"),
      });

      assert.equal(config.persistence, persistence);
    }
  });

  it("reads flat format without piSoul wrapper (new format)", () => {
    const configPath = path.join(tmpDir, "soul-flat.json");
    fs.writeFileSync(
      configPath,
      JSON.stringify({ persistence: "session", autoLoad: false }),
      "utf-8",
    );
    const config = loadPiSoulConfig({
      globalSoulConfigPath: configPath,
      projectSoulConfigPath: path.join(tmpDir, "missing-proj.json"),
    });
    assert.equal(config.persistence, "session");
    assert.equal(config.autoLoad, false);
  });

  it("creates default config file when missing", () => {
    const configPath = path.join(tmpDir, "auto-created.json");
    assert.equal(fs.existsSync(configPath), false, "precondition");
    const config = loadPiSoulConfig({
      globalSoulConfigPath: configPath,
      projectSoulConfigPath: path.join(tmpDir, "missing-proj.json"),
    });
    assert.deepEqual(config, PI_SOUL_DEFAULTS);
    assert.ok(fs.existsSync(configPath), "file should be created");
    const raw = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    assert.equal(raw.persistence, "global");
    assert.equal(raw.autoLoad, true);
  });
});

describe("isSoulClearValue", () => {
  it("returns true for clear values case-insensitively", () => {
    for (const value of ["off", "clear", "none", "default", "OFF", "Clear"]) {
      assert.ok(isSoulClearValue(value), `Expected ${value} to clear a soul`);
    }
  });

  it("returns false for soul names and empty string", () => {
    for (const value of ["assistant", "dev", "my-custom-soul", ""]) {
      assert.equal(isSoulClearValue(value), false);
    }
  });
});

// ============================================================================
// GlobalFileActiveSoulStore
// ============================================================================

describe("GlobalFileActiveSoulStore", () => {
  let tmpDir: string;
  let soulFilePath: string;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-soul-global-test-"));
    soulFilePath = path.join(tmpDir, ".active-soul.json");
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("load returns null when file does not exist", () => {
    const store = new GlobalFileActiveSoulStore(soulFilePath);
    assert.equal(store.load(), null);
  });

  it("save writes and load returns the soul file state", () => {
    const store = new GlobalFileActiveSoulStore(soulFilePath);
    store.save({ active: true, soul: "test-soul", level: 2, updatedAt: 12345 });

    assert.ok(fs.existsSync(soulFilePath));
    const loaded = store.load();
    assert.ok(loaded);
    assert.equal(loaded.soul, "test-soul");
    assert.equal(loaded.level, 2);
    assert.equal(loaded.active, true);
  });

  it("save defaults level to 2 when not provided", () => {
    const store = new GlobalFileActiveSoulStore(soulFilePath);
    store.save({ active: true, soul: "test-soul", updatedAt: 12345 });

    const raw = JSON.parse(fs.readFileSync(soulFilePath, "utf-8")) as {
      level: number;
    };
    assert.equal(raw.level, 2);
  });

  it("clear deletes the file and is idempotent", () => {
    const store = new GlobalFileActiveSoulStore(soulFilePath);
    store.save({ active: true, soul: "test-soul", level: 2, updatedAt: 12345 });
    assert.ok(fs.existsSync(soulFilePath));

    store.clear();
    assert.equal(fs.existsSync(soulFilePath), false);
    assert.doesNotThrow(() => store.clear());
  });

  it("load returns null when file has no soul field", () => {
    const store = new GlobalFileActiveSoulStore(soulFilePath);
    fs.writeFileSync(soulFilePath, JSON.stringify({ level: 2 }), "utf-8");

    assert.equal(store.load(), null);
    fs.unlinkSync(soulFilePath);
  });
});

// ============================================================================
// MemoryActiveSoulStore
// ============================================================================

describe("MemoryActiveSoulStore", () => {
  it("starts empty, saves state, and clears state", () => {
    const store = new MemoryActiveSoulStore();
    const state = {
      active: true,
      soul: "test-soul",
      level: 3,
      updatedAt: 99999,
    };

    assert.equal(store.load(), null);
    store.save(state);
    assert.deepEqual(store.load(), state);
    store.clear();
    assert.equal(store.load(), null);
  });

  it("independent instances do not share state", () => {
    const a = new MemoryActiveSoulStore();
    const b = new MemoryActiveSoulStore();

    a.save({ active: true, soul: "soul-a", level: 2, updatedAt: 1 });

    assert.equal(b.load(), null);
  });
});

// ============================================================================
// SessionActiveSoulStore
// ============================================================================

// ============================================================================
// GlobalFileActiveSoulStore — session mode
// ============================================================================

describe("GlobalFileActiveSoulStore — session mode", () => {
  let tmpDir: string;
  let soulFilePath: string;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-soul-session-test-"));
    soulFilePath = path.join(tmpDir, ".active-soul.json");
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  afterEach(() => {
    try {
      fs.unlinkSync(soulFilePath);
    } catch {
      // File may already be deleted by the test
    }
  });

  it("save writes to sessions[] and load finds by cwd", () => {
    const store = new GlobalFileActiveSoulStore(soulFilePath, "session");
    store.save({
      active: true,
      soul: "session-soul",
      level: 2,
      updatedAt: 12345,
    });

    const loaded = store.load();
    assert.ok(loaded);
    assert.equal(loaded.soul, "session-soul");
  });

  it("load returns null when sessions[] is missing", () => {
    // Write only top-level fields (no sessions array)
    fs.writeFileSync(
      soulFilePath,
      JSON.stringify({ soul: "old-soul", level: 2, updatedAt: 100 }),
      "utf-8",
    );
    const store = new GlobalFileActiveSoulStore(soulFilePath, "session");
    assert.equal(store.load(), null);
  });

  it("load returns null when sessions[] is empty", () => {
    fs.writeFileSync(
      soulFilePath,
      JSON.stringify({ soul: "old-soul", sessions: [] }),
      "utf-8",
    );
    const store = new GlobalFileActiveSoulStore(soulFilePath, "session");
    assert.equal(store.load(), null);
  });

  it("different cwd does not match", () => {
    // Write a session entry for a different path
    fs.writeFileSync(
      soulFilePath,
      JSON.stringify({
        sessions: [
          {
            path: "/tmp/some-other-dir",
            soul: "other",
            level: 2,
            updatedAt: 100,
          },
        ],
      }),
      "utf-8",
    );
    const store = new GlobalFileActiveSoulStore(soulFilePath, "session");
    assert.equal(store.load(), null);
  });

  it("clear removes cwd entry and subsequent load returns null", () => {
    const store = new GlobalFileActiveSoulStore(soulFilePath, "session");
    store.save({ active: true, soul: "to-clear", level: 2, updatedAt: 100 });
    assert.ok(store.load());

    store.clear();
    assert.equal(store.load(), null);
  });

  it("clear does not affect other cwd entries", () => {
    const store = new GlobalFileActiveSoulStore(soulFilePath, "session");
    store.save({ active: true, soul: "my-soul", level: 1, updatedAt: 100 });

    // Manually add a second session entry for a different path
    const raw = JSON.parse(fs.readFileSync(soulFilePath, "utf-8"));
    raw.sessions.push({
      path: "/other/project",
      soul: "other-soul",
      level: 3,
      updatedAt: 200,
    });
    fs.writeFileSync(soulFilePath, JSON.stringify(raw, null, 2), "utf-8");

    // Clear for current cwd
    store.clear();
    assert.equal(store.load(), null);

    // Other entry should remain
    const after = JSON.parse(fs.readFileSync(soulFilePath, "utf-8"));
    assert.equal(after.sessions.length, 1);
    assert.equal(after.sessions[0].soul, "other-soul");
  });

  it("session mode preserves backward-compatible file structure", () => {
    // Write a file with top-level soul (simulating prior global mode)
    fs.writeFileSync(
      soulFilePath,
      JSON.stringify({ soul: "prior-global", level: 2, updatedAt: 50 }),
      "utf-8",
    );

    // Save in session mode — should preserve existing top-level fields
    const store = new GlobalFileActiveSoulStore(soulFilePath, "session");
    store.save({
      active: true,
      soul: "session-soul",
      level: 3,
      updatedAt: 100,
    });

    // File should have both top-level fields AND sessions[]
    const raw = JSON.parse(fs.readFileSync(soulFilePath, "utf-8"));
    assert.equal(raw.soul, "prior-global", "top-level soul preserved");
    assert.equal(raw.level, 2, "top-level level preserved");
    assert.equal(raw.updatedAt, 50, "top-level updatedAt preserved");
    assert.ok(Array.isArray(raw.sessions), "sessions array present");
    assert.equal(raw.sessions.length, 1);
    assert.equal(raw.sessions[0].soul, "session-soul");
  });

  it("load returns null when file does not exist", () => {
    const store = new GlobalFileActiveSoulStore(soulFilePath, "session");
    assert.equal(store.load(), null);
  });
});

// ============================================================================
// createActiveSoulStore
// ============================================================================

describe("createActiveSoulStore", () => {
  it("returns the correct store for each persistence mode", () => {
    assert.ok(
      createActiveSoulStore({
        persistence: "global",
        autoLoad: true,
      }) instanceof GlobalFileActiveSoulStore,
    );
    assert.ok(
      createActiveSoulStore({
        persistence: "session",
        autoLoad: true,
      }) instanceof GlobalFileActiveSoulStore,
    );
    assert.ok(
      createActiveSoulStore({ persistence: "none", autoLoad: false }) instanceof
        MemoryActiveSoulStore,
    );
  });
});
