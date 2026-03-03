# Framework Benchmark

- generatedAt: 2026-03-03T14:03:24.909Z
- node: v24.14.0
- settings: 50 conn / 5s / pipeline 1

## static_get

| Framework | req/s | avg latency (ms) | p99 latency (ms) | non2xx | errors |
| --- | ---: | ---: | ---: | ---: | ---: |
| zent | 12532 | 3.49 | 6 | 0 | 0 |
| fastify | 17263.2 | 2.32 | 4 | 0 | 0 |
| express | 10805.6 | 4.21 | 6 | 0 | 0 |

## param_get

| Framework | req/s | avg latency (ms) | p99 latency (ms) | non2xx | errors |
| --- | ---: | ---: | ---: | ---: | ---: |
| zent | 13101.6 | 3.28 | 5 | 0 | 0 |
| fastify | 17230.41 | 2.27 | 4 | 0 | 0 |
| express | 10970.4 | 4.17 | 6 | 0 | 0 |

## json_post

| Framework | req/s | avg latency (ms) | p99 latency (ms) | non2xx | errors |
| --- | ---: | ---: | ---: | ---: | ---: |
| zent | 11220 | 4.09 | 5 | 0 | 0 |
| fastify | 11066.4 | 4 | 10 | 0 | 0 |
| express | 8946.4 | 5.2 | 7 | 0 | 0 |

