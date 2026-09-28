# Game Generation Platform

This repository is being migrated from the PlayRPG prototype into a production-style game content platform.

Phase 0 preserves and characterizes the legacy generator without changing its production behavior. The complete legacy application, playable demos, and sample content live under [`legacy/playrpg`](legacy/playrpg/).

The legacy HTTP server is local reference code only. It is not safe for public deployment and is mechanically excluded from deployable build contexts.

## Phase 0 checks

The Phase 0 security and characterization commands are documented under `tests/legacy-characterization`. No automated test is permitted to contact Gemini or ElevenLabs.

