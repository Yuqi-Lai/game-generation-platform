import json
from typing import Any

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from .settings import Settings


class S3Storage:
    def __init__(self, settings: Settings):
        self.bucket = settings.s3_bucket
        self._client = boto3.client(
            "s3",
            region_name=settings.s3_region,
            endpoint_url=settings.s3_endpoint_url,
            config=Config(s3={"addressing_style": "path" if settings.s3_force_path_style else "auto"}),
        )

    def ensure_bucket(self) -> None:
        try:
            self._client.head_bucket(Bucket=self.bucket)
        except ClientError as error:
            code = error.response.get("Error", {}).get("Code")
            if code not in {"404", "NoSuchBucket", "NotFound"}:
                raise
            self._client.create_bucket(Bucket=self.bucket)

    def get_json(self, key: str) -> dict[str, Any] | None:
        try:
            response = self._client.get_object(Bucket=self.bucket, Key=key)
        except ClientError as error:
            if error.response.get("Error", {}).get("Code") in {"NoSuchKey", "404", "NotFound"}:
                return None
            raise
        return json.loads(response["Body"].read())

    def put_bytes(self, key: str, body: bytes, content_type: str) -> None:
        self._client.put_object(Bucket=self.bucket, Key=key, Body=body, ContentType=content_type)

    def put_json(self, key: str, value: dict[str, Any]) -> bytes:
        body = json.dumps(value, separators=(",", ":"), ensure_ascii=False).encode()
        self.put_bytes(key, body, "application/json")
        return body
