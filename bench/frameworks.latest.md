# Framework Benchmark

- generatedAt: 2026-03-03T14:59:52.586Z
- node: v24.14.0
- settings: 50 conn / 5s / pipeline 1
- warmup rounds: 1
- measured rounds: 5 (median)

## static_get

| Framework |   req/s | avg latency (ms) | p99 latency (ms) | non2xx | errors |
| --------- | ------: | ---------------: | ---------------: | -----: | -----: |
| zent      | 14250.4 |             3.09 |                5 |      0 |      0 |
| fastify   | 19684.8 |             2.03 |                3 |      0 |      0 |
| express   | 11661.6 |             3.73 |                6 |      0 |      0 |

## param_get

| Framework |   req/s | avg latency (ms) | p99 latency (ms) | non2xx | errors |
| --------- | ------: | ---------------: | ---------------: | -----: | -----: |
| zent      | 15629.6 |             2.84 |                4 |      0 |      0 |
| fastify   | 19780.8 |             2.02 |                3 |      0 |      0 |
| express   | 10330.4 |              4.4 |                7 |      0 |      0 |

## json_post

| Framework |   req/s | avg latency (ms) | p99 latency (ms) | non2xx | errors |
| --------- | ------: | ---------------: | ---------------: | -----: | -----: |
| zent      |   13396 |             3.17 |                5 |      0 |      0 |
| fastify   |   12676 |              3.3 |                9 |      0 |      0 |
| express   | 9015.21 |             5.15 |                7 |      0 |      0 |
