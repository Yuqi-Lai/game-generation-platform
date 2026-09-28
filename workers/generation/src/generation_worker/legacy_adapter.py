from .contracts import GameContent


# This preserves the useful shape and intent of legacy/playrpg/prompt_hub.py without
# importing the legacy runtime or its local-only server.
STORY_PROMPT = """
Turn the user's premise into a concise 2D RPG content draft. Preserve the legacy
generator's useful behavior: identify one player, a small NPC cast, opening remarks,
and a short ordered sequence of scenes with locations, objectives, and dialogue.
Use original characters only. Keep the result suitable for a playable prototype and
avoid adding more than four scenes.
""".strip()


def structured_prompt(user_prompt: str) -> str:
    return f"{STORY_PROMPT}\n\nUser premise:\n{user_prompt}"


def cover_prompt(content: GameContent) -> str:
    return (
        "Create a 16-bit top-down RPG key art image with no text. "
        f"Game: {content.title}. Setting: {content.scenes[0].location}. "
        f"Hero: {content.player.name}, wearing {content.player.outfit}. "
        "Use a readable game-art composition and original characters."
    )
