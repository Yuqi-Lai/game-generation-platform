from __future__ import annotations

from collections import deque
from io import BytesIO

from PIL import Image, ImageFilter

from .playable import SPRITE_FRAME_COUNT, SPRITE_FRAME_HEIGHT, SPRITE_FRAME_WIDTH


def decode_image(value: bytes) -> Image.Image:
    with Image.open(BytesIO(value)) as image:
        image.load()
        return image.convert("RGBA")


def remove_edge_background(image: Image.Image, threshold: int = 235) -> Image.Image:
    image = image.convert("RGBA")
    pixels = image.load()
    width, height = image.size
    background = set()
    queue: deque[tuple[int, int]] = deque()
    queue.extend((x, y) for x in range(width) for y in (0, height - 1))
    queue.extend((x, y) for y in range(height) for x in (0, width - 1))

    def near_white(x: int, y: int) -> bool:
        red, green, blue, alpha = pixels[x, y]
        return alpha > 0 and min(red, green, blue) >= threshold and max(red, green, blue) - min(red, green, blue) <= 20

    while queue:
        x, y = queue.popleft()
        if (x, y) in background or not near_white(x, y):
            continue
        background.add((x, y))
        if x: queue.append((x - 1, y))
        if x + 1 < width: queue.append((x + 1, y))
        if y: queue.append((x, y - 1))
        if y + 1 < height: queue.append((x, y + 1))

    alpha = image.getchannel("A")
    alpha_pixels = alpha.load()
    for x, y in background:
        alpha_pixels[x, y] = 0
    image.putalpha(alpha.filter(ImageFilter.MedianFilter(3)))
    return image


def normalize_single_sprite(value: bytes, size: tuple[int, int] = (128, 128)) -> bytes:
    image = remove_edge_background(decode_image(value))
    box = image.getbbox()
    if box is None:
        raise ValueError("generated sprite contains no visible pixels")
    character = image.crop(box)
    character.thumbnail((int(size[0] * .88), int(size[1] * .9)), Image.Resampling.NEAREST)
    canvas = Image.new("RGBA", size, (0, 0, 0, 0))
    canvas.alpha_composite(character, ((size[0] - character.width) // 2, size[1] - character.height))
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
    return encode_png(output)


def normalize_avatar(value: bytes) -> bytes:
    image = remove_edge_background(decode_image(value))
    box = image.getbbox()
    if box is None:
        raise ValueError("generated avatar contains no visible pixels")
    image = image.crop(box)
    image.thumbnail((240, 240), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
    canvas.alpha_composite(image, ((256 - image.width) // 2, 256 - image.height))
    return encode_png(canvas)


def normalize_background(value: bytes) -> bytes:
    image = decode_image(value).convert("RGB")
    image = image.resize((2560, 1440), Image.Resampling.NEAREST)
    return encode_png(image)


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
