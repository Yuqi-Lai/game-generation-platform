/*
  `server-only` is a build-time marker: importing it from a Client Component is
  meant to fail the Next build. It has no runtime behaviour, and it does not
  resolve under vitest, so any test that transitively imports a module guarding
  itself with it cannot load.

  Aliased to this empty module in vitest.config.mts. It intentionally exports
  nothing — the guarantee it provides is enforced by `next build`, not here.
*/
export {};
