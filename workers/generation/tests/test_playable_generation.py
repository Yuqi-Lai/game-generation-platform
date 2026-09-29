from io import BytesIO
import json
from types import SimpleNamespace

import pytest
from PIL import Image, ImageDraw
from pydantic import ValidationError

from generation_worker.generator import (
    BACKGROUND_NEO_PIXEL_PROMPT,
    SPRITE_NEO_PIXEL_PROMPT,
    GeminiGenerator,
)
from generation_worker.image_processing import (
    normalize_background,
    normalize_single_sprite,
    normalize_sprite_strip,
    validate_png,
)
from generation_worker.playable import (
    CombatStats,
    CollisionRect,
    GamePlan,
    PlanCharacter,
    PlanScene,
    Point,
    VisualStyle,
    normalize_plan,
)


def synthetic_plan(*, blocked_spawn: bool = False) -> GamePlan:
    return GamePlan(
        title="Beacon Workshop",
        opening_remarks="The city beacon has gone dark.",
        style=VisualStyle(
            art_direction="Readable clockwork pixel art with warm rim light",
            palette=["brass", "deep teal", "cream"],
            world_description="A compact mechanical city built around an ancient beacon",
        ),
        player=PlanCharacter(
            id="ari", name="Ari", description="A young mechanic in a green travel coat",
            stats=CombatStats(hp=100, attack=12, defense=8),
        ),
        npcs=[],
        minions=[],
        scenes=[PlanScene(
            id="workshop", title="The Workshop", location="A bright clockwork workshop",
            objective="Repair the beacon", player_spawn=Point(x=128, y=720),
            exit=Point(x=2432, y=720),
            collision_rectangles=[CollisionRect(x=0 if blocked_spawn else 700, y=600, width=300, height=300)],
        )],
    )


def synthetic_source_png() -> bytes:
    image = Image.new("RGB", (768, 256), "white")
    draw = ImageDraw.Draw(image)
    for index, color in enumerate(("#227755", "#338866", "#116644")):
        left = index * 256 + 72
        draw.rectangle((left, 32, left + 112, 236), fill=color)
        draw.rectangle((left + 24, 8, left + 88, 72), fill="#d8a47f")
    output = BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


def synthetic_chroma_sprite() -> bytes:
    image = Image.new("RGBA", (128, 128), "#00ff00")
    draw = ImageDraw.Draw(image)
    draw.rectangle((38, 22, 90, 119), fill=(245, 245, 245, 255))
    draw.rectangle((40, 24, 88, 119), fill=(156, 64, 48, 255))
    draw.rectangle((48, 8, 80, 42), fill=(224, 176, 128, 200))
    output = BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


class SyntheticGeminiGenerator(GeminiGenerator):
    def __init__(self):
        self._settings = SimpleNamespace(
            gemini_text_model="synthetic-text",
            gemini_image_model="synthetic-image",
            playable_asset_base_url="http://objects.test/bucket/",
        )
        self.image_calls = 0

    def _generate_plan(self, prompt: str) -> GamePlan:
        return synthetic_plan()

    def _generate_image(self, prompt: str, references=None, aspect_ratio="1:1") -> bytes:
        self.image_calls += 1
        return synthetic_source_png()


def test_sprite_strip_is_exactly_three_128_pixel_frames_with_alpha():
    strip = normalize_sprite_strip(synthetic_source_png())
    validate_png(strip, (384, 128), require_transparency=True)
    with Image.open(BytesIO(strip)) as image:
        assert image.width // 128 == 3


def test_sprite_normalization_removes_chroma_and_forces_binary_alpha():
    sprite = normalize_single_sprite(synthetic_chroma_sprite())
    validate_png(sprite, (128, 128), require_transparency=True)
    with Image.open(BytesIO(sprite)).convert("RGBA") as image:
        assert set(image.getchannel("A").getdata()) <= {0, 255}
        assert image.getpixel((0, 0)) == (0, 0, 0, 0)
        assert not any(
            alpha and green > 150 and green - red >= 55 and green - blue >= 55
            for red, green, blue, alpha in image.getdata()
        )


