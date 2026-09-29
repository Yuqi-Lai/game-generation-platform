from __future__ import annotations

from collections import deque
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator


WORLD_WIDTH = 2560
WORLD_HEIGHT = 1440
SPRITE_FRAME_WIDTH = 128
SPRITE_FRAME_HEIGHT = 128
SPRITE_FRAME_COUNT = 3

NonEmptyText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2_000)]
ShortText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
LogicalId = Annotated[str, StringConstraints(pattern=r"^[a-z][a-z0-9.-]{0,79}$")]


class ContractModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=lambda value: "".join(
            [value.split("_")[0], *[part.title() for part in value.split("_")[1:]]]
        ),
        populate_by_name=True,
        extra="forbid",
    )


class Point(ContractModel):
    x: int = Field(ge=0, le=WORLD_WIDTH)
    y: int = Field(ge=0, le=WORLD_HEIGHT)


class CollisionRect(ContractModel):
    x: int = Field(ge=0, lt=WORLD_WIDTH)
    y: int = Field(ge=0, lt=WORLD_HEIGHT)
    width: int = Field(gt=0, le=WORLD_WIDTH)
    height: int = Field(gt=0, le=WORLD_HEIGHT)

    @model_validator(mode="after")
    def inside_world(self) -> "CollisionRect":
        if self.x + self.width > WORLD_WIDTH or self.y + self.height > WORLD_HEIGHT:
            raise ValueError("collision rectangle must stay inside the 2560x1440 world")
        return self


class CombatStats(ContractModel):
    hp: int = Field(ge=1, le=500)
    attack: int = Field(ge=1, le=100)
    defense: int = Field(ge=1, le=100)


class DialogueLine(ContractModel):
    speaker: ShortText
    text: NonEmptyText


class VisualStyle(ContractModel):
    art_direction: NonEmptyText
    palette: list[ShortText] = Field(min_length=3, max_length=8)
    world_description: NonEmptyText


class PlanCharacter(ContractModel):
    id: LogicalId
    name: ShortText
    description: NonEmptyText
    stats: CombatStats


class PlanScene(ContractModel):
    id: LogicalId
    title: ShortText
    location: NonEmptyText
    objective: NonEmptyText
    npc_ids: list[LogicalId] = Field(default_factory=list, max_length=6)
    minion_ids: list[LogicalId] = Field(default_factory=list, max_length=2)
    dialogue: list[DialogueLine] = Field(default_factory=list, max_length=30)
    player_spawn: Point
    exit: Point
    collision_rectangles: list[CollisionRect] = Field(default_factory=list, max_length=12)


class GamePlan(ContractModel):
    title: ShortText
    opening_remarks: NonEmptyText
    style: VisualStyle
    player: PlanCharacter
    npcs: list[PlanCharacter] = Field(default_factory=list, max_length=6)
    minions: list[PlanCharacter] = Field(default_factory=list, max_length=2)
    scenes: list[PlanScene] = Field(min_length=1, max_length=4)

    @model_validator(mode="after")
    def valid_references(self) -> "GamePlan":
        all_ids = [self.player.id, *(item.id for item in self.npcs), *(item.id for item in self.minions)]
        if len(all_ids) != len(set(all_ids)):
            raise ValueError("character IDs must be unique")
        if len({scene.id for scene in self.scenes}) != len(self.scenes):
            raise ValueError("scene IDs must be unique")
        npc_ids = {item.id for item in self.npcs}
        minion_ids = {item.id for item in self.minions}
        known_speakers = {self.player.name, *(item.name for item in self.npcs)}
        for scene in self.scenes:
            if not set(scene.npc_ids).issubset(npc_ids):
                raise ValueError(f"scene {scene.id} references an unknown NPC")
            if not set(scene.minion_ids).issubset(minion_ids):
                raise ValueError(f"scene {scene.id} references an unknown minion")
            if any(line.speaker not in known_speakers for line in scene.dialogue):
                raise ValueError(f"scene {scene.id} dialogue has an unknown speaker")
        return self


class WorldSpec(ContractModel):
    width: Literal[2560] = WORLD_WIDTH
    height: Literal[1440] = WORLD_HEIGHT
    tile_size: Literal[64] = 64


class CharacterAssets(ContractModel):
    sprite: LogicalId
    avatar: LogicalId | None = None


class PlayerAssets(ContractModel):
    stand: LogicalId
    down: LogicalId
    up: LogicalId
    right: LogicalId
    avatar: LogicalId
    frame_width: Literal[128] = SPRITE_FRAME_WIDTH
    frame_height: Literal[128] = SPRITE_FRAME_HEIGHT
    frame_count: Literal[3] = SPRITE_FRAME_COUNT


class PlayableCharacter(ContractModel):
    id: LogicalId
    name: ShortText
    description: NonEmptyText
    stats: CombatStats
    assets: CharacterAssets


class PlayablePlayer(ContractModel):
    id: LogicalId
    name: ShortText
    description: NonEmptyText
    stats: CombatStats
    assets: PlayerAssets


