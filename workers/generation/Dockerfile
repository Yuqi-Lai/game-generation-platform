FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
RUN useradd --create-home --uid 10001 worker
WORKDIR /app
COPY pyproject.toml ./
COPY src src
RUN pip install --no-cache-dir .
USER worker
CMD ["generation-worker"]