def test_background_normalization_uses_64_color_two_pixel_grid():
    background = normalize_background(synthetic_source_png())
    validate_png(background, (2560, 1440), require_transparency=False)
    with Image.open(BytesIO(background)).convert("RGB") as image:
        assert len(image.getcolors(maxcolors=65)) <= 64
        for x, y in ((0, 0), (400, 400), (1200, 800), (2400, 1200)):
            assert len({image.getpixel((x + dx, y + dy)) for dx in range(2) for dy in range(2)}) == 1


def test_unsafe_map_uses_anchored_traversable_fallback():
    normalized = normalize_plan(synthetic_plan(blocked_spawn=True))
    scene = normalized.scenes[0]
    assert scene.player_spawn == Point(x=128, y=720)
    assert scene.exit == Point(x=2432, y=720)
    assert len(scene.collision_rectangles) == 4


def test_contract_rejects_non_anchored_world_size_and_missing_asset_reference():
    output = SyntheticGeminiGenerator().generate("A clockwork rescue", "projects/p/jobs/j/attempts/a")
    document = output.content.model_dump(mode="json", by_alias=True)
    document["world"]["width"] = 2048
    with pytest.raises(ValidationError):
        output.content.__class__.model_validate(document)

    document = output.content.model_dump(mode="json", by_alias=True)
    document["assets"] = [asset for asset in document["assets"] if asset["id"] != "player.right"]
    with pytest.raises(ValidationError, match="missing assets"):
        output.content.__class__.model_validate(document)


def test_plan_generation_uses_generate_content_structured_output_config():
    captured = {}
    plan = synthetic_plan().model_dump(mode="json", by_alias=True)
    wire = {
        "title": plan["title"],
        "openingRemarks": plan["openingRemarks"],
        "styleJson": json.dumps(plan["style"]),
        "playerJson": json.dumps(plan["player"]),
        "npcsJson": json.dumps(plan["npcs"]),
        "minionsJson": json.dumps(plan["minions"]),
        "scenesJson": json.dumps(plan["scenes"]),
    }

    class Models:
        def generate_content(self, **kwargs):
            captured.update(kwargs)
            return SimpleNamespace(text=json.dumps(wire))

    generator = GeminiGenerator.__new__(GeminiGenerator)
    generator._settings = SimpleNamespace(gemini_text_model="gemini-3.8-flash")
    generator._client = SimpleNamespace(models=Models())

    assert generator._generate_plan("An original test story").title == "Beacon Workshop"
    assert captured["model"] == "gemini-3.8-flash"
    assert captured["config"].response_mime_type == "application/json"
    assert set(captured["config"].response_schema["required"]) == set(wire)
    assert "collisionRectangles" in captured["contents"]
    assert "lowercase kebab-case" in captured["contents"]
    assert "palette must be a JSON array" in captured["contents"]


def test_synthetic_provider_builds_complete_playable_manifest_before_success():
    generator = SyntheticGeminiGenerator()
    output = generator.generate("A clockwork rescue", "projects/p/jobs/j/attempts/a")

    assert output.content.version == "playable-game-content/v1"
    assert output.content.world.width == 2560
    assert output.content.world.height == 1440
    assert output.content.player.assets.frame_count == 3
    assert generator.image_calls == 6
    assert {asset.id for asset in output.assets} == {asset.id for asset in output.content.assets}
    assert all(asset.object_key.startswith("projects/p/jobs/j/attempts/a/") for asset in output.assets)


def test_asset_prompts_lock_pixel_art_projection_palette_and_chroma_key():
    prompts: list[tuple[str, str]] = []

    class CapturingGenerator(SyntheticGeminiGenerator):
        def _generate_image(self, prompt: str, references=None, aspect_ratio="1:1") -> bytes:
            prompts.append((prompt, aspect_ratio))
            return synthetic_source_png()

    CapturingGenerator().generate("A clockwork rescue", "projects/p/jobs/j/attempts/a")

    assert any(SPRITE_NEO_PIXEL_PROMPT in prompt for prompt, _ in prompts)
    assert any(BACKGROUND_NEO_PIXEL_PROMPT in prompt for prompt, _ in prompts)
    assert all("no muddy colors" in prompt for prompt, _ in prompts)
    assert prompts[0][1] == "1:1"
    assert any(BACKGROUND_NEO_PIXEL_PROMPT in prompt and ratio == "16:9" for prompt, ratio in prompts)
