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
Create a compact, original, playable top-down 16-bit RPG plan from the user's premise.
This request is only for the plan; do not describe image files or generate assets.
Use one coherent art direction and palette for the whole game. Keep the cast and map
small enough for a short demo. Dialogue speakers must exactly match the player or an
NPC name. The world is exactly 2560x1440. Keep a clear traversable route from the
player spawn to the exit and use only simple axis-aligned collision rectangles.
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

BACKGROUND_NEO_PIXEL_PROMPT = (
    "masterpiece modern high-detail pixel art, modern neo-retro indie aesthetic, in the art "
    "style of Eastward and Chained Echoes, sophisticated cinematic color palette with hue "
    "shifting, moody atmospheric lighting, lush environmental details, clean orthographic "
    "2D plane, crisp pixel clusters, no mud, zero blurry watercolor gradients"
)

SPRITE_NEO_PIXEL_PROMPT = (
    "modern detailed 2D pixel art character sprite, Eastward aesthetic, stylish readable "
    "proportions, crisp 1-pixel dark outline, beautiful subtle highlights, directional "
    "cinematic lighting from top-left, solid chroma-green (#00FF00) background, sharp "
    "edges, modern indie game quality"
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
        generated: list[GeneratedPlayableAsset] = []
        style = self._style_prompt(plan)
        player = plan.player

        stand = self._asset(
            generated, output_prefix, "player.stand", "PLAYER_STAND", "player/stand.png",
            normalize_single_sprite(self._generate_image(
                f"{style}\n{SPRITE_NEO_PIXEL_PROMPT}. Single full-body front-facing character. "
                f"Character: {player.name}. Canonical appearance: {player.description}. No text or props."
            )), 128, 128, True,
        )
        directions: dict[str, GeneratedPlayableAsset] = {}
        for direction in ("down", "up", "right"):
            directions[direction] = self._asset(
                generated, output_prefix, f"player.{direction}", "PLAYER_DIRECTION",
                f"player/{direction}.png",
                normalize_sprite_strip(self._generate_image(
                    f"{style}\n{SPRITE_NEO_PIXEL_PROMPT}. Create exactly three equally spaced horizontal "
                    f"animation frames, all facing {direction}: contact, passing, contact. No text. "
                    "Preserve the reference character exactly.",
                    [stand.body], aspect_ratio="16:9",
                )), 384, 128, True,
            )
        player_avatar = self._asset(
            generated, output_prefix, "player.avatar", "PLAYER_AVATAR", "player/avatar.png",
            normalize_avatar(self._generate_image(
                f"{style}\n{SPRITE_NEO_PIXEL_PROMPT}. Head-and-shoulders dialogue portrait of {player.name}. "
                "Preserve the reference identity and outfit. Neutral expression, no text.", [stand.body]
            )), 256, 256, True,
        )

        playable_npcs: list[PlayableCharacter] = []
        for npc in plan.npcs:
            sprite = self._asset(
                generated, output_prefix, f"npc.{npc.id}.sprite", "NPC_SPRITE", f"npcs/{npc.id}/sprite.png",
                normalize_single_sprite(self._generate_image(
                    f"{style}\n{SPRITE_NEO_PIXEL_PROMPT}. Single full-body side-facing RPG character. NPC: {npc.name}. "
                    f"Canonical appearance: {npc.description}. Match the reference hero's visual language. No text.",
                    [stand.body],
                )), 128, 128, True,
            )
            avatar = self._asset(
                generated, output_prefix, f"npc.{npc.id}.avatar", "NPC_AVATAR", f"npcs/{npc.id}/avatar.png",
                normalize_avatar(self._generate_image(
                    f"{style}\n{SPRITE_NEO_PIXEL_PROMPT}. Head-and-shoulders dialogue portrait of {npc.name}; "
                    "preserve the referenced identity. No text.", [sprite.body]
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
                normalize_single_sprite(self._generate_image(
                    f"{style}\n{SPRITE_NEO_PIXEL_PROMPT}. Single full-body side-facing RPG creature. "
                    f"Creature: {minion.name}. "
                    f"Canonical appearance: {minion.description}. Match the reference art direction. No text.",
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
                normalize_background(self._generate_image(
                    f"{style}\n{BACKGROUND_NEO_PIXEL_PROMPT}. No characters, no text. Location: {scene.location}. "
                    "Show a clearly walkable central route with decorative structures away from the route. Exact 16:9 composition.",
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
        wire = json.loads(response.text)
        return GamePlan.model_validate({
            "title": wire["title"],
            "openingRemarks": wire["openingRemarks"],
            "style": json.loads(wire["styleJson"]),
            "player": json.loads(wire["playerJson"]),
            "npcs": json.loads(wire["npcsJson"]),
            "minions": json.loads(wire["minionsJson"]),
            "scenes": json.loads(wire["scenesJson"]),
        })

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
            f"Shared game art direction: {plan.style.art_direction}. Palette: {', '.join(plan.style.palette)}. "
            f"World: {plan.style.world_description}. Crisp modern high-detail top-down neo-pixel art, consistent lighting, "
            "consistent scale, strictly orthographic 2D projection, sophisticated hue-shifted cinematic "
            "palette, original characters, no typography, no muddy colors, no blurry gradients."
        )

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
