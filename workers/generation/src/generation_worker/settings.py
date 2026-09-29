from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=None, extra="ignore")

    kafka_bootstrap_servers: str = "localhost:9092"
    kafka_request_topic: str = "generation.execution.requested.v1"
    kafka_retry_topic: str = "generation.execution.retry.v1"
    kafka_result_topic: str = "generation.execution.results.v1"
    kafka_consumer_group: str = "generation-worker-v1"
    kafka_pack_export_request_topic: str = "content-pack.export.requested.v1"
    kafka_pack_export_result_topic: str = "content-pack.export.results.v1"
    kafka_security_protocol: str = "PLAINTEXT"
    kafka_sasl_mechanism: str | None = None
    kafka_sasl_username: str | None = None
    kafka_sasl_password: str | None = None

    s3_bucket: str = "forge-generation-assets"
    s3_region: str = "us-east-1"
    s3_endpoint_url: str | None = None
    s3_force_path_style: bool = False
    playable_asset_base_url: str | None = None

    gemini_api_key: str
    gemini_text_model: str = "gemini-3.8-flash"
    gemini_image_model: str = "gemini-3.1-flash-image"

    def kafka_common(self) -> dict[str, object]:
        config: dict[str, object] = {
            "bootstrap.servers": self.kafka_bootstrap_servers,
            "security.protocol": self.kafka_security_protocol,
        }
        if self.kafka_sasl_mechanism:
            config.update({
                "sasl.mechanism": self.kafka_sasl_mechanism,
                "sasl.username": self.kafka_sasl_username or "",
                "sasl.password": self.kafka_sasl_password or "",
            })
        return config
