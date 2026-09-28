import json
import logging

from confluent_kafka import Consumer, Producer

from .contracts import GenerationExecutionRequested
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
        self._result_topic = settings.kafka_result_topic
        self._executor = executor

    def run(self) -> None:
        self._consumer.subscribe([self._request_topic])
        LOGGER.info("generation worker listening on %s", self._request_topic)
        try:
            while True:
                message = self._consumer.poll(1.0)
                if message is None:
                    continue
                if message.error():
                    raise RuntimeError(str(message.error()))
                command = GenerationExecutionRequested.model_validate_json(message.value())
                result = self._executor.execute(command)
                payload = result.model_dump_json(by_alias=True)
                self._producer.produce(
                    self._result_topic,
                    key=str(command.job_id),
                    value=payload,
                )
                self._producer.flush(30)
                self._consumer.commit(message=message, asynchronous=False)
                LOGGER.info("published %s for job %s", result.event_type, command.job_id)
        finally:
            self._producer.flush(10)
            self._consumer.close()
