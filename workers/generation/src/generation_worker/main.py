import logging

from .consumer import GenerationConsumer
from .executor import GenerationExecutor
from .export_executor import ContentPackExportExecutor
from .generator import GeminiGenerator
from .settings import Settings
from .storage import S3Storage


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    settings = Settings()
    storage = S3Storage(settings)
    storage.ensure_bucket()
    generator = GeminiGenerator(settings)
    executor = GenerationExecutor(
        generator,
        storage,
        f"{settings.gemini_text_model}+{settings.gemini_image_model}",
    )
    GenerationConsumer(settings, executor, ContentPackExportExecutor(storage)).run()


if __name__ == "__main__":
    main()
