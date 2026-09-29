from __future__ import annotations

from collections import deque
from io import BytesIO

from PIL import Image, ImageEnhance

from .playable import SPRITE_FRAME_COUNT, SPRITE_FRAME_HEIGHT, SPRITE_FRAME_WIDTH


def decode_image(value: bytes) -> Image.Image:
    with Image.open(BytesIO(value)) as image:
        image.load()
        return image.convert("RGBA")


def remove_edge_background(image: Image.Image, threshold: int = 235) -> Image.Image:
    """Remove edge-connected white/chroma-green backgrounds and force binary alpha.

    Gemini currently returns JPEG image payloads, so the chroma key deliberately
    tolerates compression noise. Flood filling from the canvas edge prevents green
    details inside a character from being removed.
    """
    image = image.convert("RGBA")
    pixels = image.load()
    width, height = image.size
    background = set()
    queue: deque[tuple[int, int]] = deque()
    queue.extend((x, y) for x in range(width) for y in (0, height - 1))
    queue.extend((x, y) for y in range(height) for x in (0, width - 1))

    def background_color(x: int, y: int) -> bool:
        red, green, blue, alpha = pixels[x, y]
        near_white = (
            min(red, green, blue) >= threshold
            and max(red, green, blue) - min(red, green, blue) <= 24
        )
        chroma_green = green >= 100 and green - red >= 35 and green - blue >= 35
        return alpha > 0 and (near_white or chroma_green)

    while queue:
        x, y = queue.popleft()
        if (x, y) in background or not background_color(x, y):
            continue
        background.add((x, y))
        if x: queue.append((x - 1, y))
        if x + 1 < width: queue.append((x + 1, y))
        if y: queue.append((x, y - 1))
        if y + 1 < height: queue.append((x, y + 1))

    for x, y in background:
        pixels[x, y] = (0, 0, 0, 0)

    # Remove opaque JPEG/color-key fringe immediately adjacent to the cutout.
    for _ in range(4):
        fringe: list[tuple[int, int]] = []
        for y in range(height):
            for x in range(width):
                if pixels[x, y][3] == 0 or not background_color(x, y):
                    continue
                neighbors = ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1))
                if any(
                    0 <= nx < width and 0 <= ny < height and pixels[nx, ny][3] == 0
                    for nx, ny in neighbors
                ):
                    fringe.append((x, y))
        for x, y in fringe:
            pixels[x, y] = (0, 0, 0, 0)

    # Remove green JPEG spill that survives immediately inside the keyed edge.
    for y in range(height):
        for x in range(width):
            red, green, blue, alpha = pixels[x, y]
            if alpha == 0:
                continue
            edge_neighbor = any(
                0 <= nx < width and 0 <= ny < height and pixels[nx, ny][3] == 0
                for nx, ny in (
                    (x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1),
                    (x - 2, y), (x + 2, y), (x, y - 2), (x, y + 2),
                )
            )
            if not edge_neighbor:
                continue
            dominance = green - max(red, blue)
            if green >= 90 and dominance >= 28:
                pixels[x, y] = (0, 0, 0, 0)
            elif dominance >= 12:
                pixels[x, y] = (red, max(red, blue), blue, alpha)

    # JPEG can leave isolated chroma-green specks inside a silhouette that are
    # not edge-connected. Treat strongly green pixels as key color everywhere.
    for y in range(height):
        for x in range(width):
            red, green, blue, alpha = pixels[x, y]
            if alpha and green >= 170 and green - max(red, blue) >= 100:
                pixels[x, y] = (0, 0, 0, 0)

    # Pixel art must never contain a semi-transparent antialiasing halo.
    for y in range(height):
        for x in range(width):
            red, green, blue, alpha = pixels[x, y]
            pixels[x, y] = (0, 0, 0, 0) if alpha < 128 else (red, green, blue, 255)
    return image


def harden_alpha(image: Image.Image) -> Image.Image:
    image = image.convert("RGBA")
    alpha = image.getchannel("A").point(lambda value: 255 if value >= 128 else 0)
    image.putalpha(alpha)
    pixels = image.load()

    # LANCZOS resizing can blend chroma-key RGB back into the first opaque
    # pixels even after the source was clean. Remove strong spill and neutralize
    # weaker green dominance only at the cutout boundary.
    for _ in range(2):
        transparent: list[tuple[int, int]] = []
        neutralize: list[tuple[int, int, int, int, int]] = []
        for y in range(image.height):
            for x in range(image.width):
                red, green, blue, pixel_alpha = pixels[x, y]
                if pixel_alpha == 0:
                    continue
                touches_transparency = any(
                    0 <= nx < image.width
                    and 0 <= ny < image.height
                    and pixels[nx, ny][3] == 0
                    for nx, ny in (
                        (x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1),
                        (x - 1, y - 1), (x + 1, y - 1),
                        (x - 1, y + 1), (x + 1, y + 1),
                    )
                )
                if not touches_transparency:
                    continue
                dominance = green - max(red, blue)
                if green >= 90 and dominance >= 20:
                    transparent.append((x, y))
                elif dominance >= 10:
                    neutralize.append((x, y, red, max(red, blue), blue))
        for x, y in transparent:
            pixels[x, y] = (0, 0, 0, 0)
        for x, y, red, green, blue in neutralize:
            pixels[x, y] = (red, green, blue, 255)

    # The final erosion pass can expose one more row of green-tinted pixels.
    # Neutralize that row without changing alpha again, so the cleanup cannot
    # recursively eat into legitimately green character details.
    for y in range(image.height):
        for x in range(image.width):
            red, green, blue, pixel_alpha = pixels[x, y]
            if pixel_alpha == 0 or green - max(red, blue) < 10:
                continue
            if any(
                0 <= nx < image.width
                and 0 <= ny < image.height
                and pixels[nx, ny][3] == 0
                for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1))
            ):
                pixels[x, y] = (red, max(red, blue), blue, 255)

    for y in range(image.height):
        for x in range(image.width):
            if pixels[x, y][3] == 0:
                pixels[x, y] = (0, 0, 0, 0)
    return image


