# Credit reservation load test

Run the focused local test from the repository root:

```bash
bash tests/load/run-credits-concurrency.sh
```

The runner creates an isolated Docker Compose project, starts only PostgreSQL,
Redpanda, and the API, creates a synthetic project with 100 credits, and runs
25 concurrent submissions at 10 credits each. The generation worker is never
started. The script validates the final API and PostgreSQL state and removes its
containers and volumes unless `KEEP_STACK=1` is set.
