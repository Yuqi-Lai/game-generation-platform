/**
 * The preconditions `public/playable/runtime.js` enforces before it will run a
 * manifest.
 *
 * They are restated here rather than imported because that file is a global
 * Phaser script, byte-identical to `legacy/playrpg/game/game.js` and kept in
 * sync by hand — it is not a module. Checking them in the shell first means a
 * bad manifest produces a readable message instead of the runtime throwing into
 * a `debugText` object that is created with `setVisible(false)`.
 */
export const PLAYABLE_CONTRACT = {
  version: "playable-game-content/v1",
  worldWidth: 2560,
  worldHeight: 1440,
  playerFrameWidth: 128,
  playerFrameHeight: 128,
  playerFrameCount: 3,
} as const;

export interface ManifestProblem {
  /** Short, for the heading. */
  title: string;
  /** One sentence naming what is actually wrong. */
  detail: string;
}

interface PlayerAssets {
  stand?: unknown;
  down?: unknown;
  up?: unknown;
  right?: unknown;
  avatar?: unknown;
  frameWidth?: unknown;
  frameHeight?: unknown;
  frameCount?: unknown;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

/**
 * Returns the first problem that would stop the runtime, or null if the
 * manifest satisfies every precondition. Mirrors `configurePlayableManifest`
 * and `resolvePlayableAsset` in the runtime.
 */
export function validatePlayableManifest(value: unknown): ManifestProblem | null {
  const manifest = asRecord(value);
  if (!manifest) {
    return { title: "The demo manifest is unreadable", detail: "It did not parse as an object." };
  }

  if (manifest.version !== PLAYABLE_CONTRACT.version) {
    return {
      title: "This demo cannot be played",
      detail: `The manifest is "${String(manifest.version)}", but the runtime only plays ${PLAYABLE_CONTRACT.version}.`,
    };
  }

  const world = asRecord(manifest.world);
  if (
    !world ||
    world.width !== PLAYABLE_CONTRACT.worldWidth ||
    world.height !== PLAYABLE_CONTRACT.worldHeight
  ) {
    return {
      title: "This demo cannot be played",
      detail: `The world must be ${PLAYABLE_CONTRACT.worldWidth}x${PLAYABLE_CONTRACT.worldHeight}.`,
    };
  }

  const player = asRecord(manifest.player);
  const playerAssets = asRecord(player?.assets) as PlayerAssets | null;
  if (
    !playerAssets ||
    playerAssets.frameWidth !== PLAYABLE_CONTRACT.playerFrameWidth ||
    playerAssets.frameHeight !== PLAYABLE_CONTRACT.playerFrameHeight ||
    playerAssets.frameCount !== PLAYABLE_CONTRACT.playerFrameCount
  ) {
    return {
      title: "This demo cannot be played",
      detail: `Player strips must be ${PLAYABLE_CONTRACT.playerFrameCount} horizontal ${PLAYABLE_CONTRACT.playerFrameWidth}x${PLAYABLE_CONTRACT.playerFrameHeight} frames.`,
    };
  }

  const assets = Array.isArray(manifest.assets) ? manifest.assets : [];
  const known = new Set(
    assets.map((asset) => asRecord(asset)?.id).filter((id): id is string => typeof id === "string"),
  );

  const scenes = Array.isArray(manifest.scenes) ? manifest.scenes : [];
  if (scenes.length === 0) {
    return { title: "This demo cannot be played", detail: "The manifest contains no scenes." };
  }

  const characters = [
    ...(Array.isArray(manifest.npcs) ? manifest.npcs : []),
    ...(Array.isArray(manifest.minions) ? manifest.minions : []),
  ];

  const referenced = [
    playerAssets.stand,
    playerAssets.down,
    playerAssets.up,
    playerAssets.right,
    playerAssets.avatar,
    ...characters.flatMap((character) => {
      const characterAssets = asRecord(asRecord(character)?.assets);
      return [characterAssets?.sprite, characterAssets?.avatar];
    }),
    ...scenes.map((scene) => asRecord(scene)?.backgroundAssetId),
  ].filter((id): id is string => typeof id === "string");

  const missing = [...new Set(referenced)].filter((id) => !known.has(id));
  if (missing.length > 0) {
    return {
      title: "This demo is missing artwork",
      detail: `The manifest references ${missing.length} asset${missing.length === 1 ? "" : "s"} it does not define (${missing.slice(0, 3).join(", ")}).`,
    };
  }

  return null;
}
