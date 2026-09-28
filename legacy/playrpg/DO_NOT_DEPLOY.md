# Local reference only

This directory contains the preserved PlayRPG prototype, its playable demos, and its existing sample content.

Do not deploy `server.py` or expose it to an untrusted network. The server has no authentication or tenant isolation, serves files from its process working directory, accepts unbounded generation requests, and executes a generator subprocess synchronously.

Phase 0 characterization tests may import generator modules or copy the Phaser runtime into an isolated temporary directory. They must not make real Gemini or ElevenLabs requests.

