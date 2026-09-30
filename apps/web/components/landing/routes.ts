/**
 * Outbound destinations from the landing page, in one place.
 */

/**
 * The public demo bundle: a `playable-game-content/v1` manifest and its assets,
 * served statically from `public/demo/`. Asset `objectKey`s are origin-relative
 * and `assetBaseUrl` is null, so the runtime resolves them against this origin.
 */
export const DEMO_MANIFEST_PATH = "/demo/manifest.json";

/**
 * `/playable` renders the Phaser runtime and reads its manifest from a
 * `manifest` query parameter — without one it returns 400.
 *
 * This is an internal URL: the public demo is `/demo`, which embeds it behind a
 * shell that owns the loading, failure and retry states. Nothing should link a
 * visitor straight here.
 */
export function playableHref(manifestPath: string) {
  return `/playable?manifest=${encodeURIComponent(manifestPath)}`;
}

/** Where the public Play Demo CTA goes. */
export const PLAYABLE_DEMO_HREF = "/demo";

export const STUDIO_HREF = "/projects";
export const NEW_PROJECT_HREF = "/projects/new";
export const SIGN_IN_HREF = "/auth/login?returnTo=/projects";

/** Sign in, then land on `target` rather than the default projects list. */
export function signInTo(target: string) {
  return `/auth/login?returnTo=${encodeURIComponent(target)}`;
}

/** Launch Studio goes straight in when signed in, via GitHub when not. */
export function startCreatingHref(signedIn: boolean) {
  return signedIn ? STUDIO_HREF : SIGN_IN_HREF;
}
