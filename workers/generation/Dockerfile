FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
RUN useradd --create-home --uid 10001 worker
WORKDIR /app
COPY pyproject.toml requirements.lock ./
COPY src src
RUN pip install --no-cache-dir -r requirements.lock \
    && pip install --no-cache-dir --no-deps .
USER worker
CMD ["generation-worker"]
