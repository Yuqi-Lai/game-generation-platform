from dataclasses import dataclass

import httpx
from google.genai import errors as genai_errors
from pydantic import ValidationError


@dataclass(frozen=True)
class ClassifiedFailure:
    code: str
    message: str
    retryable: bool


def classify_failure(error: Exception) -> ClassifiedFailure:
    message = (str(error) or error.__class__.__name__)[:2000]
    if isinstance(error, (httpx.TimeoutException, httpx.TransportError)):
        return ClassifiedFailure("PROVIDER_NETWORK_ERROR", message, True)
    if isinstance(error, genai_errors.ServerError):
        return ClassifiedFailure("PROVIDER_SERVER_ERROR", message, True)
    if isinstance(error, genai_errors.ClientError):
        status = getattr(error, "code", None) or getattr(error, "status_code", None)
        if status == 429:
            return ClassifiedFailure("PROVIDER_RATE_LIMITED", message, True)
        return ClassifiedFailure("PROVIDER_INVALID_REQUEST", message, False)
    if isinstance(error, (ValidationError, ValueError)):
        return ClassifiedFailure("GENERATION_VALIDATION_FAILED", message, False)
    return ClassifiedFailure("GENERATION_FAILED", message, False)
