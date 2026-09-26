---
title: Media stream request logs and metrics
description: The one structured log line every image request writes, the pre-decode line, the Prometheus metrics for dashboards, and LogsQL / PromQL queries that use them.
---

# Media stream request logs and metrics

Every image request writes **one** structured log line when its response
closes, whatever answered it. A request that reaches a decoder also writes
one line **before** decoding, so a request that crashes the process can
still be found. The Prometheus metrics below cover the same requests with
low-cardinality labels for graphs.

## Source

| File | What it does |
|---|---|
| `src/MediaStream/API/middleware/image-request-log.middleware.ts` | Creates the per-request record, writes the line and the metrics sample when the response closes |
| `src/MediaStream/Correlation/utils/image-request-log.util.ts` | The record type, the outcome and cache enums, `currentImageRequest()` |
| `src/MediaStream/API/controllers/media-stream-image.controller.ts` | Fills in the source, the schema, the decoded path and the resize options |
| `src/MediaStream/API/services/image-stream.service.ts` | Fills in the cache result, the outcome and the output |
| `src/MediaStream/Cache/operations/resource-fetcher.service.ts` | Fills in the sniffed input format and the input size |
| `src/MediaStream/Cache/operations/cache-image-resource.operation.ts` | Writes the pre-decode line (`ImageDecode`) |
| `src/MediaStream/Processing/services/processing-admission.service.ts` | Adds the time spent waiting for a processing slot |
| `src/MediaStream/common/filters/media-stream-exception.filter.ts` | Records the error class of a thrown error, and classifies `overloaded` and `timeout` |
| `src/MediaStream/Correlation/utils/logger.util.ts` | `CorrelatedLogger.event()`, which writes a line with structured fields |
| `src/main.ts` | `ConsoleLogger({ json, flattenParams: true })`, which puts the fields at the top level |
| `src/MediaStream/Metrics/services/metrics.service.ts` | The metrics |

## The line

In production Nest writes one JSON object per line. The fields sit at the
top level, next to Nest's `level`, `context` and `message`, which is the
same flat layout the Django and agent-gateway logs use. Vector puts every
key under `log.*` (`manifests/app-constructs/victoria-logs/values.yaml` in
`grooveshop-infrastructure`), and `message` becomes the line's `_msg`.

```json
{"level":"log","pid":1,"timestamp":1790000000000,"message":"image ok 200 143ms","context":"ImageRequest",
 "correlation_id":"3f0c…","schema":"webside","source":"UPLOADED_MEDIA",
 "path":"media/webside/uploads/products/a.png/640/480/cover/centre/transparent/0/80.avif",
 "width":640,"height":480,"fit":"cover","position":"centre","format":"avif","quality":80,
 "cache":"miss","input_format":"png","input_bytes":812345,"output_format":"avif","output_bytes":23456,
 "admission_wait_ms":12,"duration_ms":143,"status":200,"outcome":"ok"}
```

`log.context:="ImageRequest"` selects exactly these lines. A field with no
value is left out rather than written as `null`.

| Field | Type | Meaning |
|---|---|---|
| `correlation_id` | string | The `x-correlation-id` of the response, the same id every other line of the request carries in its message prefix |
| `schema` | string | Tenant schema from the URL; `public` for `STATIC_IMAGES`. Unvalidated on a 400, capped at 64 characters |
| `source` | string | `UPLOADED_MEDIA` or `STATIC_IMAGES`; absent when no route matched |
| `path` | string | The path under `/media_stream-image/`, percent-decoded once the controller has decoded it, capped at 512 characters. Never the query string |
| `width`, `height`, `quality` | number | As requested; absent when the segment is not a number |
| `fit`, `position`, `format` | string | As requested (`format` is the requested output format), capped at 64 characters |
| `cache` | string | `memory`, `redis`, `disk` or `miss`; absent when the request never reached the lookup (400, 404, 429) |
| `coalesced` | boolean | `true` when the request waited for another request's fetch and processing of the same resource; it then has no input fields of its own |
| `input_format` | string | The format sniffed from the bytes: `jpeg`, `png`, `webp`, `gif`, `tiff`, `avif`, `svg`; absent for a cache hit, or when the bytes matched none of them |
| `input_bytes` | number | Bytes downloaded. For a source refused on its declared size, the declared `Content-Length` |
| `output_format`, `output_bytes` | string, number | What was sent: the image, or the default image for `fallback` / `rejected`; absent for a 304 or an error body |
| `admission_wait_ms` | number | Time spent waiting for a processing slot, summed over every pipeline the request ran, including a wait that ended in a 503 |
| `duration_ms` | number | From the first image-route middleware to the response closing |
| `status` | number | HTTP status sent |
| `outcome` | string | See below |
| `error` | string | Class name of the error that decided the response, e.g. `UpstreamResourceTooLargeError`, `UnableToFetchResourceException`, `ProcessingOverloadedError` |

