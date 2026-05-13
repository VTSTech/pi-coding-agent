/**
 * Path manipulation helpers shared across extensions.
 */

import path from "path";
import os from "os";

/**
 * Expand a leading `~` segment to the current user's home directory.
 *
 * Neither `fs.existsSync` nor `path.resolve` perform tilde expansion — that is
 * a shell convenience, not a Node.js one. Configuration values written by
 * humans (e.g., `~/.pi/agent/souls`) need this helper before being passed to
 * any filesystem API, or they will be treated as literal paths containing the
 * character `~` and silently fail to resolve.
 *
 * Only the standalone `~` and `~/` (or `~\`) prefixes are expanded; `~user`
 * forms and mid-string `~` characters are passed through unchanged so they
 * fail the way the user expects rather than being silently rewritten.
 */
export function expandHome(p: string): string {
  if (p === "~") return os.homedir();
  if (p.startsWith("~/") || p.startsWith("~\\")) {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
}
