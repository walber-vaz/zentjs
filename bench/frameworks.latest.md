# Framework Benchmark

- generatedAt: 2026-03-03T14:52:36.358Z
- node: v24.14.0
- settings: 50 conn / 5s / pipeline 1
- warmup rounds: 1
- measured rounds: 5 (median)

## static_get

| Framework | req/s | avg latency (ms) | p99 latency (ms) | non2xx | errors |
| --- | ---: | ---: | ---: | ---: | ---: |
| zent | 13650.4 | 3.26 | 5 | 0 | 0 |
| fastify | 17652.8 | 2.29 | 4 | 0 | 0 |
| express | 11181.6 | 4 | 6 | 0 | 0 |

## param_get

| Framework | req/s | avg latency (ms) | p99 latency (ms) | non2xx | errors |
| --- | ---: | ---: | ---: | ---: | ---: |
| zent | 14234.4 | 3.12 | 5 | 0 | 0 |
| fastify | 18952 | 2.08 | 3 | 0 | 0 |
| express | 10876 | 4.19 | 6 | 0 | 0 |

## json_post

| Framework | req/s | avg latency (ms) | p99 latency (ms) | non2xx | errors |
| --- | ---: | ---: | ---: | ---: | ---: |
| zent | 12144.8 | 3.54 | 6 | 0 | 0 |
| fastify | 11756 | 3.68 | 10 | 0 | 0 |
| express | 9039.21 | 5.08 | 8 | 0 | 0 |

