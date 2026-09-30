import "server-only";

/** Already-absolute references are left alone; the runtime serves them as-is. */
const ABSOLUTE = /^(https?:|data:|blob:)/i;

export interface ManifestAsset {
  objectKey?: string;
  url?: string;
  contentType?: string;
}

export interface PlayableContent {
  version?: string;
  assetBaseUrl?: string | null;
  assets?: ManifestAsset[];
}

export const PLAYABLE_VERSION = "playable-game-content/v1";

/**
 * Repoints every asset at this origin, and drops `assetBaseUrl`.
 *
 * The pipeline reports assets against the object storage endpoint. A browser
 * can fetch those bytes but cannot make WebGL textures out of them — the
 * responses carry no `Access-Control-Allow-Origin`, so the images come back
 * tainted and the world renders empty. Rewriting them to origin-relative paths
 * gives the runtime the same shape the working public demo manifest has.
 *
 * `assetBaseUrl` has to be nulled rather than pointed at the proxy, because the
 * runtime resolves a non-null base with `new URL(key, base)` and that throws
 * when the base is not absolute. Null takes the branch that returns the key
 * untouched, which the browser resolves against the page.
 */
export function sameOriginAssets(content: unknown, assetPrefix: string) {
  const manifest = content as PlayableContent;
  return {
    ...manifest,
    assetBaseUrl: null,
    assets: (manifest.assets ?? []).map((asset) => {
      if (asset.url && ABSOLUTE.test(asset.url)) return asset;
      if (!asset.objectKey) return asset;
      /* encodeURI, not encodeURIComponent: the key's slashes are path
         separators and the asset route matches on the joined path. */
      return { ...asset, url: `${assetPrefix}${encodeURI(asset.objectKey)}` };
    }),
  };
}

/**
 * Streams one asset the given content declares, from object storage.
 *
 * Deliberately not a general proxy: the key has to appear in this content's own
 * asset list, so an authenticated session cannot read arbitrary objects out of
 * the bucket. Callers are responsible for having already authorised the
 * content itself.
 */
export async function serveDeclaredAsset(content: unknown, objectKey: string) {
  const manifest = content as PlayableContent;

  const declared = (manifest.assets ?? []).find((asset) => asset.objectKey === objectKey);
  if (!declared) return Response.json({ message: "Unknown asset." }, { status: 404 });

  const base = manifest.assetBaseUrl;
  if (!base) return Response.json({ message: "Asset storage is not configured." }, { status: 503 });

  let upstream: Response;
  try {
    upstream = await fetch(new URL(objectKey, base.endsWith("/") ? base : `${base}/`), {
      cache: "no-store",
    });
  } catch {
    return Response.json({ message: "Asset storage is unreachable." }, { status: 502 });
  }
  if (!upstream.ok || !upstream.body) {
    return Response.json({ message: "Asset could not be read." }, { status: upstream.status });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type":
        declared.contentType ?? upstream.headers.get("Content-Type") ?? "application/octet-stream",
      /* Keyed by attempt, so the bytes at a key never change — but the
         response is behind the caller's session, so it stays out of shared
         caches. */
      "Cache-Control": "private, max-age=3600",
    },
  });
}

/** Joins a catch-all route segment back into an object key. */
export function objectKeyFrom(key: string | string[] | undefined) {
  return (Array.isArray(key) ? key : [key ?? ""]).filter(Boolean).join("/");
}
