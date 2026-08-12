/**
 * core/console/parser — parse dòng lệnh `averon ...` (thuần, dễ test).
 * EN: core/console/parser — parse `averon ...` command lines (pure).
 *
 * Grammar:
 *   averon status
 *   averon help
 *   -help | -h                 (quick: shorthand cho 'averon help')
 *   averon modules list
 *   averon modules status
 *   averon modules load <name>
 *   averon modules unload <name> [--force]
 *   averon modules reload <name> [--force]
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

  // Quick command: gõ thẳng `-help` / `-h` không cần prefix `averon`.
  // EN: Quick commands — bare `-help` / `-h`, no `averon` prefix needed.
  if (tokens[0] === '-help' || tokens[0] === '-h') {
    if (tokens.length > 1) return { ok: false, error: `'${tokens[0]}' takes no arguments — got: ${tokens.slice(1).join(' ')}` };
    return { ok: true, command: { kind: 'help' } };
  }

  if (tokens[0] !== 'averon') {
    return { ok: false, error: `unknown prefix '${tokens[0]}' — commands start with 'averon' (quick: '-help' / '-h')` };
  }
  const rest = tokens.slice(1);
  if (rest.length === 0) return { ok: false, error: 'missing command — try "averon help"' };

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
    if (tail.length === 0) return { ok: false, error: "missing subcommand — try 'averon modules list' or 'averon modules status'" };
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
    if (!name) return { ok: false, error: `missing module name — try 'averon modules ${sub} <name>${sub !== 'load' ? ' [--force]' : ''}'` };
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

  return { ok: false, error: `unknown command '${head}' — try "averon help"` };
}
