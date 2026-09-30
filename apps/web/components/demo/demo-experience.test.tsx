import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DemoExperience from "./demo-experience";
import { DEMO_MANIFEST_PATH, PLAYABLE_DEMO_HREF, playableHref } from "@/components/landing/routes";

/** A manifest that satisfies every precondition the runtime enforces. */
const VALID_MANIFEST = {
  version: "playable-game-content/v1",
  assetBaseUrl: null,
  world: { width: 2560, height: 1440, tileSize: 64 },
  player: {
    assets: {
      stand: "player.stand",
      down: "player.down",
      up: "player.up",
      right: "player.right",
      avatar: "player.avatar",
      frameWidth: 128,
      frameHeight: 128,
      frameCount: 3,
    },
  },
  npcs: [],
  minions: [],
  scenes: [{ backgroundAssetId: "scene.background" }],
  assets: [
    { id: "player.stand" },
    { id: "player.down" },
    { id: "player.up" },
    { id: "player.right" },
    { id: "player.avatar" },
    { id: "scene.background" },
  ],
};

function mockManifest(body: unknown, ok = true, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok, status, json: async () => body }) as unknown as Response),
  );
}

/**
 * Stand in for what the Phaser runtime does inside the iframe on success: mount
 * a canvas into #game-container, which is exactly what the shell watches for.
 *
 * jsdom does not fetch the iframe's src, so the document can exist without a
 * body — append to whichever root is actually there.
 */
