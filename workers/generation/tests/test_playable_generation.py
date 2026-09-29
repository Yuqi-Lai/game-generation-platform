from io import BytesIO
import json
from types import SimpleNamespace

import pytest
from PIL import Image, ImageDraw
from pydantic import ValidationError

from generation_worker.generator import (
    DEFAULT_ART_DIRECTION,
    DEFAULT_SCENE_BASE,
    DEFAULT_SPRITE_BASE,
    GLOBAL_VISUAL_ANCHOR,
    SCENE_RENDER_GUARD,
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
            collision_rectangles=[CollisionRect(x=450 if blocked_spawn else 700, y=600, width=300, height=300)],
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
    draw.rectangle((76, 85, 78, 87), fill=(43, 224, 49, 255))
    output = BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


def synthetic_gradient_background() -> bytes:
    image = Image.new("RGB", (256, 144))
    pixels = image.load()
    for y in range(image.height):
        for x in range(image.width):
            pixels[x, y] = (x, min(255, 80 + y), (x + y) % 256)
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
        return synthetic_source_png() if aspect_ratio == "16:9" else synthetic_chroma_sprite()


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
            alpha and green >= 170 and green - max(red, blue) >= 100
            for red, green, blue, alpha in image.getdata()
        )


def test_single_sprite_rejects_a_contact_sheet():
    with pytest.raises(ValueError, match="multiple disconnected figures"):
        normalize_single_sprite(synthetic_source_png())


def test_single_sprite_has_a_two_pixel_grid_without_blur():
    sprite = normalize_single_sprite(synthetic_chroma_sprite())
    with Image.open(BytesIO(sprite)).convert("RGBA") as image:
        for x, y in ((0, 0), (40, 40), (64, 64), (88, 118)):
            assert len({image.getpixel((x + dx, y + dy)) for dx in range(2) for dy in range(2)}) == 1


def test_background_normalization_has_a_four_pixel_grid_without_blur():
    background = normalize_background(synthetic_gradient_background())
    validate_png(background, (2560, 1440), require_transparency=False)
    with Image.open(BytesIO(background)).convert("RGB") as image:
        assert len(image.getcolors(maxcolors=257) or []) <= 256
        for x, y in ((0, 0), (400, 400), (1200, 800), (2400, 1200)):
            assert len({image.getpixel((x + dx, y + dy)) for dx in range(4) for dy in range(4)}) == 1


def test_background_color_is_moderated_without_becoming_gray():
    source = Image.new("RGB", (256, 144), (0, 255, 255))
    buffer = BytesIO()
    source.save(buffer, format="PNG")
    with Image.open(BytesIO(normalize_background(buffer.getvalue()))).convert("RGB") as image:
        red, green, blue = image.getpixel((100, 100))
        assert 120 < max(red, green, blue) - min(red, green, blue) < 240


def test_unsafe_map_uses_anchored_traversable_fallback():
    normalized = normalize_plan(synthetic_plan(blocked_spawn=True))
    scene = normalized.scenes[0]
    assert scene.player_spawn == Point(x=512, y=720)
    assert scene.exit == Point(x=2048, y=720)
    assert len(scene.collision_rectangles) == 4


def test_numerically_valid_model_spawn_and_exit_still_use_visual_route_anchors():
    scene = normalize_plan(synthetic_plan()).scenes[0]
    assert scene.player_spawn == Point(x=512, y=720)
    assert scene.exit == Point(x=2048, y=720)
    assert scene.collision_rectangles == synthetic_plan().scenes[0].collision_rectangles


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
    assert "If the premise is vague or short, expand it" in captured["contents"]


