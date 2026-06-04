/**
 * tests/stubs/env.ts — Test stub for $env/dynamic/private.
 *
 * Bun resolves this via tsconfig paths when tests import $env/dynamic/private.
 * All env values come from process.env so individual tests can override them
 * by setting process.env.<VAR> before importing modules.
 */

export const env: Record<string, string | undefined> = new Proxy({} as Record<string, string | undefined>, {
  get(_target, prop: string) {
    return process.env[prop];
  },
  set(_target, prop: string, value: string | undefined) {
    if (value === undefined) {
      delete process.env[prop];
    } else {
      process.env[prop] = value;
    }
    return true;
  }
});
