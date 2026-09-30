from __future__ import annotations

import base64
import hashlib
import json
from dataclasses import dataclass

from google import genai
from google.genai import types

from .image_processing import (
    normalize_avatar,
    normalize_background,
    normalize_single_sprite,
    normalize_sprite_strip,
    validate_png,
)
from .playable import (
    AssetDescriptor,
    CharacterAssets,
    FALLBACK_COLLISIONS,
    GamePlan,
    PlayableCharacter,
    PlayableGameContentV1,
    PlayablePlayer,
    PlayableScene,
    PlayerAssets,
    normalize_plan,
)
from .settings import Settings


PLAN_SYSTEM_PROMPT = """
Create a compact, playable top-down 2D JRPG plan from the user's premise.
This request is only for the plan; do not describe image files or generate assets.
Preserve explicit character appearances, setting details, story events, and the order
and meaning of any dialogue in the premise. Add brief connective dialogue only when
the premise contains none. If the premise is vague or short, expand it into an
original, specific mini-adventure: a clear playable objective, two or three memorable
landmarks, a consistent character appearance, and a few purposeful dialogue lines.
Do not replace the user's concrete details or invent a different genre or setting.
Choose a restrained palette of nuanced midtones with one bright accent; avoid neon
or uniformly saturated colors. Keep the cast and map small enough for a short demo.
Buildings should be human-scale, not monumental, unless the premise requires them.
Dialogue speakers must exactly match the player or an NPC
name. The world is exactly 2560x1440. Place the player spawn and exit on solid walkable
ground along a clear central route, never in water, void, cliffs, or a building.
Use no more than six simple axis-aligned collision rectangles.
artDirection must describe classic 2D JRPG pixel art. worldDescription and location
must describe places and objects, without competing visual-medium instructions.
""".strip()

PLAN_OUTPUT_LAYOUT = """
Return a flat JSON wrapper. title and openingRemarks are plain strings. The remaining
fields are strings containing serialized JSON with these exact shapes:
- styleJson: {artDirection, palette, worldDescription}
- playerJson: {id, name, description, stats: {hp, attack, defense}}
- npcsJson and minionsJson: arrays of the same character shape
- scenesJson: [{id, title, location, objective, npcIds, minionIds,
  dialogue: [{speaker, text}], playerSpawn: {x, y}, exit: {x, y},
  collisionRectangles: [{x, y, width, height}]}]
Each *Json value must be valid serialized JSON text. Do not add other wrapper fields.
palette must be a JSON array containing 3 to 8 short color strings.
Every id and every npcIds/minionIds reference must use lowercase kebab-case with no underscores.
""".strip()

GAME_PLAN_WIRE_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "openingRemarks": {"type": "string"},
        "styleJson": {"type": "string"},
        "playerJson": {"type": "string"},
        "npcsJson": {"type": "string"},
        "minionsJson": {"type": "string"},
        "scenesJson": {"type": "string"},
    },
    "required": [
        "title", "openingRemarks", "styleJson", "playerJson",
        "npcsJson", "minionsJson", "scenesJson",
    ],
}

DEFAULT_ART_DIRECTION = "Classic 2D JRPG pixel art with a consistent palette and crisp square pixels"
GLOBAL_VISUAL_ANCHOR = (
    "One shared visual bible for the entire game: a 64-world-pixel tile rhythm, "
    "readable 1.5-to-2-tile-tall actors, compact one-story buildings about 3-to-4 tiles tall, "
    "human-scale props, a single consistent soft light direction from the upper left, "
    "moderate saturation with nuanced midtones and only one vivid accent, clear silhouettes, "
    "and the same material textures and proportions across every asset. "
    "Use a compact playable composition with breathing room rather than oversized scenery."
)
DEFAULT_SPRITE_BASE = (
    ", classic 2D JRPG pixel art sprite sheet, 1.5 to 2-head-tall chibi proportions, "
    "distinct 1-pixel dark outline, retro pixel cluster shading, strictly 2D flat orthographic "
    "front/side view, solid pure chroma-green (#00FF00) background, sharp nearest-neighbor "
    "pixel edges, zero smooth vector art, zero blurry lines"
)
DEFAULT_SCENE_BASE = (
    ", masterpiece 2D JRPG pixel art environmental tilemap, authentic retro 16-bit RPG "
    "aesthetic, clean pixel textures, strictly 2D orthographic top-down flat grid projection, "
    "zero 3D perspective distortion, zero vanishing points, zero smooth gradients"
)
SCENE_RENDER_GUARD = (
    ", environment-only tilemap with open walkable space reserved for runtime actors; "
    "absolutely no player character, NPC, person, creature, animal, face, character silhouette, "
    "statue, mannequin, portrait, or character-shaped decoration anywhere in the image; "
    "tile alignment is invisible; no drawn grid lines, guide squares, or tile boundaries"
)


