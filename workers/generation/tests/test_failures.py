from google.genai import errors as genai_errors

from generation_worker.failures import classify_failure


def test_provider_429_and_5xx_are_retryable():
    rate_limit = classify_failure(genai_errors.ClientError(429, {"message": "slow down"}))
    server_error = classify_failure(genai_errors.ServerError(503, {"message": "unavailable"}))

    assert rate_limit.retryable is True
    assert rate_limit.code == "PROVIDER_RATE_LIMITED"
    assert server_error.retryable is True
    assert server_error.code == "PROVIDER_SERVER_ERROR"


def test_provider_invalid_request_is_permanent():
    failure = classify_failure(genai_errors.ClientError(400, {"message": "invalid request"}))

    assert failure.retryable is False
    assert failure.code == "PROVIDER_INVALID_REQUEST"