| `outcome` | Status | Level | When |
|---|---|---|---|
| `ok` | 200 | info | The image was served, from a cache tier or freshly processed |
| `not_modified` | 304 | info | A conditional request matched the cached copy |
| `fallback` | 200 | info | The default image, because fetching or processing failed (upstream 404, circuit open, Sharp error) |
| `rejected` | 200 | **warn** | The default image, because the source was refused: over its format's size limit (`UpstreamResourceTooLargeError`), not a supported format (`UnsupportedSourceFormatError`), or an SVG the sanitiser failed closed on (`SvgSanitizationError`) |
| `overloaded` | 503 | info | Admission control shed the request |
| `timeout` | 503 | info | A pipeline or the SVG sanitiser exceeded `PROCESSING_TIMEOUT_SECONDS` |
| `invalid` | 4xx | info | Validation failed or no route matched |
| `rate_limited` | 429 | info | The rate limit guard refused it |
| `error` | 5xx | info | Anything else, e.g. `DefaultImageFallbackError` |
| `aborted` | any | info | The client closed the connection before the response finished; `status` is then what would have been sent |

Faults keep their own ERROR or WARN lines with the stack and details, and
the request line records only the class name. A `rejected` source has no
separate ERROR line, because it is policy, not a fault. The exception is
the SVG sanitiser's worker failure, which still logs its cause (for
example `ERR_WORKER_OUT_OF_MEMORY`) at ERROR.

### The pre-decode line

A miss writes one more line after the download and before any decoder
(Sharp or the SVG sanitiser) sees the bytes:

```json
{"level":"log","message":"image decode png 812345B","context":"ImageDecode","correlation_id":"3f0c…",
 "schema":"webside","source":"UPLOADED_MEDIA","path":"media/webside/uploads/products/a.png/…",
 "resource_id":"9b1e…","input_format":"png","input_bytes":812345}
```

The request line is written when the response closes, so a decode that
kills the process writes none. The decode line is already on stdout by
then. **A decode line with no request line of the same `correlation_id`
is the request that was running when the pod died.** Cache hits, which are
most of the traffic, never write a decode line.

### Cost

Writing the line is one object and one `JSON.stringify` per request, done
by the logger that already runs. The record holds only numbers, short
capped strings and closed enums. There are no image bytes, no request or
response headers (so no `Authorization` or `Cookie`), and no query string.
The fields come from values the pipeline already has, so nothing extra
is read or parsed to produce them.

## Metrics

Scraped from `GET /metrics` with the `mediastream_` prefix.

| Metric | Type | Labels | Recorded |
|---|---|---|---|
| `mediastream_image_requests_total` | counter | `outcome`, `format`, `cache` | Once per image request, when it completes |
| `mediastream_image_request_duration_seconds` | histogram | `outcome`, `cache` | Same time as `duration_ms` |
| `mediastream_image_input_bytes` | histogram | `format` (sniffed) | Once per completed upstream download (the request that led; coalesced waiters add nothing) |

These metrics were already there and still apply: `mediastream_cache_operations_total{cache_type,status}`
(one sample for each layer probed),
`mediastream_image_processing_duration_seconds`,
`mediastream_processing_pipelines{state}`,
`mediastream_processing_rejected_total{reason}`,
`mediastream_http_requests_total`.

**Labels are closed sets.** `outcome` is the table above, `format` is a
supported output format or `none`, `cache` is `memory` / `redis` / `disk` /
`miss` or `none`, and the input `format` is one of the seven sniffed
formats. That is at most 10 × 8 × 5 series for the counter.

**No metric carries the tenant schema, and none carries a client path.**
Any string that matches the schema pattern reaches the route, and a
request for a schema that does not exist still gets a default image, so a
tenant label's values would be chosen by whoever sends requests, and every
new one is a new series on vmsingle. The service has no list of real
schemas to check against: the tenant feed from Django carries hostnames
only. So the `tenant_schema` label that `mediastream_http_*`,
`mediastream_cache_operations_total`, `mediastream_cache_operation_duration_seconds`
and `mediastream_image_processing_*` used to carry was removed, and
per-tenant breakdowns come from the `schema` log field. The HTTP `route`
label is the registered route pattern (`/media_stream-image/*path`,
`/health/live`, …) or `unmatched`, where it used to be the first five
segments of whatever path a 404 had
(`src/MediaStream/Metrics/middleware/metrics.middleware.ts`).

