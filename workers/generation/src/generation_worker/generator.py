import base64
from dataclasses import dataclass

from google import genai

from .contracts import GameContent
from .legacy_adapter import cover_prompt, structured_prompt
from .settings import Settings


@dataclass(frozen=True)
class GenerationOutput:
    content: GameContent
    image: bytes
    image_content_type: str
    model: str


class GeminiGenerator:
    def __init__(self, settings: Settings):
        self._settings = settings
        self._client = genai.Client(api_key=settings.gemini_api_key)

    def generate(self, prompt: str) -> GenerationOutput:
        content_interaction = self._client.interactions.create(
            model=self._settings.gemini_text_model,
            input=structured_prompt(prompt),
            response_format={
                "type": "text",
                "mime_type": "application/json",
                "schema": GameContent.model_json_schema(),
            },
        )
        content = GameContent.model_validate_json(content_interaction.output_text)
        image_interaction = self._client.interactions.create(
            model=self._settings.gemini_image_model,
            input=cover_prompt(content),
            response_format={
                "type": "image",
                "mime_type": "image/png",
                "aspect_ratio": "16:9",
                "image_size": "1K",
            },
        )
        if not image_interaction.output_image:
            raise RuntimeError("Gemini returned no generated image")
        return GenerationOutput(
            content=content,
            image=base64.b64decode(image_interaction.output_image.data),
            image_content_type="image/png",
            model=f"{self._settings.gemini_text_model}+{self._settings.gemini_image_model}",
        )
