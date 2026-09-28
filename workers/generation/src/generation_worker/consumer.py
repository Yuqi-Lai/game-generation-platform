import logging
from uuid import uuid4

from confluent_kafka import Consumer, KafkaError, Producer

from .contracts import GenerationExecutionRequested, GenerationExecutionStarted
from .executor import GenerationExecutor
from .settings import Settings

LOGGER = logging.getLogger(__name__)


class GenerationConsumer:
    def __init__(self, settings: Settings, executor: GenerationExecutor):
        common = settings.kafka_common()
        self._consumer = Consumer({
            **common,
            "group.id": settings.kafka_consumer_group,
            "auto.offset.reset": "earliest",
            "enable.auto.commit": False,
        })
        self._producer = Producer({**common, "enable.idempotence": True, "acks": "all"})
        self._request_topic = settings.kafka_request_topic
        self._retry_topic = settings.kafka_retry_topic
        self._result_topic = settings.kafka_result_topic
        self._executor = executor

    def run(self) -> None:
        self._consumer.subscribe([self._request_topic, self._retry_topic])
        LOGGER.info("generation worker listening on %s and %s", self._request_topic, self._retry_topic)
        try:
            while True:
                message = self._consumer.poll(1.0)
                if message is None:
                    continue
                if message.error():
                    if message.error().code() == KafkaError.UNKNOWN_TOPIC_OR_PART:
                        LOGGER.warning("generation request topic is not available yet; retrying")
                        continue
                    raise RuntimeError(str(message.error()))
                command = GenerationExecutionRequested.model_validate_json(message.value())
                worker_execution_id = str(uuid4())
                started = GenerationExecutionStarted(
                    job_id=command.job_id,
                    attempt_id=command.attempt_id,
                    execution_key=command.execution_key,
                    worker_execution_id=worker_execution_id,
                )
                self._publish(command.job_id, started.model_dump_json(by_alias=True))
                result = self._executor.execute(command, worker_execution_id)
                self._publish(command.job_id, result.model_dump_json(by_alias=True))
                self._consumer.commit(message=message, asynchronous=False)
                LOGGER.info("published %s for job %s", result.event_type, command.job_id)
        finally:
            self._producer.flush(10)
            self._consumer.close()

    def _publish(self, job_id, payload: str) -> None:
        delivery_error: list[Exception] = []

        def delivered(error, _message) -> None:
            if error is not None:
                delivery_error.append(RuntimeError(str(error)))

        self._producer.produce(
            self._result_topic,
            key=str(job_id),
            value=payload,
            on_delivery=delivered,
        )
        remaining = self._producer.flush(30)
        if remaining or delivery_error:
            raise delivery_error[0] if delivery_error else RuntimeError(
                f"{remaining} generation result event(s) were not delivered"
            )