class PlayableScene(ContractModel):
    id: LogicalId
    title: ShortText
    location: NonEmptyText
    objective: NonEmptyText
    npc_ids: list[LogicalId] = Field(default_factory=list, max_length=6)
    minion_ids: list[LogicalId] = Field(default_factory=list, max_length=2)
    dialogue: list[DialogueLine] = Field(default_factory=list, max_length=30)
    player_spawn: Point
    exit: Point
    collision_rectangles: list[CollisionRect] = Field(default_factory=list, max_length=12)
    background_asset_id: LogicalId


class AssetDescriptor(ContractModel):
    id: LogicalId
    role: Literal[
        "PLAYER_STAND", "PLAYER_DIRECTION", "PLAYER_AVATAR", "NPC_SPRITE",
        "NPC_AVATAR", "MINION_SPRITE", "SCENE_BACKGROUND",
    ]
    object_key: NonEmptyText
    content_type: Literal["image/png"]
    width: int = Field(gt=0, le=WORLD_WIDTH)
    height: int = Field(gt=0, le=WORLD_HEIGHT)
    sha256: Annotated[str, StringConstraints(pattern=r"^[a-f0-9]{64}$")]


class PlayableGameContentV1(ContractModel):
    version: Literal["playable-game-content/v1"] = "playable-game-content/v1"
    title: ShortText
    opening_remarks: NonEmptyText
    style: VisualStyle
    world: WorldSpec = Field(default_factory=WorldSpec)
    asset_base_url: str | None = None
    player: PlayablePlayer
    npcs: list[PlayableCharacter] = Field(default_factory=list, max_length=6)
    minions: list[PlayableCharacter] = Field(default_factory=list, max_length=2)
    scenes: list[PlayableScene] = Field(min_length=1, max_length=4)
    assets: list[AssetDescriptor] = Field(min_length=5, max_length=40)

    @model_validator(mode="after")
    def complete_manifest(self) -> "PlayableGameContentV1":
        asset_ids = [asset.id for asset in self.assets]
        if len(asset_ids) != len(set(asset_ids)):
            raise ValueError("asset IDs must be unique")
        known = set(asset_ids)
        player_refs = {
            self.player.assets.stand, self.player.assets.down, self.player.assets.up,
            self.player.assets.right, self.player.assets.avatar,
        }
        character_refs = {
            ref for character in [*self.npcs, *self.minions]
            for ref in (character.assets.sprite, character.assets.avatar) if ref is not None
        }
        scene_refs = {scene.background_asset_id for scene in self.scenes}
        missing = (player_refs | character_refs | scene_refs) - known
        if missing:
            raise ValueError(f"manifest references missing assets: {sorted(missing)}")
        return self


FALLBACK_COLLISIONS = [
    CollisionRect(x=320, y=160, width=320, height=256),
    CollisionRect(x=1920, y=160, width=320, height=256),
    CollisionRect(x=320, y=1024, width=320, height=256),
    CollisionRect(x=1920, y=1024, width=320, height=256),
]
ANCHORED_SPAWN = Point(x=512, y=720)
ANCHORED_EXIT = Point(x=2048, y=720)


def normalize_plan(plan: GamePlan) -> GamePlan:
    """Anchor the playable route; replace model blockers that make it unreachable."""
    normalized = plan.model_copy(deep=True)
    for scene in normalized.scenes:
        scene.player_spawn = ANCHORED_SPAWN.model_copy()
        scene.exit = ANCHORED_EXIT.model_copy()
        if not _map_is_safe(scene.player_spawn, scene.exit, scene.collision_rectangles):
            scene.collision_rectangles = list(FALLBACK_COLLISIONS)
    return GamePlan.model_validate(normalized.model_dump())


def _map_is_safe(spawn: Point, exit_point: Point, rectangles: list[CollisionRect]) -> bool:
    if not (
        64 <= spawn.x <= WORLD_WIDTH - 64 and 64 <= spawn.y <= WORLD_HEIGHT - 64
        and 64 <= exit_point.x <= WORLD_WIDTH - 64 and 64 <= exit_point.y <= WORLD_HEIGHT - 64
    ):
        return False
    if _point_blocked(spawn, rectangles, 48) or _point_blocked(exit_point, rectangles, 48):
        return False
    cell = 64
    cols, rows = WORLD_WIDTH // cell, WORLD_HEIGHT // cell
    start = (min(cols - 1, spawn.x // cell), min(rows - 1, spawn.y // cell))
    goal = (min(cols - 1, exit_point.x // cell), min(rows - 1, exit_point.y // cell))
    blocked = {
        (x, y)
        for x in range(cols)
        for y in range(rows)
        if _point_blocked(Point(x=x * cell + cell // 2, y=y * cell + cell // 2), rectangles, 32)
    }
    queue = deque([start])
    seen = {start}
    while queue:
        current = queue.popleft()
        if current == goal:
            return True
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nxt = current[0] + dx, current[1] + dy
            if 0 <= nxt[0] < cols and 0 <= nxt[1] < rows and nxt not in blocked and nxt not in seen:
                seen.add(nxt)
                queue.append(nxt)
    return False


def _point_blocked(point: Point, rectangles: list[CollisionRect], padding: int) -> bool:
    return any(
        rect.x - padding <= point.x <= rect.x + rect.width + padding
        and rect.y - padding <= point.y <= rect.y + rect.height + padding
        for rect in rectangles
    )