function mountCanvasInFrame() {
  const frame = screen.getByTitle("Playable demo") as HTMLIFrameElement;
  const doc = frame.contentDocument;
  if (!doc) throw new Error("iframe has no contentDocument");

  const container = doc.createElement("div");
  container.id = "game-container";
  container.appendChild(doc.createElement("canvas"));
  (doc.body ?? doc.documentElement ?? doc).appendChild(container);
  return frame;
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  // This project does not enable vitest `globals`, so Testing Library's
  // automatic cleanup hook never registers — unmount explicitly.
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("public demo route wiring", () => {
  it("sends the landing Play Demo CTA to /demo, not the raw runtime URL", () => {
    expect(PLAYABLE_DEMO_HREF).toBe("/demo");
    expect(PLAYABLE_DEMO_HREF).not.toContain("manifest=");
  });

  it("gives the landing page a smooth exit into /demo", () => {
    const transition = readFileSync(
      join(__dirname, "..", "landing", "page-transition.tsx"),
      "utf8",
    );
    // Without /demo in the intercept the CTA skips the mask and hard-navigates.
    expect(transition).toMatch(/projects\|demo\|playable\|auth/);
  });

  it("embeds the runtime with the validated demo manifest", () => {
    expect(DEMO_MANIFEST_PATH).toBe("/demo/manifest.json");
    expect(playableHref(DEMO_MANIFEST_PATH)).toBe(
      `/playable?manifest=${encodeURIComponent("/demo/manifest.json")}`,
    );
  });
});

/** The splash holds the screen until someone starts; get past it. */
async function startDemo() {
  const start = await screen.findByRole("button", { name: /start demo/i });
  fireEvent.click(start);
  await waitFor(() => expect(screen.getByTitle("Playable demo")).toBeInTheDocument());
}

describe("cabinet screen geometry", () => {
  const css = readFileSync(join(__dirname, "demo.module.css"), "utf8");

  /*
    The runtime pins Phaser to FIT at 2048x1152, so a stage that is not 16:9
    gets letterboxed — up to 131px of black a side at 1920x1080. Matching the
    ratio here leaves Phaser nothing to letterbox, without touching the
    runtime's own scale config.
  */
  it("sizes the screen to the aspect ratio the runtime pins Phaser to", () => {
    const stage = /\n\.stage \{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(stage).toMatch(/aspect-ratio:\s*16\s*\/\s*9/);
    // Computed from the chassis, so it fits on whichever axis runs out first.
    expect(stage).toMatch(/width:\s*min\(100cqw,\s*100cqh \* 16 \/ 9\)/);
    expect(/\n\.cabinet \{([^}]*)\}/.exec(css)?.[1] ?? "").toMatch(/container-type:\s*size/);
  });

  /*
    No repeating pattern over the art at all. Scanlines at 1px-in-3px read as
    horizontal banding across the flat areas of a pixel-art scene on a large
    display, and no opacity fixes that — the artefact is the regular period.
    The vignette gives the screen its depth without any structure to alias.
  */
  it("lays no repeating pattern over the screen", () => {
    expect(css).not.toMatch(/repeating-linear-gradient/);
    const crt = /\n\.crt \{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(crt).toMatch(/radial-gradient/);
    expect(crt).toMatch(/pointer-events:\s*none/);
  });

});

describe("DemoExperience", () => {
  it("shows a loading state while the manifest is checked", async () => {
    mockManifest(VALID_MANIFEST);
    render(<DemoExperience />);

    expect(screen.getByRole("status")).toHaveTextContent(/booting the cabinet/i);
    // No game surface is offered before the manifest is known to be playable.
    expect(screen.queryByTitle("Playable demo")).not.toBeInTheDocument();

    await screen.findByRole("button", { name: /start demo/i });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("holds the splash until the player starts, so Phaser is not loaded on arrival", async () => {
    mockManifest(VALID_MANIFEST);
    render(<DemoExperience />);

    await screen.findByRole("button", { name: /start demo/i });
    // The iframe is what pulls in the runtime; it must not exist yet.
    expect(screen.queryByTitle("Playable demo")).not.toBeInTheDocument();

    await startDemo();
    expect(screen.getByRole("status")).toHaveTextContent(/loading the world/i);
  });

  it("starts from the Space key as well as the button", async () => {
    mockManifest(VALID_MANIFEST);
    render(<DemoExperience />);
    await screen.findByRole("button", { name: /start demo/i });

    /*
      The key is dispatched inside the retry loop rather than once before it.
      A single keydown is lost for good if the window listener is not attached
      at that exact tick, leaving nothing for `waitFor` to do but time out —
      which is what made this test flake about once in five full runs. Firing
      it again is harmless: the handler only listens during `idle`, so any
      repeat after the first lands on a phase that ignores it.

      `document.body` rather than `window`, because a real key event targets an
      element and bubbles up to the listener.
    */
    await waitFor(() => {
      fireEvent.keyDown(document.body, { key: " " });
      expect(screen.getByTitle("Playable demo")).toBeInTheDocument();
    });
  });

  it("frames the manifest's key art and copy on the splash", async () => {
    mockManifest({
      ...VALID_MANIFEST,
      title: "The Witch's Tide",
      openingRemarks: "A cozy coastal scene.",
      scenes: [{ backgroundAssetId: "scene.background", title: "The Windmill Shore" }],
      assets: [
        ...VALID_MANIFEST.assets.filter((a) => a.id !== "scene.background"),
        { id: "scene.background", role: "SCENE_BACKGROUND", url: "/demo/assets/bg.png" },
      ],
    });
    render(<DemoExperience />);

    const heading = await screen.findByRole("heading", { name: /the witch's tide/i });
    expect(heading).toBeInTheDocument();
    expect(screen.getByText(/a cozy coastal scene/i)).toBeInTheDocument();
    expect(screen.getByText(/the windmill shore/i)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /key art/i })).toHaveAttribute(
      "src",
      "/demo/assets/bg.png",
    );
  });

  it("reads key art from objectKey, which is the field the shipped manifest uses", async () => {
    mockManifest({
      ...VALID_MANIFEST,
      assets: [
        ...VALID_MANIFEST.assets.filter((a) => a.id !== "scene.background"),
        {
          id: "scene.background",
          role: "SCENE_BACKGROUND",
          objectKey: "/demo/assets/scenes/scene-coastal-farm/background.png",
        },
      ],
    });
    render(<DemoExperience />);

    expect(await screen.findByRole("img", { name: /key art/i })).toHaveAttribute(
      "src",
      "/demo/assets/scenes/scene-coastal-farm/background.png",
    );
  });

  it("drops the key art rather than showing a broken image", async () => {
    mockManifest({
      ...VALID_MANIFEST,
      assets: [
        ...VALID_MANIFEST.assets.filter((a) => a.id !== "scene.background"),
        { id: "scene.background", role: "SCENE_BACKGROUND", url: "/demo/assets/gone.png" },
      ],
    });
    render(<DemoExperience />);

    const art = await screen.findByRole("img", { name: /key art/i });
    fireEvent.error(art);

    await waitFor(() => expect(screen.queryByRole("img")).not.toBeInTheDocument());
    // The splash itself survives; only the art is dropped.
    expect(screen.getByRole("button", { name: /start demo/i })).toBeInTheDocument();
  });

  it("never renders an off-origin key art URL as an image", async () => {
    mockManifest({
      ...VALID_MANIFEST,
      assets: [
        ...VALID_MANIFEST.assets.filter((a) => a.id !== "scene.background"),
        { id: "scene.background", role: "SCENE_BACKGROUND", url: "https://elsewhere.test/bg.png" },
      ],
    });
    render(<DemoExperience />);

    await screen.findByRole("button", { name: /start demo/i });
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("fetches the demo manifest and points the frame at the runtime", async () => {
    mockManifest(VALID_MANIFEST);
    render(<DemoExperience />);
    await startDemo();

    expect(fetch).toHaveBeenCalledWith(DEMO_MANIFEST_PATH, { cache: "no-store" });
    expect(screen.getByTitle("Playable demo")).toHaveAttribute(
      "src",
      playableHref(DEMO_MANIFEST_PATH),
    );
  });

  it("becomes playable once the runtime produces a canvas", async () => {
    mockManifest(VALID_MANIFEST);
    render(<DemoExperience />);
    await startDemo();

    mountCanvasInFrame();
    await vi.advanceTimersByTimeAsync(300);

    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
    expect(screen.getByTitle("Playable demo")).toHaveAttribute("data-state", "playing");
    // Keyboard focus is explicit, so keys actually reach the game.
    expect(screen.getByRole("button", { name: /click to play/i })).toBeInTheDocument();
  });

  it("reports an unplayable manifest instead of a black screen", async () => {
    mockManifest({ ...VALID_MANIFEST, version: "legacy-game/v0" });
    render(<DemoExperience />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/cannot be played/i);
    expect(alert).toHaveTextContent(/playable-game-content\/v1/);
    // Never offer to start something we know cannot run.
    expect(screen.queryByRole("button", { name: /start demo/i })).not.toBeInTheDocument();
    expect(screen.queryByTitle("Playable demo")).not.toBeInTheDocument();
  });

  it("reports a failed manifest fetch", async () => {
    mockManifest(null, false, 404);
    render(<DemoExperience />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/could not load the demo/i);
    expect(alert).toHaveTextContent(/404/);
  });

  it("retries from a failure and can then reach playable", async () => {
    const body = vi.fn();
    let attempt = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        attempt += 1;
        body();
        return attempt === 1
          ? ({ ok: false, status: 503, json: async () => null } as unknown as Response)
          : ({ ok: true, status: 200, json: async () => VALID_MANIFEST } as unknown as Response);
      }),
    );

    render(<DemoExperience />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/503/);

    fireEvent.click(screen.getByRole("button", { name: /try again/i }));

    await startDemo();
    expect(body).toHaveBeenCalledTimes(2);

    mountCanvasInFrame();
    await vi.advanceTimersByTimeAsync(300);
    await waitFor(() =>
      expect(screen.getByTitle("Playable demo")).toHaveAttribute("data-state", "playing"),
    );
  });

  it("always offers a way back out", async () => {
    mockManifest(VALID_MANIFEST);
    render(<DemoExperience />);

    expect(screen.getByRole("link", { name: /back/i })).toHaveAttribute("href", "/");

    await startDemo();
    expect(screen.getByRole("link", { name: /back/i })).toHaveAttribute("href", "/");
  });

  it("offers a way back out from a failure too", async () => {
    mockManifest(null, false, 500);
    render(<DemoExperience />);
    await screen.findByRole("alert");

    const exits = screen.getAllByRole("link").filter((a) => a.getAttribute("href") === "/");
    expect(exits.length).toBeGreaterThanOrEqual(2);
  });

  it("lists the keys the runtime actually binds", async () => {
    mockManifest(VALID_MANIFEST);
    render(<DemoExperience />);

    const controls = screen.getByLabelText("Keyboard controls");
    for (const key of ["W A S D", "Shift", "Space", "Esc", "P"]) {
      expect(controls).toHaveTextContent(key);
    }
  });
});
