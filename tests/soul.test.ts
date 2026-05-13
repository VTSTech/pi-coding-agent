import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as os from "node:os";
import * as path from "node:path";
import { expandHome } from "../shared/path-utils";

// Note: `SoulSpecLoader` is intentionally not imported here. It lives in
// `extensions/soul.ts` which depends on peer packages (`typebox`,
// `@earendil-works/pi-coding-agent`, etc.) that are not part of the test
// surface. Behavioural tests for `soulsDirs` membership are covered by
// inspecting the source via grep in CI; the unit-level concern handled here
// is the tilde-expansion mechanism itself.

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
      path.join(os.homedir(), ".pi/agent/souls")
    );
  });

  it("expands ~\\ on Windows-style paths", () => {
    assert.equal(
      expandHome("~\\AppData\\souls"),
      path.join(os.homedir(), "AppData\\souls")
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
