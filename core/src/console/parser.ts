/**
 * core/console/parser — parse dòng lệnh `averon ...` (thuần, dễ test).
 * EN: core/console/parser — parse `averon ...` command lines (pure).
 *
 * Grammar (prefix `averon` tùy chọn — gõ thẳng `status` cũng được):
 *   status
 *   help
 *   -help | -h                 (quick: shorthand cho 'help')
 *   modules list
 *   modules status
 *   modules load <name>
 *   modules unload <name> [--force]
 *   modules reload <name> [--force]
 * `averon <command>` vẫn hợp lệ (optional prefix, backward-compatible).
 * `--force` chỉ hợp lệ cho unload/reload (KHÔNG cho load).
 */
export type ConsoleCommand =
  | { kind: 'status' }
  | { kind: 'modulesList' }
  | { kind: 'modulesStatus' }
  | { kind: 'modulesLoad'; module: string }
  | { kind: 'modulesUnload'; module: string; force: boolean }
  | { kind: 'modulesReload'; module: string; force: boolean }
  | { kind: 'help' };

export type ParseResult = { ok: true; command: ConsoleCommand } | { ok: false; error: string };

const SUBCOMMANDS: ReadonlySet<string> = new Set(['list', 'status', 'load', 'unload', 'reload']);
const ACTION_WITH_NAME: ReadonlySet<string> = new Set(['load', 'unload', 'reload']);

export function parseConsoleCommand(line: string): ParseResult {
  const trimmed = line.trim();
  if (!trimmed) return { ok: false, error: 'empty input' };

  const tokens = trimmed.split(/\s+/);

  // Quick command: gõ thẳng `-help` / `-h` không cần prefix.
  // EN: Quick commands — bare `-help` / `-h`, no prefix needed.
  if (tokens[0] === '-help' || tokens[0] === '-h') {
    if (tokens.length > 1) return { ok: false, error: `'${tokens[0]}' takes no arguments — got: ${tokens.slice(1).join(' ')}` };
    return { ok: true, command: { kind: 'help' } };
  }

  // Prefix `averon` TÙY CHỌN: gõ thẳng `status` / `modules list`, hoặc `averon status` đều được.
  // EN: `averon` prefix is OPTIONAL — bare `status` / `modules list` work, `averon status` still does.
  const rest = tokens[0] === 'averon' ? tokens.slice(1) : tokens;
  if (rest.length === 0) {
    return tokens[0] === 'averon'
      ? { ok: false, error: 'missing command — try "help"' }
      : { ok: false, error: 'empty input' };
  }

  const [head, ...tail] = rest;

  if (head === 'status') {
    if (tail.length > 0) return { ok: false, error: `'status' takes no arguments — got: ${tail.join(' ')}` };
    return { ok: true, command: { kind: 'status' } };
  }
  if (head === 'help') {
    if (tail.length > 0) return { ok: false, error: `'help' takes no arguments — got: ${tail.join(' ')}` };
    return { ok: true, command: { kind: 'help' } };
  }
  if (head === 'modules') {
    if (tail.length === 0) return { ok: false, error: "missing subcommand — try 'modules list' or 'modules status'" };
    const [sub, ...rest2] = tail;
    if (!SUBCOMMANDS.has(sub)) {
      return { ok: false, error: `unknown subcommand '${sub}' — valid: ${[...SUBCOMMANDS].join(' | ')}` };
    }
    if (sub === 'list' || sub === 'status') {
      if (rest2.length > 0) return { ok: false, error: `'modules ${sub}' takes no arguments — got: ${rest2.join(' ')}` };
      return { ok: true, command: { kind: sub === 'list' ? 'modulesList' : 'modulesStatus' } };
    }
    // load | unload | reload: cần <name> [--force]
    if (!ACTION_WITH_NAME.has(sub)) return { ok: false, error: `internal: unexpected subcommand '${sub}'` };

    const name = rest2[0];
    if (!name) return { ok: false, error: `missing module name — try 'modules ${sub} <name>${sub !== 'load' ? ' [--force]' : ''}'` };
    const forceToken = rest2[1];
    const extra = rest2[2];
    if (extra) return { ok: false, error: `too many arguments — got: ${rest2.join(' ')}` };

    if (sub === 'load') {
      if (forceToken === '--force') return { ok: false, error: '`--force` is not valid for load (only unload/reload)' };
      if (forceToken) return { ok: false, error: `unknown flag '${forceToken}' — load takes only <name>` };
      return { ok: true, command: { kind: 'modulesLoad', module: name } };
    }

    const force = forceToken === '--force';
    if (forceToken && !force) return { ok: false, error: `unknown flag '${forceToken}' — use [--force]` };
    return {
      ok: true,
      command: { kind: sub === 'unload' ? 'modulesUnload' : 'modulesReload', module: name, force },
    };
  }

  return { ok: false, error: `unknown command '${head}' — try "help"` };
}