@dataclass(frozen=True)
class GeneratedPlayableAsset:
    id: str
    role: str
    object_key: str
    body: bytes
    content_type: str
    width: int
    height: int


@dataclass(frozen=True)
class GenerationOutput:
    content: PlayableGameContentV1
    assets: list[GeneratedPlayableAsset]
    model: str


class GeminiGenerator:
    def __init__(self, settings: Settings):
        self._settings = settings
        self._client = genai.Client(api_key=settings.gemini_api_key)

    def generate(self, prompt: str, output_prefix: str) -> GenerationOutput:
        # The plan is accepted before any image-generation work begins.
        plan = normalize_plan(self._generate_plan(prompt))
        plan.style.art_direction = DEFAULT_ART_DIRECTION
        generated: list[GeneratedPlayableAsset] = []
        style = self._style_prompt(plan)
        scene_style = self._scene_style_prompt(plan)
        player = plan.player

        stand = self._asset(
            generated, output_prefix, "player.stand", "PLAYER_STAND", "player/stand.png",
            normalize_single_sprite(self._generate_image(self._sprite_prompt(
                style, "Exactly one full-body front-facing character, centered on an empty canvas. "
                f"Character: {player.name}. Canonical appearance: {player.description}. No text, scenery, "
                "floor, props, environmental vignette, or drop shadow. Fill every pixel outside the character "
                "silhouette with exactly #00FF00."
            ))), 128, 128, True,
        )
        directions: dict[str, GeneratedPlayableAsset] = {}
        screen_facing = {
            "down": "front view toward the viewer (screen-down / south); face and chest visible",
            "up": "rear view away from the viewer (screen-up / north); back visible, no face or eyes",
            "right": "strict right-facing side profile (screen-right / east); nose, face, chest and toes point toward the RIGHT edge of the image, never toward the left edge or viewer",
        }
        for direction in ("down", "up", "right"):
            directions[direction] = self._asset(
                generated, output_prefix, f"player.{direction}", "PLAYER_DIRECTION",
                f"player/{direction}.png",
                normalize_sprite_strip(self._generate_image(self._sprite_prompt(
                    style, "Create one and only one horizontal row of exactly three equally spaced "
                    f"whole-character animation frames, all facing {direction}: contact, passing, contact. "
                    f"Required body orientation in every frame: {screen_facing[direction]}. "
                    "One character per frame, no second row, no stacked or partial duplicates. No text. "
                    f"Character: {player.name}. Canonical appearance: {player.description}. "
                    "Preserve the reference character identity, colors and outfit, but rotate the entire "
                    "head and body to the required view; do not copy the reference's front-facing pose. "
                    "No scenery, floor, props, or drop shadow; "
                    "every pixel outside the three silhouettes must be exactly #00FF00.",
                    facing=screen_facing[direction]),
                    [stand.body], aspect_ratio="16:9",
                )), 384, 128, True,
            )
        player_avatar = self._asset(
            generated, output_prefix, "player.avatar", "PLAYER_AVATAR", "player/avatar.png",
            normalize_avatar(self._generate_image(self._sprite_prompt(
                style, f"Head-and-shoulders dialogue portrait of {player.name}. "
                f"Canonical appearance: {player.description}. Preserve the reference identity and "
                "outfit. Neutral expression, no text."), [stand.body]
            )), 256, 256, True,
        )

        playable_npcs: list[PlayableCharacter] = []
        for npc in plan.npcs:
            sprite = self._asset(
                generated, output_prefix, f"npc.{npc.id}.sprite", "NPC_SPRITE", f"npcs/{npc.id}/sprite.png",
                normalize_single_sprite(self._generate_image(self._sprite_prompt(
                    style, f"Exactly one full-body side-facing RPG character, centered on an empty "
                    f"canvas; no repeated copies, poses, panels, or contact sheet. NPC: {npc.name}. "
                    f"Canonical appearance: {npc.description}. Match the reference hero's pixel scale "
                    "and palette. No text or scenery."),
                    [stand.body],
                )), 128, 128, True,
            )
            avatar = self._asset(
                generated, output_prefix, f"npc.{npc.id}.avatar", "NPC_AVATAR", f"npcs/{npc.id}/avatar.png",
                normalize_avatar(self._generate_image(self._sprite_prompt(
                    style, f"Head-and-shoulders dialogue portrait of {npc.name}. Canonical appearance: "
                    f"{npc.description}. Preserve the referenced identity. No text or scenery."), [sprite.body]
                )), 256, 256, True,
            )
            playable_npcs.append(PlayableCharacter(
                id=npc.id, name=npc.name, description=npc.description, stats=npc.stats,
                assets=CharacterAssets(sprite=sprite.id, avatar=avatar.id),
            ))

        playable_minions: list[PlayableCharacter] = []
        for minion in plan.minions:
            sprite = self._asset(
                generated, output_prefix, f"minion.{minion.id}.sprite", "MINION_SPRITE",
                f"minions/{minion.id}/sprite.png",
                normalize_single_sprite(self._generate_image(self._sprite_prompt(
                    style, f"Exactly one full-body side-facing RPG creature, centered on an empty "
                    f"canvas; no repeated copies, poses, panels, or contact sheet. Creature: {minion.name}. "
                    f"Canonical appearance: {minion.description}. Match the reference hero's pixel scale "
                    "and palette. No text or scenery."),
                    [stand.body],
                )), 128, 128, True,
            )
            playable_minions.append(PlayableCharacter(
                id=minion.id, name=minion.name, description=minion.description, stats=minion.stats,
                assets=CharacterAssets(sprite=sprite.id),
            ))

        playable_scenes: list[PlayableScene] = []
        for scene in plan.scenes:
            background = self._asset(
                generated, output_prefix, f"scene.{scene.id}.background", "SCENE_BACKGROUND",
                f"scenes/{scene.id}/background.png",
                normalize_background(self._generate_image(self._scene_prompt(
                    scene_style, f"Location: {scene.location}. Frame this as a compact small-town game map, "
                    "not a sweeping panorama. Keep any house, cliff, or large prop modest relative "
                    "to the player. Show continuous solid walkable ground "
                    "through the middle horizontal band from left-of-center to right-of-center; "
                    "place water, cliffs, and buildings outside that route. Keep blocking scenery "
                    "in separate compact clusters away from it. Collision geometry "
                    "is invisible gameplay metadata. No characters, text, numbers, coordinate labels, "
                    "guides, debug overlays, borders, or UI. Exact 16:9 composition."),
                    aspect_ratio="16:9",
                )), 2560, 1440, False,
            )
            playable_scenes.append(PlayableScene(
                id=scene.id, title=scene.title, location=scene.location, objective=scene.objective,
                npc_ids=scene.npc_ids, minion_ids=scene.minion_ids, dialogue=scene.dialogue,
                player_spawn=scene.player_spawn, exit=scene.exit,
                collision_rectangles=scene.collision_rectangles, background_asset_id=background.id,
            ))

        descriptors = [AssetDescriptor(
            id=asset.id, role=asset.role, object_key=asset.object_key,
            content_type=asset.content_type, width=asset.width, height=asset.height,
            sha256=hashlib.sha256(asset.body).hexdigest(),
        ) for asset in generated]
        content = PlayableGameContentV1(
            title=plan.title, opening_remarks=plan.opening_remarks, style=plan.style,
            asset_base_url=self._settings.playable_asset_base_url,
            player=PlayablePlayer(
                id=player.id, name=player.name, description=player.description, stats=player.stats,
                assets=PlayerAssets(
                    stand=stand.id, down=directions["down"].id, up=directions["up"].id,
                    right=directions["right"].id, avatar=player_avatar.id,
                ),
            ),
            npcs=playable_npcs, minions=playable_minions, scenes=playable_scenes, assets=descriptors,
        )
        return GenerationOutput(
            content=content, assets=generated,
            model=f"{self._settings.gemini_text_model}+{self._settings.gemini_image_model}",
        )

    def _generate_plan(self, prompt: str) -> GamePlan:
        for attempt in range(2):
            response = self._client.models.generate_content(
                model=self._settings.gemini_text_model,
                contents=f"{PLAN_SYSTEM_PROMPT}\n\n{PLAN_OUTPUT_LAYOUT}\n\nUser premise:\n{prompt}",
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=GAME_PLAN_WIRE_SCHEMA,
                ),
            )
            if not response.text:
                raise ValueError("Gemini returned no structured game plan")
            try:
                wire = json.loads(response.text)
                nested = {
                    "title": wire["title"],
                    "openingRemarks": wire["openingRemarks"],
                    "style": json.loads(wire["styleJson"]),
                    "player": json.loads(wire["playerJson"]),
                    "npcs": json.loads(wire["npcsJson"]),
                    "minions": json.loads(wire["minionsJson"]),
                    "scenes": json.loads(wire["scenesJson"]),
                }
            except json.JSONDecodeError as exc:
                if attempt == 0:
                    continue
                raise ValueError("Gemini returned malformed structured game-plan JSON twice") from exc
            for scene in nested["scenes"]:
                rectangles = scene.get("collisionRectangles")
                if isinstance(rectangles, list) and len(rectangles) > 12:
                    scene["collisionRectangles"] = [
                        rectangle.model_dump(mode="json", by_alias=True)
                        for rectangle in FALLBACK_COLLISIONS
                    ]
            return GamePlan.model_validate(nested)
        raise AssertionError("unreachable game-plan retry state")

    def _generate_image(
        self, prompt: str, references: list[bytes] | None = None, aspect_ratio: str = "1:1"
    ) -> bytes:
        inputs: list[dict[str, str]] = [{"type": "text", "text": prompt}]
        for reference in references or []:
            inputs.append({
                "type": "image", "mime_type": "image/png",
                "data": base64.b64encode(reference).decode("ascii"),
            })
        interaction = self._client.interactions.create(
            model=self._settings.gemini_image_model,
            input=inputs,
            response_format={
                "type": "image", "mime_type": "image/jpeg", "aspect_ratio": aspect_ratio, "image_size": "1K",
            },
        )
        if not interaction.output_image:
            raise RuntimeError("Gemini returned no generated image")
        data = interaction.output_image.data
        return base64.b64decode(data) if isinstance(data, str) else bytes(data)

    @staticmethod
    def _style_prompt(plan: GamePlan) -> str:
        return (
            f"{GLOBAL_VISUAL_ANCHOR} "
            f"Shared game palette: {', '.join(plan.style.palette)}. "
            f"World: {plan.style.world_description}. "
            f"Canonical player: {plan.player.name}, {plan.player.description}."
        )

    @staticmethod
    def _scene_style_prompt(plan: GamePlan) -> str:
        return (
            f"{GLOBAL_VISUAL_ANCHOR} "
            f"Shared game palette: {', '.join(plan.style.palette)}. "
            f"World: {plan.style.world_description}. "
            "Render only the unoccupied environment. Runtime characters will be composited separately."
        )

    @staticmethod
    def _sprite_prompt(style: str, subject: str, *, facing: str | None = None) -> str:
        prompt = f"{style}\n{subject.rstrip(' .')}{DEFAULT_SPRITE_BASE}"
        if facing:
            # The generic front/side decorator and front-facing reference must not
            # override the required camera view of a directional animation.
            prompt += (
                f". FINAL DIRECTION OVERRIDE: {facing}. Apply this to ALL THREE frames, "
                "including the head, torso, feet and held objects. Reference images define "
                "identity only, not camera direction. Never turn the head back toward "
                "the viewer; no front-facing three-quarter pose in a side or rear strip."
            )
        return prompt

    @staticmethod
    def _scene_prompt(style: str, setting: str) -> str:
        return f"{style}\n{setting.rstrip(' .')}{DEFAULT_SCENE_BASE}{SCENE_RENDER_GUARD}"

    @staticmethod
    def _asset(
        assets: list[GeneratedPlayableAsset], output_prefix: str, asset_id: str, role: str,
        relative_key: str, body: bytes, width: int, height: int, transparency: bool,
    ) -> GeneratedPlayableAsset:
        validate_png(body, (width, height), transparency)
        asset = GeneratedPlayableAsset(
            id=asset_id, role=role, object_key=f"{output_prefix}/{relative_key}", body=body,
            content_type="image/png", width=width, height=height,
        )
        assets.append(asset)
        return asset
