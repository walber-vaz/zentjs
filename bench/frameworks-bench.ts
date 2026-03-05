import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import autocannon from 'autocannon';
import express from 'express';
import Fastify from 'fastify';

import { bodyParser, zent } from '../src/zent';

const OUTPUT_JSON = path.resolve('bench/frameworks.latest.json');
const OUTPUT_MD = path.resolve('bench/frameworks.latest.md');

const SCENARIOS = [
  {
    name: 'static_get',
    method: 'GET',
    path: '/health',
    body: undefined,
  },
  {
    name: 'param_get',
    method: 'GET',
    path: '/users/123',
    body: undefined,
  },
  {
    name: 'json_post',
    method: 'POST',
    path: '/echo',
    body: JSON.stringify({ hello: 'world', n: 1 }),
  },
];

const BENCH_OPTIONS = {
  connections: 50,
  duration: 5,
  pipelining: 1,
};

const WARMUP_ROUNDS = 1;
const MEASURED_ROUNDS = 5;

function runAutocannon(url, scenario) {
  return new Promise((resolve, reject) => {
    const instance = autocannon({
      url,
      method: scenario.method,
      connections: BENCH_OPTIONS.connections,
      duration: BENCH_OPTIONS.duration,
      pipelining: BENCH_OPTIONS.pipelining,
      timeout: 10,
      headers:
        scenario.method === 'POST'
          ? { 'content-type': 'application/json' }
          : undefined,
      body: scenario.body,
    });

    instance.on('done', (result) => resolve(result));
    instance.on('error', (error) => reject(error));
  });
}

function formatResult(raw) {
  return {
    reqPerSec: Number(raw.requests.average.toFixed(2)),
    latencyMsAvg: Number(raw.latency.average.toFixed(2)),
    latencyMsP99: Number(raw.latency.p99.toFixed(2)),
    throughputBytesPerSec: Number(raw.throughput.average.toFixed(2)),
    non2xx: raw.non2xx,
    errors: raw.errors,
    timeouts: raw.timeouts,
  };
}

function median(values) {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    return sorted[mid];
  }

  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function summarizeRounds(rounds) {
  return {
    reqPerSec: Number(median(rounds.map((r) => r.reqPerSec)).toFixed(2)),
    latencyMsAvg: Number(median(rounds.map((r) => r.latencyMsAvg)).toFixed(2)),
    latencyMsP99: Number(median(rounds.map((r) => r.latencyMsP99)).toFixed(2)),
    throughputBytesPerSec: Number(
      median(rounds.map((r) => r.throughputBytesPerSec)).toFixed(2)
    ),
    non2xx: Number(median(rounds.map((r) => r.non2xx)).toFixed(2)),
    errors: Number(median(rounds.map((r) => r.errors)).toFixed(2)),
    timeouts: Number(median(rounds.map((r) => r.timeouts)).toFixed(2)),
    rounds,
  };
}