## Queries

LogsQL runs in vmui (`logs.grooveshop.space/select/vmui`). Every query
starts with the time range and the container:

```logsql
_time:1h kubernetes.pod_namespace:="grooveshop" kubernetes.container_name:="media-stream" log.context:="ImageRequest"
```

That prefix is written `…` below.

**Finding the poison image of 2026-09-25.** Both pods crashed 11 times in
20 minutes. A PNG with C2PA credentials was taken for an SVG and parsed
by jsdom until the heap ran out. With these lines, one query finds it: the
decodes that never finished. It would have returned the two webside PNGs,
with their paths:

```logsql
_time:[2026-09-25T00:00:00Z, 2026-09-26T00:00:00Z) kubernetes.pod_namespace:="grooveshop" kubernetes.container_name:="media-stream"
  log.context:in("ImageDecode", "ImageRequest")
  | stats by (log.correlation_id, log.schema, log.path, log.input_format, log.input_bytes)
      count() if (log.context:="ImageDecode") decoded,
      count() if (log.context:="ImageRequest") finished
  | filter decoded:>0 finished:=0
```

The same incident also had a signature that would have shown up before
any crash: a raster file name the sniffer took for SVG. Since the
`isSvgHeader` fix this should always return nothing, so it is also a
regression check:

```logsql
… log.input_format:="svg" log.path:~"\\.(png|jpe?g|webp|gif|avif|tiff?)/"
```

Other useful queries:

```logsql
# Refused sources, by reason and tenant
… log.outcome:="rejected" | stats by (log.error, log.schema) count() as n

# Outcome mix per tenant
… | stats by (log.schema, log.outcome) count() as n

# Slowest misses, with what was asked for
… log.cache:="miss" | sort by (log.duration_ms) desc | limit 20
  | fields _time, log.path, log.input_format, log.input_bytes, log.output_format, log.admission_wait_ms, log.duration_ms

# Latency by cache tier
… log.outcome:="ok" | stats by (log.cache) quantile(0.5, log.duration_ms) p50, quantile(0.95, log.duration_ms) p95, count() n

# Largest sources fetched
… log.input_bytes:>2000000 | sort by (log.input_bytes) desc | limit 20

# Every line of one request, when a client reports it (other lines carry the id as a message prefix)
_time:1d kubernetes.container_name:="media-stream" ("3f0c…" or log.correlation_id:="3f0c…")
```

PromQL for dashboards:

```promql
# Requests per second by outcome
sum by (outcome) (rate(mediastream_image_requests_total[5m]))

# End-to-end cache hit ratio (requests that reached the lookup)
sum(rate(mediastream_image_requests_total{cache=~"memory|redis|disk"}[5m]))
  / sum(rate(mediastream_image_requests_total{cache!="none"}[5m]))

# p95 latency of served images, per cache tier
histogram_quantile(0.95, sum by (le, cache) (rate(mediastream_image_request_duration_seconds_bucket{outcome="ok"}[5m])))

# Refused sources per minute
sum(rate(mediastream_image_requests_total{outcome="rejected"}[5m])) * 60

# p95 source size per sniffed format
histogram_quantile(0.95, sum by (le, format) (rate(mediastream_image_input_bytes_bucket[1h])))
```

## Size limits follow the real format

`MAX_FILE_SIZES` (`src/MediaStream/common/constants/image-limits.constant.ts`)
is keyed on the format sniffed from the bytes, not the URL extension.
`ResourceFetcher` holds back the first kilobyte, sniffs it
(`src/MediaStream/Cache/utils/image-format-sniff.util.ts`: raster
signatures, then the same `isSvgHeader` the pipeline uses), and only then
applies that format's limit, to the declared `Content-Length` at once and
to every byte streamed after. An SVG saved as `.png` gets the 1 MB SVG
limit, and a PNG saved as `.svg` gets the 8 MB PNG one. A source that is
none of the seven accepted formats is refused before anything reaches the
temp file. That includes gzip-compressed SVG, which librsvg would otherwise
rasterise without the DOMPurify pass, and libvips' own `.v` format. The
sniffed format also picks the SVG or raster pipeline, so the size limit
and the pipeline always agree about what a file is.
