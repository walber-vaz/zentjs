# Benchmark Report

- generatedAt: 2026-03-03T13:49:40.824Z
- node: v24.14.0
- platform: linux
- arch: x64

## Current Run

| Case                          | Iterations | Elapsed (ms) |     req/s |
| ----------------------------- | ---------: | -----------: | --------: |
| router_lookup_500_routes      |       6000 |        24.75 | 242435.77 |
| middleware_pipeline_10_layers |       4000 |         19.2 | 208307.73 |
| router_param_routes           |       5000 |        17.98 | 278043.53 |

## Comparison vs Baseline

| Case                          | Current req/s | Baseline req/s | Delta % |
| ----------------------------- | ------------: | -------------: | ------: |
| router_lookup_500_routes      |     242435.77 |       227340.2 |  +6.64% |
| middleware_pipeline_10_layers |     208307.73 |      194263.68 |  +7.23% |
| router_param_routes           |     278043.53 |      199503.77 | +39.37% |
