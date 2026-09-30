/**
 * Your game footage.
 *
 * Drop the file at `public/videos/<file>` and it appears immediately — no code
 * change needed. If the file is absent or unplayable, `GameVideo` catches the
 * load error and renders the procedural pixel scene named by `fallbackWorldId`
 * instead, so the frame is never just black.
 *
 * No poster frame: a poster pointing at a file that is not there is a failed
 * image load, which browsers render as a broken-image placeholder. The
 * procedural fallback covers the gap instead.
 *
 * Recommended encode — `+faststart` puts the index before the media data so
 * playback can begin before the whole file has arrived, and `-an` drops the
 * audio track, which is dead weight on a muted element:
 *
 *   ffmpeg -i in.mov -c copy -an -movflags +faststart out.mp4
 *
 * Keep it muted, short (6-12s) and seamless — it autoplays on loop.
 */
export interface GameClip {
  id: string;
  /** Small pixel-font label. */
  label: string;
  /** Art direction, two or three words. */
  kind: string;
  /** One written line. */
  line: string;
  src: string;
  /** Procedural scene to show if `src` cannot play. */
  fallbackWorldId: string;
}

export const VIDEO_DIR = "/videos";

/** The single clip in the hero showcase window. */
export const HERO_CLIP: GameClip = {
  id: "farm",
  label: "Tideglass Farm",
  kind: "Pixel RPG",
  line: "Eight tilled rows and a harvest that has to clear before the tide turns.",
  src: `${VIDEO_DIR}/hero-demo.mp4`,
  fallbackWorldId: "tideglass-farm",
};
