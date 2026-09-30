import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import GameVideo from "./game-video";
import { HERO_CLIP } from "./media";

afterEach(cleanup);

/** The single clip the hero showcase window renders. */
const SHOWCASE = HERO_CLIP;

/** With `controls`, the button's label also contains the clip name — match the
 *  video's own label suffix so the query stays unambiguous. */
const videoLabel = /gameplay$/i;

/** jsdom gives no media pipeline, so drive paused/played through the element. */
function stubPlayback(video: HTMLVideoElement) {
  let paused = false;
  Object.defineProperty(video, "paused", { get: () => paused, configurable: true });
  vi.spyOn(video, "play").mockImplementation(() => {
    paused = false;
    video.dispatchEvent(new Event("play"));
    return Promise.resolve();
  });
  vi.spyOn(video, "pause").mockImplementation(() => {
    paused = true;
    video.dispatchEvent(new Event("pause"));
  });
}

describe("GameVideo", () => {
  it("plays the provided demo capture in the showcase box", () => {
    expect(SHOWCASE.src).toBe("/videos/hero-demo.mp4");
    // The labels around it are part of the design and must not drift.
    expect(SHOWCASE.label).toBe("Tideglass Farm");
    expect(SHOWCASE.kind).toBe("Pixel RPG");
  });

  it("sets every attribute muted autoplay actually requires", () => {
    render(<GameVideo clip={SHOWCASE} />);
    const video = screen.getByLabelText(videoLabel) as HTMLVideoElement;

    expect(video.tagName).toBe("VIDEO");
    expect(video).toHaveAttribute("src", "/videos/hero-demo.mp4");
    expect(video.autoplay).toBe(true);
    expect(video.loop).toBe(true);
    expect(video.muted).toBe(true);
    expect(video).toHaveAttribute("playsinline");
    // The active clip should fetch enough to start on its own.
    expect(video).toHaveAttribute("preload", "auto");
  });

  it("does not autoplay or prefetch an inactive preview", () => {
    render(<GameVideo clip={SHOWCASE} active={false} />);
    const video = screen.getByLabelText(videoLabel) as HTMLVideoElement;

    expect(video.autoplay).toBe(false);
    expect(video).toHaveAttribute("preload", "metadata");
  });

  it("offers no control unless asked for one", () => {
    render(<GameVideo clip={SHOWCASE} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  /*
    An autoplaying loop with no way to stop it fails WCAG 2.2.2. The control is
    a real focusable button, and the click-the-picture layer is deliberately not
    one, so the same action does not take two tab stops.
  */
  it("exposes one focusable pause control", () => {
    render(<GameVideo clip={SHOWCASE} controls />);
    const button = screen.getByRole("button", { name: /pause the tideglass farm clip/i });
    expect(button).toHaveTextContent(/pause/i);
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("toggles from the control and relabels itself", () => {
    render(<GameVideo clip={SHOWCASE} controls />);
    const video = screen.getByLabelText(videoLabel) as HTMLVideoElement;
    stubPlayback(video);

    fireEvent.click(screen.getByRole("button"));
    expect(video.pause).toHaveBeenCalled();
    const playing = screen.getByRole("button", { name: /play the tideglass farm clip/i });
    expect(playing).toHaveTextContent(/play/i);

    fireEvent.click(playing);
    expect(video.play).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /pause the/i })).toBeInTheDocument();
  });

  it("toggles from a click on the picture itself", () => {
    const { container } = render(<GameVideo clip={SHOWCASE} controls />);
    const video = screen.getByLabelText(videoLabel) as HTMLVideoElement;
    stubPlayback(video);

    const surface = container.querySelector('[role="presentation"]')!;
    fireEvent.click(surface);
    expect(video.pause).toHaveBeenCalled();
  });

  /*
    The clip's audio track outlasts its video track, so playing to `ended` shows
    a frameless tail before the loop restarts. Restarting just before the end
    skips it.
  */
  it("restarts just before the end rather than waiting for ended", () => {
    render(<GameVideo clip={SHOWCASE} controls />);
    const video = screen.getByLabelText(videoLabel) as HTMLVideoElement;
    Object.defineProperty(video, "duration", { value: 30.7, configurable: true });
    Object.defineProperty(video, "paused", { get: () => false, configurable: true });

    video.currentTime = 20;
    fireEvent.timeUpdate(video);
    expect(video.currentTime).toBe(20);

    // Inside the lead window: jump back without waiting for `ended`.
    video.currentTime = 30.5;
    fireEvent.timeUpdate(video);
    expect(video.currentTime).toBe(0);
  });

  it("does not fight the user by restarting a paused clip", () => {
    render(<GameVideo clip={SHOWCASE} controls />);
    const video = screen.getByLabelText(videoLabel) as HTMLVideoElement;
    Object.defineProperty(video, "duration", { value: 30.7, configurable: true });
    Object.defineProperty(video, "paused", { get: () => true, configurable: true });

    video.currentTime = 30.5;
    fireEvent.timeUpdate(video);
    expect(video.currentTime).toBe(30.5);
  });

  it("keeps `loop` as a safety net under the early restart", () => {
    render(<GameVideo clip={SHOWCASE} controls />);
    expect((screen.getByLabelText(videoLabel) as HTMLVideoElement).loop).toBe(true);
  });

  it("styles the control in the section 02 arcade language", () => {
    const css = readFileSync(join(__dirname, "landing.module.css"), "utf8").replace(
      /\/\*[\s\S]*?\*\//g,
      "",
    );
    const rule = /\.videoToggle\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(rule).toMatch(/font-family:\s*var\(--type-pixel\)/);
    expect(rule).toMatch(/var\(--hud-seam\)/);
    expect(rule).toMatch(/steps\(1, end\)/);
    // Square corners, like the cabinet.
    expect(rule).not.toMatch(/border-radius/);
  });

  /*
    This is the black-box case: an unplayable or missing source must reveal the
    procedural scene, never leave the frame's black background showing.
  */
  it("falls back to the drawn scene when the source cannot play", () => {
    render(<GameVideo clip={SHOWCASE} />);
    const video = screen.getByLabelText(/Tideglass Farm/i);

    fireEvent.error(video);

    expect(screen.queryByLabelText(/gameplay/i)).not.toBeInTheDocument();
    const canvas = screen.getByRole("img", { name: /Tideglass Farm — preview/i });
    expect(canvas.tagName).toBe("CANVAS");
  });
});
