import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEMO_MANIFEST_PATH, PLAYABLE_DEMO_HREF, playableHref } from "./routes";
import { PLAYABLE_CONTRACT } from "@/components/demo/playable-contract";

/**
 * The public demo is a static `playable-game-content/v1` bundle under
 * `public/demo/`, and the landing page's Play Demo CTA points straight at it.
 *
 * It is worth testing because the failure mode is silent: `runtime.js` throws
 * on a manifest whose geometry it does not accept, and its only error surface
 * is a `debugText` object created with `setVisible(false)` — so a visitor sees
 * a black screen with no message. These checks mirror the runtime's own
 * preconditions so a broken bundle fails here instead of in front of someone.
 *
 * The contract constants come from `components/demo/playable-contract.ts`,
 * which is the single place the runtime's preconditions are restated — the
 * runtime itself is a global script kept in sync with legacy by hand, so it is
 * not importable.
 */
const {
  worldWidth: WORLD_WIDTH,
  worldHeight: WORLD_HEIGHT,
  playerFrameWidth: PLAYER_FRAME_WIDTH,
  playerFrameHeight: PLAYER_FRAME_HEIGHT,
  playerFrameCount: PLAYER_FRAME_COUNT,
} = PLAYABLE_CONTRACT;

const PUBLIC_DIR = join(__dirname, "..", "..", "public");

interface AssetDescriptor {
  id: string;
  role: string;
  width: number;
  height: number;
  objectKey?: string;
  url?: string;
}

interface DemoManifest {
  version: string;
  assetBaseUrl: string | null;
  world: { width: number; height: number; tileSize?: number };
  player: {
    assets: Record<string, string | number> & {
      frameWidth: number;
      frameHeight: number;
      frameCount: number;
    };
  };
  npcs?: Array<{ assets: { sprite?: string; avatar?: string } }>;
  minions?: Array<{ assets: { sprite?: string; avatar?: string } }>;
  scenes: Array<{ backgroundAssetId: string }>;
  assets: AssetDescriptor[];
}

const manifestFile = join(PUBLIC_DIR, DEMO_MANIFEST_PATH);
const manifest: DemoManifest | null = existsSync(manifestFile)
  ? (JSON.parse(readFileSync(manifestFile, "utf8")) as DemoManifest)
  : null;

/** Real pixel dimensions from a PNG's IHDR chunk. */
function pngSize(file: string) {
  const bytes = readFileSync(file);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe("public demo bundle", () => {
  it("wires the Play Demo CTA to the demo shell, which loads this manifest", () => {
    // The CTA is the public /demo route; the raw runtime URL stays internal.
    expect(PLAYABLE_DEMO_HREF).toBe("/demo");

    // A bare "/playable" returns 400 — the manifest parameter is the whole point.
    const param = new URLSearchParams(playableHref(DEMO_MANIFEST_PATH).split("?")[1]).get(
      "manifest",
    );
    expect(param).toBe(DEMO_MANIFEST_PATH);
  });

  it("ships the manifest the CTA points at", () => {
    expect(manifest, `missing ${DEMO_MANIFEST_PATH} under public/`).not.toBeNull();
  });

  it("declares the version the runtime and the manifest proxy both gate on", () => {
    expect(manifest!.version).toBe(PLAYABLE_CONTRACT.version);
  });

  it("matches the world size the runtime hard-codes", () => {
    // configurePlayableManifest throws on any other size.
    expect(manifest!.world.width).toBe(WORLD_WIDTH);
    expect(manifest!.world.height).toBe(WORLD_HEIGHT);
  });

  it("matches the player frame geometry the runtime hard-codes", () => {
    const { frameWidth, frameHeight, frameCount } = manifest!.player.assets;
    expect(frameWidth).toBe(PLAYER_FRAME_WIDTH);
    expect(frameHeight).toBe(PLAYER_FRAME_HEIGHT);
    expect(frameCount).toBe(PLAYER_FRAME_COUNT);
  });

  it("resolves every referenced asset id", () => {
    const known = new Set(manifest!.assets.map((asset) => asset.id));
    const referenced = [
      manifest!.player.assets.stand,
      manifest!.player.assets.down,
      manifest!.player.assets.up,
      manifest!.player.assets.right,
      manifest!.player.assets.avatar,
      ...[...(manifest!.npcs ?? []), ...(manifest!.minions ?? [])].flatMap((character) =>
        [character.assets.sprite, character.assets.avatar].filter(Boolean),
      ),
      ...manifest!.scenes.map((scene) => scene.backgroundAssetId),
    ].filter((id): id is string => typeof id === "string");

    // resolvePlayableAsset throws "Manifest asset not found" on any gap.
    expect([...new Set(referenced)].filter((id) => !known.has(id))).toEqual([]);
  });

  it("has every origin-relative asset present on disk", () => {
    // assetBaseUrl is null, so the runtime serves objectKey from this origin.
    expect(manifest!.assetBaseUrl).toBeNull();

    const missing = manifest!.assets
      .map((asset) => asset.url ?? asset.objectKey ?? "")
      .filter((key) => key.startsWith("/"))
      .filter((key) => !existsSync(join(PUBLIC_DIR, key)));
    expect(missing).toEqual([]);
  });

  it("carries the scene background the demo splash frames as key art", () => {
    // Without a SCENE_BACKGROUND the splash silently falls back to text only.
    const background = (manifest?.assets ?? []).filter((a) => a.role === "SCENE_BACKGROUND");
    expect(background).toHaveLength(1);
    // Only an origin-relative key is rendered as an <img>; anything else is dropped.
    expect(background[0].url ?? background[0].objectKey ?? "").toMatch(/^\//);
  });

  it("stores each asset at the size the manifest declares", () => {
    const wrong = manifest!.assets
      .filter((asset) => (asset.objectKey ?? "").startsWith("/"))
      .map((asset) => {
        const actual = pngSize(join(PUBLIC_DIR, asset.objectKey!));
        return actual.width === asset.width && actual.height === asset.height
          ? null
          : `${asset.id}: declared ${asset.width}x${asset.height}, file ${actual.width}x${actual.height}`;
      })
      .filter(Boolean);
    expect(wrong).toEqual([]);
  });

  it("stores the directional player strips as three horizontal frames", () => {
    // The runtime slices these as a sprite sheet and throws if they are not
    // exactly frameCount x frameWidth wide.
    const byId = new Map(manifest!.assets.map((asset) => [asset.id, asset]));
    for (const direction of ["down", "up", "right"] as const) {
      const id = manifest!.player.assets[direction] as string;
      const asset = byId.get(id)!;
      const actual = pngSize(join(PUBLIC_DIR, asset.objectKey!));
      expect(actual.width, `${id} width`).toBe(PLAYER_FRAME_WIDTH * PLAYER_FRAME_COUNT);
      expect(actual.height, `${id} height`).toBe(PLAYER_FRAME_HEIGHT);
    }
  });
});
