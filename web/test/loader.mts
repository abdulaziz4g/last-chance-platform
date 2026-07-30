/**
 * Resolution hooks that let a `'use server'` module be imported by plain
 * `node --test`.
 *
 * Two things stand in the way outside a bundler: the `@/` path alias, which is
 * a tsconfig fiction Node knows nothing about, and the Next runtime modules,
 * which cannot run outside a request. Both are handled here by rewriting the
 * specifier, so the action modules themselves are imported unmodified — the
 * point of these tests is to exercise the real code, not a copy of it.
 *
 * Only `resolve` is overridden. `load` falls through to the default, which is
 * what strips the types.
 */

const stub = (name: string) =>
  new URL(`./stubs/${name}.mts`, import.meta.url).href;

const STUBS = new Map([
  ['next/navigation', stub('next-navigation')],
  ['next/cache', stub('next-cache')],
  ['@/lib/api', stub('api')],
  ['@/lib/session', stub('session')],
]);

interface ResolveContext {
  parentURL?: string;
  conditions: string[];
  importAttributes: Record<string, string>;
}

type NextResolve = (
  specifier: string,
  context: ResolveContext,
) => Promise<{ url: string }>;

export async function resolve(
  specifier: string,
  context: ResolveContext,
  next: NextResolve,
) {
  const stubbed = STUBS.get(specifier);
  if (stubbed) return { url: stubbed, shortCircuit: true };

  // Everything else under `@/` is the real thing — notably `@/lib/local-time`,
  // whose guard is precisely what these tests are checking.
  if (specifier.startsWith('@/')) {
    return {
      url: new URL(`../src/${specifier.slice(2)}.ts`, import.meta.url).href,
      format: 'module-typescript',
      shortCircuit: true,
    };
  }

  const resolved = await next(specifier, context);

  // `.ts` is ambiguous to Node without a `type` field, and guessing costs a
  // reparse and a warning per file. This app is ESM throughout, so say so
  // rather than adding `"type": "module"` and disturbing the Next build.
  if (resolved.url.endsWith('.ts')) return { ...resolved, format: 'module-typescript' };
  return resolved;
}