def pixel_grid(image: Image.Image, scale: int, colors: int) -> Image.Image:
    """Use a fixed logical grid and a nondithered palette for hard pixel edges."""
    logical_size = (image.width // scale, image.height // scale)
    logical = image.resize(logical_size, Image.Resampling.NEAREST)
    alpha = logical.getchannel("A") if logical.mode == "RGBA" else None
    rgb = logical.convert("RGB").quantize(
        colors=colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE
    ).convert("RGB")
    if alpha is not None:
        rgb = rgb.convert("RGBA")
        rgb.putalpha(alpha)
    return rgb.resize(image.size, Image.Resampling.NEAREST)


def largest_opaque_component_fraction(image: Image.Image) -> float:
    alpha = image.getchannel("A")
    pixels = alpha.load()
    seen: set[tuple[int, int]] = set()
    largest = 0
    total = 0
    for y in range(image.height):
        for x in range(image.width):
            if pixels[x, y] == 0 or (x, y) in seen:
                continue
            queue = deque([(x, y)])
            seen.add((x, y))
            size = 0
            while queue:
                current_x, current_y = queue.popleft()
                size += 1
                for next_x, next_y in (
                    (current_x - 1, current_y), (current_x + 1, current_y),
                    (current_x, current_y - 1), (current_x, current_y + 1),
                ):
                    neighbor = (next_x, next_y)
                    if (0 <= next_x < image.width and 0 <= next_y < image.height
                            and pixels[next_x, next_y] != 0 and neighbor not in seen):
                        seen.add(neighbor)
                        queue.append(neighbor)
            total += size
            largest = max(largest, size)
    return largest / total if total else 0


def normalize_single_sprite(value: bytes, size: tuple[int, int] = (128, 128)) -> bytes:
    image = remove_edge_background(decode_image(value))
    box = image.getbbox()
    if box is None:
        raise ValueError("generated sprite contains no visible pixels")
    character = image.crop(box)
    character.thumbnail((int(size[0] * .88), int(size[1] * .9)), Image.Resampling.NEAREST)
    canvas = Image.new("RGBA", size, (0, 0, 0, 0))
    canvas.alpha_composite(character, ((size[0] - character.width) // 2, size[1] - character.height))
    canvas = pixel_grid(harden_alpha(canvas), 2, 128)
    if largest_opaque_component_fraction(canvas) < 0.45:
        raise ValueError("generated single sprite contains multiple disconnected figures")
    visible_pixels = sum(value > 0 for value in canvas.getchannel("A").getdata())
    if visible_pixels / (size[0] * size[1]) > 0.60:
        raise ValueError("generated sprite contains a scene or non-character background")
    return encode_png(canvas)


def normalize_sprite_strip(value: bytes) -> bytes:
    image = remove_edge_background(decode_image(value))
    source_width, source_height = image.size
    output = Image.new(
        "RGBA", (SPRITE_FRAME_WIDTH * SPRITE_FRAME_COUNT, SPRITE_FRAME_HEIGHT), (0, 0, 0, 0)
    )
    for index in range(SPRITE_FRAME_COUNT):
        left = round(index * source_width / SPRITE_FRAME_COUNT)
        right = round((index + 1) * source_width / SPRITE_FRAME_COUNT)
        cell = image.crop((left, 0, right, source_height))
        box = cell.getbbox()
        if box is None:
            raise ValueError(f"generated sprite strip frame {index + 1} is empty")
        frame = cell.crop(box)
        frame.thumbnail((112, 116), Image.Resampling.NEAREST)
        output.alpha_composite(frame, (index * SPRITE_FRAME_WIDTH + (128 - frame.width) // 2, 128 - frame.height))
    return encode_png(pixel_grid(harden_alpha(output), 2, 192))


def normalize_avatar(value: bytes) -> bytes:
    image = remove_edge_background(decode_image(value))
    box = image.getbbox()
    if box is None:
        raise ValueError("generated avatar contains no visible pixels")
    image = image.crop(box)
    image.thumbnail((240, 240), Image.Resampling.NEAREST)
    canvas = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
    canvas.alpha_composite(image, ((256 - image.width) // 2, 256 - image.height))
    return encode_png(pixel_grid(harden_alpha(canvas), 2, 192))


def normalize_background(value: bytes) -> bytes:
    image = decode_image(value).convert("RGB")
    image = ImageEnhance.Color(image).enhance(0.78)
    image = image.resize((640, 360), Image.Resampling.NEAREST)
    image = image.quantize(
        colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE
    ).convert("RGB")
    return encode_png(image.resize((2560, 1440), Image.Resampling.NEAREST))


def validate_png(value: bytes, expected_size: tuple[int, int], require_transparency: bool) -> None:
    with Image.open(BytesIO(value)) as image:
        image.verify()
    with Image.open(BytesIO(value)) as image:
        if image.format != "PNG" or image.size != expected_size:
            raise ValueError(f"expected PNG {expected_size[0]}x{expected_size[1]}, got {image.format} {image.size}")
        if require_transparency:
            alpha = image.convert("RGBA").getchannel("A")
            low, high = alpha.getextrema()
            if low == high == 255:
                raise ValueError("sprite image must contain transparent pixels")


def encode_png(image: Image.Image) -> bytes:
    output = BytesIO()
    image.save(output, format="PNG", optimize=True)
    return output.getvalue()