def test_malformed_nested_plan_json_is_retried_once():
    plan = synthetic_plan().model_dump(mode="json", by_alias=True)
    wire = {
        "title": plan["title"], "openingRemarks": plan["openingRemarks"],
        "styleJson": json.dumps(plan["style"]), "playerJson": json.dumps(plan["player"]),
        "npcsJson": json.dumps(plan["npcs"]), "minionsJson": json.dumps(plan["minions"]),
        "scenesJson": json.dumps(plan["scenes"]),
    }
    calls = 0

    class Models:
        def generate_content(self, **kwargs):
            nonlocal calls
            calls += 1
            return SimpleNamespace(text=json.dumps({**wire, "scenesJson": "{"}) if calls == 1 else json.dumps(wire))

    generator = GeminiGenerator.__new__(GeminiGenerator)
    generator._settings = SimpleNamespace(gemini_text_model="synthetic-text")
    generator._client = SimpleNamespace(models=Models())
    assert generator._generate_plan("A vague farm premise").title == "Beacon Workshop"
    assert calls == 2


def test_excess_model_collision_rectangles_use_bounded_fallback():
    plan = synthetic_plan().model_dump(mode="json", by_alias=True)
    plan["scenes"][0]["collisionRectangles"] *= 13
    wire = {
        "title": plan["title"], "openingRemarks": plan["openingRemarks"],
        "styleJson": json.dumps(plan["style"]), "playerJson": json.dumps(plan["player"]),
        "npcsJson": json.dumps(plan["npcs"]), "minionsJson": json.dumps(plan["minions"]),
        "scenesJson": json.dumps(plan["scenes"]),
    }

    class Models:
        def generate_content(self, **kwargs):
            return SimpleNamespace(text=json.dumps(wire))

    generator = GeminiGenerator.__new__(GeminiGenerator)
    generator._settings = SimpleNamespace(gemini_text_model="synthetic-text")
    generator._client = SimpleNamespace(models=Models())
    assert len(generator._generate_plan("A farm").scenes[0].collision_rectangles) == 4


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


def test_every_asset_prompt_uses_the_permanent_jrpg_base():
    prompts: list[tuple[str, str]] = []

    class CapturingGenerator(SyntheticGeminiGenerator):
        def _generate_plan(self, prompt: str) -> GamePlan:
            plan = synthetic_plan()
            plan.style.art_direction = "Soft watercolor sketch"
            plan.npcs = [PlanCharacter(
                id="guide", name="Guide", description="An old guide in a blue coat",
                stats=CombatStats(hp=30, attack=3, defense=2),
            )]
            plan.minions = [PlanCharacter(
                id="sprite", name="Sprite", description="A tiny copper creature",
                stats=CombatStats(hp=10, attack=2, defense=1),
            )]
            plan.scenes[0].npc_ids = ["guide"]
            plan.scenes[0].minion_ids = ["sprite"]
            return plan

        def _generate_image(self, prompt: str, references=None, aspect_ratio="1:1") -> bytes:
            prompts.append((prompt, aspect_ratio))
            return synthetic_source_png() if aspect_ratio == "16:9" else synthetic_chroma_sprite()

    output = CapturingGenerator().generate("A clockwork rescue", "projects/p/jobs/j/attempts/a")

    assert output.content.style.art_direction == DEFAULT_ART_DIRECTION
    assert len(prompts) == 9
    assert all(prompt.endswith(DEFAULT_SPRITE_BASE) for prompt, _ in prompts[:-1])
    assert prompts[-1][0].endswith(DEFAULT_SCENE_BASE + SCENE_RENDER_GUARD)
    assert all(GLOBAL_VISUAL_ANCHOR in prompt for prompt, _ in prompts)
    assert not any("watercolor" in prompt.lower() for prompt, _ in prompts)
    assert all("no second row, no stacked or partial duplicates" in prompt for prompt, _ in prompts[1:4])
    assert not any("witch" in prompt.lower() or "windmill" in prompt.lower() for prompt, _ in prompts)
    assert prompts[0][1] == "1:1"
    assert prompts[-1][1] == "16:9"
    assert not any("collisionrectangles" in prompt.lower() for prompt, _ in prompts)
    assert not any("(700,600" in prompt for prompt, _ in prompts)
    assert any("every pixel outside the character silhouette" in prompt for prompt, _ in prompts)