function toMarkdown(payload) {
  const lines = [];
  lines.push('# Framework Benchmark');
  lines.push('');
  lines.push(`- generatedAt: ${payload.generatedAt}`);
  lines.push(`- node: ${payload.node}`);
  lines.push(
    `- settings: ${BENCH_OPTIONS.connections} conn / ${BENCH_OPTIONS.duration}s / pipeline ${BENCH_OPTIONS.pipelining}`
  );
  lines.push(`- warmup rounds: ${WARMUP_ROUNDS}`);
  lines.push(`- measured rounds: ${MEASURED_ROUNDS} (median)`);
  lines.push('');

  for (const scenario of payload.scenarios) {
    lines.push(`## ${scenario.name}`);
    lines.push('');
    lines.push(
      '| Framework | req/s | avg latency (ms) | p99 latency (ms) | non2xx | errors |'
    );
    lines.push('| --- | ---: | ---: | ---: | ---: | ---: |');

    for (const row of scenario.results) {
      lines.push(
        `| ${row.framework} | ${row.reqPerSec} | ${row.latencyMsAvg} | ${row.latencyMsP99} | ${row.non2xx} | ${row.errors} |`
      );
    }

    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}

async function createZentServer() {
  const app = zent();
  app.use(bodyParser());

  app.get('/health', (ctx) => {
    ctx.res.json({ ok: true });
  });

  app.get('/users/:id', (ctx) => {
    ctx.res.json({ id: ctx.req.params.id });
  });

  app.post('/echo', (ctx) => {
    ctx.res.json({ body: ctx.req.body });
  });

  const address = await app.listen({ host: '127.0.0.1', port: 0 });

  return {
    name: 'zent',
    address,
    close: async () => app.close(),
  };
}

async function createFastifyServer() {
  const app = Fastify({ logger: false });

  app.get('/health', async () => ({ ok: true }));
  app.get('/users/:id', async (request) => ({ id: request.params.id }));
  app.post('/echo', async (request) => ({ body: request.body }));

  const address = await app.listen({ host: '127.0.0.1', port: 0 });

  return {
    name: 'fastify',
    address,
    close: async () => app.close(),
  };
}

async function createExpressServer() {
  const app = express();
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/users/:id', (req, res) => {
    res.json({ id: req.params.id });
  });

  app.post('/echo', (req, res) => {
    res.json({ body: req.body });
  });

  const server = await new Promise((resolve, reject) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
    s.on('error', reject);
  });

  const { port } = server.address();
  const address = `http://127.0.0.1:${port}`;

  return {
    name: 'express',
    address,
    close: async () => {
      await new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}

async function benchmarkFramework(factory) {
  const server = await factory();

  try {
    const results = [];

    for (const scenario of SCENARIOS) {
      for (let i = 0; i < WARMUP_ROUNDS; i++) {
        await runAutocannon(`${server.address}${scenario.path}`, scenario);
      }

      const rounds = [];

      for (let i = 0; i < MEASURED_ROUNDS; i++) {
        const raw = await runAutocannon(
          `${server.address}${scenario.path}`,
          scenario
        );
        rounds.push(formatResult(raw));
      }

      const summarized = summarizeRounds(rounds);

      results.push({
        scenario: scenario.name,
        ...summarized,
      });
    }

    return {
      framework: server.name,
      results,
    };
  } finally {
    await server.close();
  }
}

async function main() {
  const frameworks = [
    await benchmarkFramework(createZentServer),
    await benchmarkFramework(createFastifyServer),
    await benchmarkFramework(createExpressServer),
  ];

  const scenarios = SCENARIOS.map((scenario) => {
    return {
      name: scenario.name,
      results: frameworks.map((frameworkRun) => {
        const match = frameworkRun.results.find(
          (item) => item.scenario === scenario.name
        );
        return {
          framework: frameworkRun.framework,
          ...match,
        };
      }),
    };
  });

  const payload = {
    generatedAt: new Date().toISOString(),
    node: process.version,
    benchOptions: {
      ...BENCH_OPTIONS,
      warmupRounds: WARMUP_ROUNDS,
      measuredRounds: MEASURED_ROUNDS,
      aggregation: 'median',
    },
    scenarios,
  };

  await writeFile(OUTPUT_JSON, JSON.stringify(payload, null, 2));
  await writeFile(OUTPUT_MD, toMarkdown(payload));

  console.log('\nFramework benchmark (req/s):');
  for (const scenario of scenarios) {
    console.log(`\n${scenario.name}`);
    for (const row of scenario.results) {
      console.log(
        `- ${row.framework}: ${row.reqPerSec} req/s (p99 ${row.latencyMsP99} ms)`
      );
    }
  }

  console.log(`\nSaved JSON: ${OUTPUT_JSON}`);
  console.log(`Saved report: ${OUTPUT_MD}`);
}

await main();
