"use client";

import { useEffect, useRef } from "react";
import { BUF_H, BUF_W, paintWorld } from "./world-paint";
import type { World } from "./worlds";
import styles from "./landing.module.css";

/** Ordered-dither dissolve: 4px blocks, 16 Bayer levels. */
const BAYER_4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];
const BLOCK = 4;
const LEVELS = 17;
const DISSOLVE_MS = 520;

let maskCache: HTMLCanvasElement[] | null = null;

/** One 1-bit stencil per dissolve level, built once and shared. */
function dissolveMasks() {
  if (maskCache) return maskCache;
  maskCache = Array.from({ length: LEVELS }, (_, level) => {
    const c = document.createElement("canvas");
    c.width = BUF_W;
    c.height = BUF_H;
    const g = c.getContext("2d")!;
    g.fillStyle = "#000";
    for (let by = 0; by * BLOCK < BUF_H; by++) {
      for (let bx = 0; bx * BLOCK < BUF_W; bx++) {
        if (BAYER_4[by % 4][bx % 4] < level) {
          g.fillRect(bx * BLOCK, by * BLOCK, BLOCK, BLOCK);
        }
      }
    }
    return c;
  });
  return maskCache;
}

function buffer(alpha: boolean) {
  const c = document.createElement("canvas");
  c.width = BUF_W;
  c.height = BUF_H;
  return { canvas: c, ctx: c.getContext("2d", { alpha })! };
}

export interface WorldCanvasProps {
  world: World;
  /**
   * Fill the element by cropping rather than stretching. The buffer is 16:9, so
   * without this a full-bleed background distorts badly on tall viewports.
   */
  cover?: boolean;
  label?: string;
  className?: string;
}

/**
 * Blits the procedurally painted world up from its small integer buffer with
 * smoothing disabled, so the output is real pixel art rather than a resampled
 * image. Frames step at ~10fps for sprite-sheet cadence, and only while the
 * surface is on screen.
 *
 * Changing `world` dissolves rather than cuts: the incoming scene is stencilled
 * in through a 4px ordered-dither mask. Self-contained and time-based, so it
 * needs nothing from the scroll position.
 */
export default function WorldCanvas({ world, cover = false, label, className }: WorldCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const target = useRef(world);

  useEffect(() => {
    target.current = world;
  }, [world]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const from = buffer(false);
    const to = buffer(true);
    const compose = buffer(false);
    const masks = dissolveMasks();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Off-screen surfaces never burn frames.
    let onScreen = false;
    const io = new IntersectionObserver(
      ([entry]) => {
        onScreen = entry.isIntersecting;
      },
      { rootMargin: "160px 0px" },
    );
    io.observe(canvas);

    let raf = 0;
    let frame = 0;
    let lastStep = 0;
    let disposed = false;
    let shown = target.current;
    /** Non-null only while a dissolve is in flight. */
    let incoming: { world: World; startedAt: number } | null = null;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      /** Integer upscale keeps every pixel square. */
      const scale = Math.max(1, Math.round((rect.width * dpr) / BUF_W));
      canvas.width = BUF_W * scale;
      canvas.height = BUF_H * scale;
      ctx.imageSmoothingEnabled = false;
      compose.ctx.imageSmoothingEnabled = false;
    };

    const draw = (now: number) => {
      paintWorld(from.ctx, shown, frame);
      compose.ctx.drawImage(from.canvas, 0, 0);

      if (incoming) {
        const t = reduced ? 1 : Math.min(1, (now - incoming.startedAt) / DISSOLVE_MS);
        const level = Math.round(t * (LEVELS - 1));
        paintWorld(to.ctx, incoming.world, frame);
        if (level >= LEVELS - 1) {
          compose.ctx.drawImage(to.canvas, 0, 0);
          shown = incoming.world;
          incoming = null;
        } else if (level > 0) {
          to.ctx.globalCompositeOperation = "destination-in";
          to.ctx.drawImage(masks[level], 0, 0);
          to.ctx.globalCompositeOperation = "source-over";
          compose.ctx.drawImage(to.canvas, 0, 0);
        }
      }

      ctx.drawImage(compose.canvas, 0, 0, BUF_W, BUF_H, 0, 0, canvas.width, canvas.height);
    };

    resize();
    draw(performance.now());

    const tick = (now: number) => {
      if (disposed) return;
      raf = requestAnimationFrame(tick);

      // Pick up a world change even while frozen, so the surface is never stale.
      if (target.current.id !== shown.id && incoming?.world.id !== target.current.id) {
        incoming = { world: target.current, startedAt: now };
      }

      if (reduced || !onScreen) {
        if (incoming) draw(now);
        return;
      }

      // A dissolve runs every frame; idle animation steps at ~10fps.
      if (!incoming && now - lastStep < 96) return;
      lastStep = now;
      frame++;
      draw(now);
    };
    raf = requestAnimationFrame(tick);

    const ro = new ResizeObserver(() => {
      resize();
      draw(performance.now());
    });
    ro.observe(canvas);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
    };
  }, [cover]);

  // An explicit empty label means the canvas is decoration (a section
  // backdrop), so it is hidden rather than announced as an unlabelled image.
  const decorative = label === "";

  return (
    <canvas
      ref={canvasRef}
      className={`${styles.worldCanvas} ${className ?? ""}`}
      {...(decorative
        ? { "aria-hidden": true as const }
        : {
            role: "img",
            "aria-label": label ?? `${world.name} — a generated ${world.kind.toLowerCase()} scene`,
          })}
    />
  );
}
