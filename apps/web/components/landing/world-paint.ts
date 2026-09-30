/**
 * Procedural pixel-art painter for the generated worlds.
 *
 * Everything draws into a small integer buffer (208x117) which the canvas layer
 * blits up with smoothing disabled, so the output is real pixel art rather than
 * a downscaled photograph. `frame` advances at ~10fps to get sprite-sheet
 * cadence instead of continuous tweening.
 */
import type { World } from "./worlds";

export const BUF_W = 208;
export const BUF_H = 117;

type Ctx = CanvasRenderingContext2D;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedOf(world: World) {
  return Number.parseInt(world.seed.replace("0x", ""), 16) || 1;
}

function px(ctx: Ctx, x: number, y: number, w: number, h: number, fill: string) {
  ctx.fillStyle = fill;
  ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
}

/** Checkerboard dither between two colours — the classic 16-colour sky trick. */
function dither(ctx: Ctx, x: number, y: number, w: number, h: number, fill: string, step = 2) {
  ctx.fillStyle = fill;
  for (let j = 0; j < h; j++) {
    for (let i = (j % step === 0 ? 0 : 1); i < w; i += step) {
      ctx.fillRect(x + i, y + j, 1, 1);
    }
  }
}

function lerpHex(a: string, b: string, t: number) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  const mix = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return `#${mix.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Multi-stop vertical wash, quantised to a handful of steps and dithered at the
 * seams. Reads as a painted sky rather than a CSS gradient, and avoids the hard
 * banding of drawing flat blocks.
 */
function wash(ctx: Ctx, y0: number, y1: number, stops: string[], steps = 14) {
  const h = y1 - y0;
  const band = h / steps;
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const seg = t * (stops.length - 1);
    const k = Math.min(stops.length - 2, Math.floor(seg));
    const colour = lerpHex(stops[k], stops[k + 1], seg - k);
    px(ctx, 0, y0 + i * band, BUF_W, Math.ceil(band) + 1, colour);
    if (i > 0) {
      ctx.globalAlpha = 0.5;
      dither(ctx, 0, Math.round(y0 + i * band), BUF_W, Math.max(1, Math.round(band / 2)), colour);
      ctx.globalAlpha = 1;
    }
  }
}

/** Pixel-perfect filled circle. */
function disc(ctx: Ctx, cx: number, cy: number, r: number, fill: string) {
  ctx.fillStyle = fill;
  for (let i = -r; i <= r; i++) {
    const span = Math.round(Math.sqrt(Math.max(0, r * r - i * i)));
    ctx.fillRect(Math.round(cx + i), Math.round(cy - span), 1, span * 2 + 1);
  }
}

function bandedSky(ctx: Ctx, world: World, horizon: number) {
  const [a, b, c] = world.palette.sky;
  // Base-fill the full buffer first — painters draw terrain that can rise above
  // or dip below the horizon line, and uncovered pixels would read as holes.
  px(ctx, 0, 0, BUF_W, BUF_H, world.palette.groundDeep);
  const bands = 7;
  const bandH = horizon / bands;
  for (let i = 0; i < bands; i++) {
    const t = i / (bands - 1);
    px(ctx, 0, i * bandH, BUF_W, bandH + 1, t < 0.5 ? a : b);
    if (i === 3) dither(ctx, 0, Math.round(i * bandH), BUF_W, Math.round(bandH), b);
  }
  // Glow pooling just above the horizon.
  px(ctx, 0, horizon - 14, BUF_W, 8, b);
  dither(ctx, 0, horizon - 18, BUF_W, 5, b);
  px(ctx, 0, horizon - 6, BUF_W, 6, c);
  dither(ctx, 0, horizon - 10, BUF_W, 4, c);
}

/* ---------------------------------------------------------------- 01 neon */

function paintNeonSector(ctx: Ctx, world: World, frame: number) {
  const p = world.palette;
  const rnd = mulberry32(seedOf(world));
  const horizon = 86;
  bandedSky(ctx, world, horizon);

  // Advertising glow pooled against the cloud base — the light in this world
  // comes from below, so the sky is brightest where the city meets it.
  for (let i = 0; i < 16; i++) {
    ctx.globalAlpha = 0.05 - i * 0.003;
    px(ctx, 0, horizon - 30 + i, BUF_W, 1, i % 2 ? p.accent : p.accentAlt);
  }
  ctx.globalAlpha = 1;

  // Far tower band, kept low so a strip of sky always reads at the top.
  let x = -4;
  while (x < BUF_W + 4) {
    const w = 8 + Math.floor(rnd() * 14);
    const h = 22 + Math.floor(rnd() * 26);
    px(ctx, x, horizon - h, w, h, p.far);
    x += w + 1 + Math.floor(rnd() * 3);
  }

  // Mid towers. Most windows stay dark — the lit ones only read as signage
  // because they are rare.
  x = -6;
  const bases: Array<[number, number]> = [];
  while (x < BUF_W + 6) {
    const w = 14 + Math.floor(rnd() * 20);
    const h = 30 + Math.floor(rnd() * 38);
    const top = horizon - h;
    px(ctx, x, top, w, h, p.mid);
    px(ctx, x, top, w, 1, "#2e2247");
    bases.push([x, w]);

    // Roof furniture, so the skyline has a profile rather than a flat cut.
    if (rnd() > 0.45) {
      const mx = x + 2 + Math.floor(rnd() * (w - 4));
      px(ctx, mx, top - 6 - Math.floor(rnd() * 5), 1, 8, p.mid);
      if (rnd() > 0.6) px(ctx, mx, top - 8, 1, 1, p.accent);
    }

    for (let wy = top + 5; wy < horizon - 12; wy += 6) {
      for (let wx = x + 3; wx < x + w - 4; wx += 5) {
        const r = rnd();
        if (r < 0.62) continue;
        const lamp =
          r > 0.97 && (frame + wx * 3 + wy) % 23 < 3
            ? p.ink
            : r > 0.86
              ? p.accentAlt
              : r > 0.78
                ? p.accent
                : "#5b4a86";
        px(ctx, wx, wy, 2, r > 0.9 ? 3 : 2, lamp);
      }
    }

    // One vertical signage strip per few towers.
    if (rnd() > 0.72) {
      const sx = x + w - 3;
      const sh = 12 + Math.floor(rnd() * 18);
      const on = (frame + x) % 31 > 4;
      px(ctx, sx, top + 6, 2, sh, on ? p.accent : "#3a2b52");
      px(ctx, sx - 1, top + 6, 1, sh, on ? p.accentAlt : "#3a2b52");
    }
    x += w + 2 + Math.floor(rnd() * 4);
  }

  // Rain, confined to the air above the street so it never litters the road.
  ctx.globalAlpha = 0.18;
  const rain = mulberry32(seedOf(world) + 13);
  for (let i = 0; i < 44; i++) {
    const rx = rain() * BUF_W;
    const ry = (rain() * (horizon - 10) + frame * 7) % (horizon - 10);
    px(ctx, rx - ry * 0.12, ry, 1, 4, p.ink);
  }
  ctx.globalAlpha = 1;

  // Shopfronts at street level. This is what actually sells the world: the
  // ground plane is lit by the signage, not by any sky.
  bases.forEach(([bx, bw], i) => {
    if (i % 2 !== 0) return;
    const tint = i % 4 === 0 ? p.accent : p.accentAlt;
    const on = (frame + bx * 2) % 47 > 3;
    const fw = Math.max(8, bw - 8);
    const fxs = bx + 4;
    px(ctx, fxs, horizon - 12, fw, 12, "#140d26");
    if (!on) return;
    // Sign band above, glazing below, a dark doorway cut into it.
    px(ctx, fxs + 1, horizon - 11, fw - 2, 3, tint);
    ctx.globalAlpha = 0.45;
    px(ctx, fxs + 1, horizon - 7, fw - 2, 5, tint);
    ctx.globalAlpha = 1;
    px(ctx, fxs + Math.floor(fw / 2) - 1, horizon - 7, 3, 7, "#0f0a1e");
    // Spill onto the pavement in front.
    ctx.globalAlpha = 0.1;
    px(ctx, bx, horizon - 15, bw, 17, tint);
    ctx.globalAlpha = 1;
  });

  // Sidewalk, kerb, roadway. One continuous surface, three tones.
  px(ctx, 0, horizon, BUF_W, 9, "#181030");
  for (let sx = 0; sx < BUF_W; sx += 11) px(ctx, sx, horizon + 1, 1, 8, "#1e1539");
  px(ctx, 0, horizon + 9, BUF_W, 2, "#2c1f4d");
  px(ctx, 0, horizon + 11, BUF_W, BUF_H - horizon - 11, "#0b0718");

  // Centre line, read as one dashed line rather than scattered ticks.
  for (let lx = 3; lx < BUF_W; lx += 20) px(ctx, lx, horizon + 20, 12, 1, "#2f2250");

  // Reflections, only beneath the lit shopfronts, fading down the wet asphalt.
  bases.forEach(([bx, bw], i) => {
    if (i % 2 !== 0) return;
    const tint = i % 4 === 0 ? p.accent : p.accentAlt;
    if ((frame + bx * 2) % 47 <= 3) return;
    for (let d = 0; d < 14; d++) {
      ctx.globalAlpha = 0.13 * (1 - d / 14);
      px(ctx, bx + 3, horizon + 11 + d, bw - 6, 1, tint);
    }
  });
  ctx.globalAlpha = 1;

  // A lone figure on the sidewalk. Kept small and mostly silhouette — at this
  // scale a rim light any brighter reads as a lamp post, not a person.
  const fx = 98;
  const fy = horizon + 7;
  const bob = frame % 20 < 10 ? 0 : 1;
  px(ctx, fx, fy - 7 + bob, 3, 2, "#241a3f");
  px(ctx, fx, fy - 5 + bob, 3, 5, "#1c1433");
  ctx.globalAlpha = 0.45;
  px(ctx, fx + 3, fy - 5 + bob, 1, 5, p.accentAlt);
  ctx.globalAlpha = 0.25;
  px(ctx, fx - 1, fy + bob, 5, 1, p.ink);
  ctx.globalAlpha = 1;
}

/* ----------------------------------------------------------- 02 dark fantasy */

function paintAshenHollow(ctx: Ctx, world: World, frame: number) {
  const p = world.palette;
  const rnd = mulberry32(seedOf(world));
  const horizon = 82;
  bandedSky(ctx, world, horizon);

  // A pale disc low in the sky, with a soft halo.
  ctx.globalAlpha = 0.12;
  disc(ctx, 155, 30, 18, p.accentAlt);
  ctx.globalAlpha = 0.28;
  disc(ctx, 155, 30, 12, p.accentAlt);
  ctx.globalAlpha = 1;
  disc(ctx, 155, 30, 8, "#cfc4e4");

  // Far ridge.
  for (let i = 0; i < BUF_W; i++) {
    const h = 16 + Math.sin(i * 0.05) * 6 + Math.sin(i * 0.17) * 3;
    px(ctx, i, horizon - h, 1, h, p.far);
  }

  // Ruined cloister. Each bay is two pillars carrying a semicircular arch, so
  // the opening — not the stone — is what the eye reads.
  const archX = [10, 50, 92, 134, 176];
  archX.forEach((ax, i) => {
    const span = 26;
    const rr = span / 2;
    const h = 40 + ((i * 17) % 18);
    const top = horizon - h;
    const spring = top + rr;
    const stone = i % 2 === 0 ? "#40384c" : "#372f42";
    const lit = "#514860";

    // Pillars from the springing line down to the marsh.
    px(ctx, ax, spring, 5, horizon - spring, stone);
    px(ctx, ax + span, spring, 5, horizon - spring, stone);
    px(ctx, ax + 4, spring, 1, horizon - spring, lit);
    px(ctx, ax + span + 4, spring, 1, horizon - spring, lit);

    // Semicircular arch ring, three pixels thick.
    const acx = ax + rr + 2;
    for (let a = 0; a <= 180; a += 2) {
      const rad = (a * Math.PI) / 180;
      const axp = acx - Math.cos(rad) * (rr + 2);
      const ayp = spring - Math.sin(rad) * (rr + 2);
      px(ctx, axp, ayp, 3, 3, stone);
    }
    // Capitals.
    px(ctx, ax - 1, spring - 1, 7, 2, lit);
    px(ctx, ax + span - 1, spring - 1, 7, 2, lit);

    // Alternate bays have lost the top of the ring.
    if (i % 2 === 0) {
      px(ctx, acx - 5, spring - rr - 4, 12, 7, p.far);
      px(ctx, acx + 2, spring - rr - 1, 8, 5, p.far);
    }
  });

  // Dead trees — height and lean come from the seed.
  const treeX = [8, 122, 196];
  treeX.forEach((tx, i) => {
    const th = 26 + Math.floor(rnd() * 16) + i * 4;
    px(ctx, tx, horizon - th, 2, th, p.groundDeep);
    for (let b = 0; b < 4; b++) {
      const by = horizon - th + 4 + b * 6;
      const dir = b % 2 === 0 ? 1 : -1;
      px(ctx, tx + (dir > 0 ? 2 : -5), by, 5, 1, p.groundDeep);
      px(ctx, tx + (dir > 0 ? 6 : -6), by - 2, 1, 3, p.groundDeep);
    }
  });

  // Marsh ground, with a lit shelf so it does not sink into the arches.
  px(ctx, 0, horizon, BUF_W, BUF_H - horizon, p.ground);
  px(ctx, 0, horizon, BUF_W, 1, "#453d4e");
  px(ctx, 0, horizon + 1, BUF_W, 3, "#241f2b");
  px(ctx, 0, BUF_H - 12, BUF_W, 12, p.groundDeep);
  px(ctx, 0, BUF_H - 12, BUF_W, 1, "#231e29");

  // Standing water: a dark pool with a lit rim, so it sits in the marsh
  // rather than floating on top of it.
  px(ctx, 40, horizon + 12, 62, 5, "#191520");
  px(ctx, 41, horizon + 12, 60, 1, "#4a4255");
  ctx.globalAlpha = 0.3;
  px(ctx, 62 + ((frame / 3) % 4), horizon + 14, 7, 1, p.accentAlt);
  ctx.globalAlpha = 0.14;
  px(ctx, 48, horizon + 15, 46, 1, p.accentAlt);
  ctx.globalAlpha = 1;

  // Tombstones.
  [30, 46, 112, 158].forEach((gx, i) => {
    const gh = 6 + (i % 2) * 3;
    px(ctx, gx, horizon + 4 + i, 4, gh, p.far);
    px(ctx, gx + 1, horizon + 3 + i, 2, 1, p.far);
  });

  // Drifting fog. Dithered rather than solid, or it reads as grey slabs.
  for (let i = 0; i < 5; i++) {
    const fy = horizon - 20 + i * 9;
    const fx = Math.round(((frame * (i + 1) * 0.5) % (BUF_W + 90)) - 90);
    ctx.globalAlpha = 0.09;
    px(ctx, fx, fy, 96, 2, p.ink);
    ctx.globalAlpha = 0.06;
    dither(ctx, fx - 22, fy - 1, 140, 5, p.ink, 3);
    ctx.globalAlpha = 1;
  }

  // Embers rising.
  const em = mulberry32(seedOf(world) + 3);
  for (let i = 0; i < 16; i++) {
    const ex = em() * BUF_W;
    const ey = BUF_H - ((em() * BUF_H + frame * 2) % BUF_H);
    ctx.globalAlpha = 0.6;
    px(ctx, ex, ey, 1, 1, p.accent);
    ctx.globalAlpha = 1;
  }
}

/* -------------------------------------------------------------- 03 pixel rpg */

function paintTideglassFarm(ctx: Ctx, world: World, frame: number) {
  const p = world.palette;
  const horizon = 42;

  // Dawn, first thaw. Cool overhead, warm at the waterline — this is the light
  // the whole composition is lit by, so it is drawn as a proper wash.
  wash(ctx, 0, horizon, ["#20364a", "#3d5f73", "#87a291", "#e7c79c"], 16);

  // The sun, low and hazy over the water.
  [[27, 0.07], [20, 0.1], [14, 0.16], [9, 0.28]].forEach(([r, a]) => {
    ctx.globalAlpha = a;
    disc(ctx, 158, horizon - 5, r, "#ffdca8");
  });
  ctx.globalAlpha = 1;
  disc(ctx, 158, horizon - 5, 6, "#fff3d8");

  // Far headland across the bay.
  for (let i = 0; i < BUF_W; i++) {
    const h = 7 + Math.sin(i * 0.031 + 1.2) * 4 + Math.sin(i * 0.09) * 1.6;
    px(ctx, i, horizon - h, 1, h + 1, "#4a5f63");
  }
  ctx.globalAlpha = 0.35;
  for (let i = 0; i < BUF_W; i += 2) px(ctx, i, horizon - 2, 2, 2, "#6d8480");
  ctx.globalAlpha = 1;

  // Sea, with a sun path that shimmers on the frame step.
  wash(ctx, horizon, horizon + 14, ["#2f5a63", "#3c6f74", "#4a8285"], 6);
  for (let i = 0; i < 22; i++) {
    const gx = (i * 19 + ((frame * 2) % 19)) % BUF_W;
    const gy = horizon + 2 + (i % 4) * 3;
    const warm = Math.abs(gx - 158) < 34;
    ctx.globalAlpha = warm ? 0.9 : 0.45;
    px(ctx, gx, gy, warm ? 4 : 2, 1, warm ? "#ffe9c4" : "#9fd0c9");
    ctx.globalAlpha = 1;
  }

  // The pier, reaching out from the right.
  px(ctx, 168, horizon + 8, 34, 2, "#5b4632");
  for (let lx = 172; lx < 200; lx += 7) px(ctx, lx, horizon + 10, 2, 4, "#42331f");

  // Grass shelf between the water and the beds.
  wash(ctx, horizon + 14, horizon + 26, ["#3f5c38", "#4a6b3e", "#56773f"], 5);
  const hedge = mulberry32(seedOf(world) + 5);
  for (let i = 0; i < BUF_W; i += 3) {
    if (hedge() > 0.6) px(ctx, i, horizon + 13, 2, 2, "#35502f");
  }

  // Trees behind the cottage: trunk plus overlapping canopy, not a hedge.
  const trees: Array<[number, number]> = [[22, 9], [56, 7], [196, 8]];
  trees.forEach(([tx, r]) => {
    const base = horizon + 23;
    const crown = base - r - 6;
    px(ctx, tx - 1, crown + r - 2, 3, base - crown - r + 2, "#3a2c1c");
    disc(ctx, tx, crown, r, "#3d5c33");
    disc(ctx, tx - r * 0.65, crown + r * 0.35, r * 0.72, "#456635");
    disc(ctx, tx + r * 0.6, crown + r * 0.3, r * 0.6, "#3d5c33");
    ctx.globalAlpha = 0.45;
    disc(ctx, tx - r * 0.25, crown - r * 0.45, r * 0.5, "#5b8043");
    ctx.globalAlpha = 1;
  });

  /* ---- The cottage. One storey, lit window, smoking chimney. It is the
     focal point, placed off centre so the composition has somewhere to rest. */
  const cx = 128;
  const cy = horizon + 26;
  // Body.
  px(ctx, cx, cy - 16, 40, 16, "#d8cdb4");
  px(ctx, cx, cy - 16, 40, 1, "#b3a88f");
  // Shaded gable end, away from the water light.
  ctx.globalAlpha = 0.3;
  px(ctx, cx + 28, cy - 16, 12, 16, "#7d7461");
  ctx.globalAlpha = 1;
  // Pitched roof, stepped.
  for (let i = 0; i < 11; i++) {
    px(ctx, cx - 3 + i * 2, cy - 17 - i, 46 - i * 4, 2, i < 2 ? "#6a4a3c" : "#7d5748");
  }
  px(ctx, cx - 3, cy - 17, 46, 2, "#59392e");
  // Chimney and smoke.
  px(ctx, cx + 30, cy - 30, 5, 8, "#8a6f5c");
  px(ctx, cx + 30, cy - 31, 5, 2, "#6d5445");
  for (let i = 0; i < 5; i++) {
    ctx.globalAlpha = 0.24 - i * 0.04;
    const sway = Math.sin((frame + i * 7) * 0.16) * 2;
    px(ctx, cx + 31 + sway + i, cy - 35 - i * 4, 3 + i, 3, "#e8e2d4");
  }
  ctx.globalAlpha = 1;
  // Lit window and door.
  const lamp = (frame % 90) < 84;
  px(ctx, cx + 5, cy - 11, 9, 7, lamp ? "#ffd27a" : "#6f6853");
  px(ctx, cx + 5, cy - 11, 9, 1, "#8a7c60");
  px(ctx, cx + 9, cy - 11, 1, 7, "#8a7c60");
  if (lamp) {
    ctx.globalAlpha = 0.16;
    px(ctx, cx + 1, cy - 15, 17, 15, "#ffd27a");
    ctx.globalAlpha = 1;
  }
  px(ctx, cx + 22, cy - 10, 7, 10, "#5c4634");
  px(ctx, cx + 27, cy - 6, 1, 1, "#c9b189");

  /* ---- Crop beds, then the path, then the planting. Three passes: a path
     drawn per row inside one loop comes out as a staircase, so it is laid down
     per scanline as a single curve instead. */
  const bedTop = horizon + 26;
  const pathT = (yy: number) => Math.max(0, Math.min(1, (yy - bedTop) / (BUF_H - bedTop)));
  // Leaves the cottage door and sweeps left as it comes forward.
  const pathCentre = (yy: number) => 152 - 96 * Math.pow(pathT(yy), 1.35);
  const pathHalf = (yy: number) => 3 + pathT(yy) * 11;

  // Pass 1 — soil bands, deepening toward the viewer.
  const rows: Array<[number, number, number]> = [];
  let y = bedTop;
  let rowH = 5;
  let row = 0;
  while (y < BUF_H) {
    px(ctx, 0, y, BUF_W, rowH, row % 2 === 0 ? "#6b5336" : "#5c4529");
    px(ctx, 0, y, BUF_W, 1, "#463318");
    rows.push([y, rowH, row]);
    y += rowH;
    rowH += 1;
    row++;
  }

  // Pass 2 — the footpath, one scanline at a time so its edges stay smooth.
  for (let yy = bedTop; yy < BUF_H; yy++) {
    const c = pathCentre(yy);
    const half = pathHalf(yy);
    px(ctx, c - half, yy, half * 2, 1, "#9a8663");
    px(ctx, c - half, yy, 2, 1, "#7d6a4c");
    px(ctx, c + half - 2, yy, 2, 1, "#8a7657");
    // Trodden highlight down the middle.
    if (yy % 3 !== 0) px(ctx, c - half * 0.35, yy, half * 0.7, 1, "#ac9873");
  }

  // Pass 3 — planting, clear of the path, varied bed to bed.
  rows.forEach(([ry, , r]) => {
    const bedRnd = mulberry32(seedOf(world) + r * 977);
    for (let cxp = 3; cxp < BUF_W - 3; cxp += 5 + Math.floor(bedRnd() * 4)) {
      const c = pathCentre(ry);
      if (Math.abs(cxp - c) < pathHalf(ry) + 3) continue;
      const q = bedRnd();
      if (q < 0.22) continue;
      const stage = q > 0.82 ? 2 : q > 0.5 ? 1 : 0;
      const sway = (frame + cxp * 3 + r) % 26 < 13 ? 0 : 1;
      const leaf = stage === 2 ? "#8fd07a" : stage === 1 ? "#7fc06a" : "#5f9c55";
      const ch = 2 + stage * 2 + (r > 6 ? 1 : 0);
      px(ctx, cxp + sway, ry - ch, 1, ch, leaf);
      if (stage > 0) px(ctx, cxp - 1 + sway, ry - ch, 3, 1, leaf);
      if (stage > 1) {
        px(ctx, cxp + sway, ry - ch - 1, 1, 1, p.accent);
        px(ctx, cxp - 1 + sway, ry - ch + 1, 3, 1, leaf);
      }
    }
  });

  // Mira, on the path, two-frame idle. Larger than the crops so she reads.
  const fy = 94;
  const fx = Math.round(pathCentre(fy)) - 2;
  const bob = frame % 18 < 9 ? 0 : 1;
  px(ctx, fx, fy + bob, 5, 7, "#3b5e8c");
  px(ctx, fx, fy - 5 + bob, 5, 5, "#e8bf96");
  px(ctx, fx - 1, fy - 7 + bob, 7, 3, p.accent);
  px(ctx, fx + 1, fy - 3 + bob, 1, 1, "#3b2f24");
  px(ctx, fx + 3, fy - 3 + bob, 1, 1, "#3b2f24");
  px(ctx, fx + 5, fy + 1 + bob, 1, 4, "#e8bf96");
  ctx.globalAlpha = 0.25;
  px(ctx, fx - 1, fy + 7 + bob, 7, 1, "#2e2418");
  ctx.globalAlpha = 1;

  // Warm morning motes.
  ctx.globalAlpha = 0.45;
  const dust = mulberry32(seedOf(world) + 11);
  for (let i = 0; i < 20; i++) {
    const dx = (dust() * BUF_W + frame * 0.5) % BUF_W;
    const dy = 34 + dust() * 70 + Math.sin((frame + i * 9) * 0.18) * 2;
    px(ctx, dx, dy, 1, 1, "#fff2d6");
  }
  ctx.globalAlpha = 1;
}

/* ------------------------------------------------------------- 04 painterly */

function paintLinenFable(ctx: Ctx, world: World, frame: number) {
  const p = world.palette;
  const horizon = 62;
  // Deliberately softer sky: many thin bands, no dither, so it reads as a wash.
  for (let i = 0; i < horizon; i++) {
    const t = i / horizon;
    const c = t < 0.4 ? p.sky[0] : t < 0.72 ? p.sky[1] : p.sky[2];
    px(ctx, 0, i, BUF_W, 1, c);
  }
  ctx.globalAlpha = 0.5;
  for (let i = 0; i < horizon; i += 3) dither(ctx, 0, i, BUF_W, 1, p.sky[2], 3);
  ctx.globalAlpha = 1;
  // Carry the sky tone past the horizon: the hills undulate above and below it,
  // and a hard band would appear anywhere the land sits low.
  px(ctx, 0, horizon, BUF_W, BUF_H - horizon, p.sky[2]);

  // Low sun, with a wide diffused halo rather than a hard edge.
  ctx.globalAlpha = 0.1;
  disc(ctx, 52, 38, 30, p.accent);
  ctx.globalAlpha = 0.18;
  disc(ctx, 52, 38, 20, p.accent);
  ctx.globalAlpha = 0.5;
  disc(ctx, 52, 38, 13, p.accent);
  ctx.globalAlpha = 1;
  disc(ctx, 52, 38, 9, "#f6c6ab");

  // Rolling hills — three sine passes, no tile grid at all.
  const hill = (amp: number, freq: number, phase: number, base: number, fill: string) => {
    for (let i = 0; i < BUF_W; i++) {
      const hy = base - Math.sin(i * freq + phase) * amp - Math.sin(i * freq * 2.3 + phase) * amp * 0.3;
      px(ctx, i, hy, 1, BUF_H - hy, fill);
    }
  };
  hill(7, 0.021, 0.4, horizon + 2, p.far);
  hill(9, 0.016, 2.1, horizon + 16, p.mid);
  hill(6, 0.028, 4.4, horizon + 34, p.ground);
  px(ctx, 0, BUF_H - 10, BUF_W, 10, p.groundDeep);

  // Canopies: overlapping discs, so each tree reads as a mass of foliage
  // instead of a ball. No trunk grid, no tile alignment.
  const trees: Array<[number, number, number, string]> = [
    [20, horizon + 12, 11, "#7e646a"],
    [98, horizon + 7, 14, "#8b6f72"],
    [148, horizon + 17, 9, "#6d565a"],
    [186, horizon + 10, 12, "#7e646a"],
  ];
  trees.forEach(([tx, ty, r, fill]) => {
    px(ctx, tx - 1, ty, 3, 22, "#2a2028");
    disc(ctx, tx, ty - r * 0.5, r, fill);
    disc(ctx, tx - r * 0.7, ty, r * 0.72, fill);
    disc(ctx, tx + r * 0.7, ty + 1, r * 0.66, fill);
    ctx.globalAlpha = 0.35;
    disc(ctx, tx - r * 0.35, ty - r * 0.9, r * 0.5, "#a2848a");
    ctx.globalAlpha = 1;
  });

  // A broad, breathing wash of light off the sun. Dithered, never a slab.
  const breathe = 0.05 + Math.sin(frame * 0.07) * 0.018;
  for (let i = 0; i < 30; i++) {
    ctx.globalAlpha = breathe * (1 - i / 34);
    dither(ctx, 44 + i * 2.1, 30 + i * 2.6, 34, 4, "#f6ece4", 2);
  }
  ctx.globalAlpha = 1;

  // Pollen.
  const mote = mulberry32(0x6d3f58);
  for (let i = 0; i < 22; i++) {
    const mx = (mote() * BUF_W + frame * 0.35) % BUF_W;
    const my = 30 + mote() * 70 + Math.sin((frame + i * 11) * 0.13) * 3;
    ctx.globalAlpha = 0.45;
    px(ctx, mx, my, 1, 1, p.ink);
    ctx.globalAlpha = 1;
  }

  // A small walking figure for scale.
  const wx = 118 + ((frame / 6) % 14);
  const wy = horizon + 30;
  px(ctx, wx, wy, 3, 5, p.accentAlt);
  px(ctx, wx, wy - 3, 3, 3, p.ink);
}

/* ---------------------------------------------------------------- 05 sci-fi */

function paintOrbitalDrift(ctx: Ctx, world: World, frame: number) {
  const p = world.palette;
  px(ctx, 0, 0, BUF_W, BUF_H, p.sky[0]);

  // Starfield seen through the ring's open side.
  const star = mulberry32(seedOf(world));
  for (let i = 0; i < 90; i++) {
    const sx = Math.floor(star() * BUF_W);
    const sy = Math.floor(star() * 70);
    const tw = (frame + i * 7) % 40 < 4;
    ctx.globalAlpha = tw ? 1 : 0.35 + star() * 0.4;
    px(ctx, sx, sy, 1, 1, p.ink);
    ctx.globalAlpha = 1;
  }

  // Planet seen through the ring's open side — high and left, cropped by the
  // frame edge so it reads as large. Drawn before the deck, which never covers it.
  const cx = 34;
  const cy = 40;
  const r = 27;
  disc(ctx, cx, cy, r, p.far);
  // Cloud banding, clipped to the disc.
  for (let band = 0; band < 5; band++) {
    const by = cy - r + 5 + band * 10;
    const half = Math.round(Math.sqrt(Math.max(0, r * r - (cy - by) * (cy - by))));
    ctx.globalAlpha = band % 2 ? 0.2 : 0.11;
    px(ctx, cx - half, by, half * 2, 3, band % 2 ? "#080c10" : p.accentAlt);
    ctx.globalAlpha = 1;
  }
  // Terminator: lit along the upper-left limb, dark on the far side.
  for (let a = 90; a <= 260; a += 2) {
    const rad = (a * Math.PI) / 180;
    ctx.globalAlpha = 0.5;
    px(ctx, cx + Math.cos(rad) * r, cy - Math.sin(rad) * r, 2, 2, p.accentAlt);
    ctx.globalAlpha = 1;
  }
  ctx.globalAlpha = 0.28;
  for (let a = -70; a <= 80; a += 2) {
    const rad = (a * Math.PI) / 180;
    px(ctx, cx + Math.cos(rad) * (r - 1), cy - Math.sin(rad) * (r - 1), 3, 3, "#06090c");
  }
  ctx.globalAlpha = 1;

  // The far side of the ring, arcing across the upper frame.
  ctx.globalAlpha = 0.85;
  for (let i = 0; i < BUF_W; i++) {
    const ay = 16 + Math.round(Math.pow((i - 104) / 104, 2) * 16);
    px(ctx, i, ay, 1, 5, "#16202a");
    px(ctx, i, ay, 1, 1, "#22303c");
    if (i % 13 === 0) px(ctx, i, ay + 5, 1, 2, "#16202a");
  }
  ctx.globalAlpha = 1;

  // Hull deck across the lower half.
  const deck = 74;
  px(ctx, 0, deck, BUF_W, BUF_H - deck, p.mid);
  px(ctx, 0, deck, BUF_W, 1, "#2b3d4a");
  // Edge lighting, dashed along the deck lip rather than a continuous line.
  ctx.globalAlpha = 0.6;
  for (let lx = 2; lx < BUF_W; lx += 13) px(ctx, lx, deck, 6, 1, p.accentAlt);
  ctx.globalAlpha = 1;

  // Panel seams and rivets.
  for (let panel = 0; panel < BUF_W; panel += 26) {
    px(ctx, panel, deck + 2, 1, BUF_H - deck - 2, p.ground);
    for (let ry = deck + 6; ry < BUF_H - 4; ry += 9) {
      px(ctx, panel + 4, ry, 1, 1, p.far);
      px(ctx, panel + 21, ry, 1, 1, p.far);
    }
  }
  px(ctx, 0, deck + 14, BUF_W, 1, p.ground);
  // Deck furniture: crates and a conduit run, so the floor is not bare.
  [12, 58, 112, 166].forEach((bx, i) => {
    const bh = 5 + (i % 2) * 3;
    px(ctx, bx, deck - bh, 11, bh, "#1a242e");
    px(ctx, bx, deck - bh, 11, 1, "#26333f");
    px(ctx, bx + 2, deck - bh + 2, 7, 1, "#0f161c");
  });
  for (let cxp = 0; cxp < BUF_W; cxp += 4) px(ctx, cxp, deck + 9, 2, 1, "#1a242e");

  // Hazard stripe band, pulsing like a heartbeat.
  const pulse = 0.45 + Math.abs(Math.sin(frame * 0.14)) * 0.55;
  ctx.globalAlpha = pulse;
  for (let sx = -8; sx < BUF_W; sx += 8) {
    for (let s = 0; s < 4; s++) px(ctx, sx + s + 4, deck + 18 + s, 4, 1, p.accent);
  }
  ctx.globalAlpha = 1;
  px(ctx, 0, deck + 17, BUF_W, 1, p.groundDeep);
  px(ctx, 0, deck + 23, BUF_W, 1, p.groundDeep);

  // Corridor windows with drifting light inside.
  [34, 84, 134, 178].forEach((wx, i) => {
    px(ctx, wx, deck - 22, 18, 20, p.ground);
    px(ctx, wx, deck - 22, 18, 1, p.far);
    const lit = (frame + i * 9) % 60 < 42;
    ctx.globalAlpha = lit ? 0.85 : 0.2;
    px(ctx, wx + 2, deck - 20, 14, 16, p.accentAlt);
    ctx.globalAlpha = 1;
    px(ctx, wx + 8, deck - 20, 1, 16, p.ground);
  });

  // Maintenance drone tracking along the deck.
  const dx = (frame * 1.4) % (BUF_W + 20) - 10;
  px(ctx, dx, deck - 7, 5, 4, p.ink);
  px(ctx, dx + 1, deck - 3, 3, 1, p.far);
  ctx.globalAlpha = (frame % 12) < 6 ? 1 : 0.3;
  px(ctx, dx + 5, deck - 6, 1, 1, p.accent);
  ctx.globalAlpha = 1;
}

const PAINTERS: Record<string, (ctx: Ctx, world: World, frame: number) => void> = {
  "neon-sector": paintNeonSector,
  "ashen-hollow": paintAshenHollow,
  "tideglass-farm": paintTideglassFarm,
  "linen-fable": paintLinenFable,
  "orbital-drift": paintOrbitalDrift,
};

export function paintWorld(ctx: Ctx, world: World, frame: number) {
  ctx.clearRect(0, 0, BUF_W, BUF_H);
  (PAINTERS[world.id] ?? paintTideglassFarm)(ctx, world, frame);
}
