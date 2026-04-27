---
name: bull-inspect
description: Inspect Bull queue state (waiting/active/failed/delayed/completed counts and recent jobs) for the image-processing and cache-operations queues
arguments:
  - name: queue
    description: "Queue name: image-processing, cache-operations, or all"
    required: false
    default: "all"
  - name: detail
    description: "summary (counts only) or jobs (list recent failed jobs with error)"
    required: false
    default: "summary"
---

Inspect Bull queue state via `redis-cli` against the configured Redis instance. Read-only.

## Bull Key Layout

Bull v4 uses keys under `bull:<queueName>:`:
- `bull:<q>:wait` — list of waiting job IDs
- `bull:<q>:active` — list of in-flight job IDs
- `bull:<q>:delayed` — sorted set of delayed job IDs
- `bull:<q>:failed` — sorted set of failed job IDs
- `bull:<q>:completed` — sorted set of completed job IDs
- `bull:<q>:<jobId>` — hash with job data, attemptsMade, failedReason, stacktrace

Queues in this project: `image-processing` and `cache-operations`.

## Instructions

1. Read `REDIS_HOST` (default `localhost`), `REDIS_PORT` (default `6379`), `REDIS_DB` (default `0`) from `.env` if present.
2. Determine queue list: if `queue` is `all`, use both `image-processing` and `cache-operations`; otherwise use the one named.
3. For each queue, run summary counts via `redis-cli`:
   ```bash
   redis-cli -h $REDIS_HOST -p $REDIS_PORT -n $REDIS_DB <<EOF
   LLEN bull:<q>:wait
   LLEN bull:<q>:active
   ZCARD bull:<q>:delayed
   ZCARD bull:<q>:failed
   ZCARD bull:<q>:completed
   EOF
   ```
4. If `detail` is `jobs`, fetch up to 5 recent failed jobs:
   ```bash
   redis-cli -h $REDIS_HOST -p $REDIS_PORT -n $REDIS_DB ZREVRANGE bull:<q>:failed 0 4
   ```
   Then for each id: `HGETALL bull:<q>:<id>` and surface `name`, `attemptsMade`, `failedReason`, first 3 lines of `stacktrace`.

## After Running

- Print a compact table per queue: `wait | active | delayed | failed | completed`.
- If `failed > 0`: highlight in red and (for `detail=jobs`) print failed job summaries.
- If `wait > 100` or `active == concurrency` and `wait > 0` for >1 sample, note possible backpressure.
- Suggest next step only if findings warrant it (e.g., "many failed jobs with the same error → investigate `<file>`"); don't pad output otherwise.
