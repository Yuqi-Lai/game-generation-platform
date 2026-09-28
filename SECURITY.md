# Security

Do not commit credentials, local environment files, private keys, provider tokens, or generated Python bytecode.

The PlayRPG legacy server under `legacy/playrpg/server.py` is intentionally retained for local reference only. It has no authentication, serves files from its working directory, and launches expensive subprocesses directly from HTTP requests. It must never be exposed publicly or included in a deployable artifact.

Provider credentials must be supplied through local environment variables or a deployment secret store. Automated tests use mocks and synthetic fixtures only.

If a credential is committed, revoke it first, document the affected path and commit without reproducing its value, and follow the repository owner's decision on history preservation.

