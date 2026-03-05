import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { zent } from '../src/zent';

const RESULTS_DIR = path.resolve('bench');
const LATEST_FILE = path.join(RESULTS_DIR, 'baseline.latest.json');
const BASELINE_FILE = path.join(RESULTS_DIR, 'baseline.json');
const REPORT_FILE = path.join(RESULTS_DIR, 'report.latest.md');

async function runCase(name, buildApp, opts = {}) {
  const iterations = opts.iterations ?? 5000;
  const warmup = opts.warmup ?? 300;

  const app = await buildApp();

  for (let i = 0; i < warmup; i++) {
    await app.inject({ method: 'GET', url: opts.url || '/target' });
  }

  const startedAt = process.hrtime.bigint();
  for (let i = 0; i < iterations; i++) {
    await app.inject({ method: 'GET', url: opts.url || '/target' });
  }
  const elapsedNs = process.hrtime.bigint() - startedAt;

  const elapsedMs = Number(elapsedNs) / 1_000_000;
  const reqPerSec = (iterations / elapsedMs) * 1000;

  return {
    name,
    iterations,
    elapsedMs: Number(elapsedMs.toFixed(2)),
    reqPerSec: Number(reqPerSec.toFixed(2)),
  };
}

async function benchmarkRouterLookup() {
  return runCase(
    'router_lookup_500_routes',
    async () => {
      const app = zent();

      for (let i = 0; i < 500; i++) {
        app.get(`/items/${i}`, (ctx) => {
          ctx.res.send('ok');
        });
      }

      app.get('/target', (ctx) => {
        ctx.res.send('ok');
      });

      return app;
    },
    { url: '/target', iterations: 6000 }
  );
}

async function benchmarkMiddlewarePipeline() {
  return runCase(
    'middleware_pipeline_10_layers',
    async () => {
      const app = zent();

      for (let i = 0; i < 10; i++) {
        app.use(async (ctx, next) => {
          ctx.state[`mw${i}`] = true;
          await next();
        });
      }

      app.get('/target', (ctx) => {
        ctx.res.send('ok');
      });

      return app;
    },
    { url: '/target', iterations: 4000 }
  );
}

async function benchmarkParameterizedRoutes() {
  return runCase(
    'router_param_routes',
    async () => {
      const app = zent();

      for (let i = 0; i < 300; i++) {
        app.get(`/products/${i}`, (ctx) => {
          ctx.res.send('ok');
        });
      }

      app.get('/users/:id/profile', (ctx) => {
        ctx.res.send(ctx.req.params.id);
      });

      return app;
    },
    { url: '/users/4242/profile', iterations: 5000 }
  );
}

function compareWithBaseline(current, baseline) {
  const baselineByName = new Map(
    baseline.cases.map((item) => [item.name, item])
  );

  return current.cases
    .map((item) => {
      const base = baselineByName.get(item.name);
      if (!base) return null;

      const delta = ((item.reqPerSec - base.reqPerSec) / base.reqPerSec) * 100;
      return {
        name: item.name,
        currentReqPerSec: item.reqPerSec,
        baselineReqPerSec: base.reqPerSec,
        deltaPercent: Number(delta.toFixed(2)),
      };
    })
    .filter(Boolean);
}

function renderMarkdownReport(payload, comparison, baselineFound) {
  const lines = [];
  lines.push('# Benchmark Report');
  lines.push('');
  lines.push(`- generatedAt: ${payload.generatedAt}`);
  lines.push(`- node: ${payload.node}`);
  lines.push(`- platform: ${payload.platform}`);
  lines.push(`- arch: ${payload.arch}`);
  lines.push('');
  lines.push('## Current Run');
  lines.push('');
  lines.push('| Case | Iterations | Elapsed (ms) | req/s |');
  lines.push('| --- | ---: | ---: | ---: |');

  for (const item of payload.cases) {
    lines.push(
      `| ${item.name} | ${item.iterations} | ${item.elapsedMs} | ${item.reqPerSec} |`
    );
  }

  lines.push('');

  if (!baselineFound) {
    lines.push('## Comparison');
    lines.push('');
    lines.push('No baseline found. Run `npm run bench:save-baseline`.');
    lines.push('');
    return `${lines.join('\n')}\n`;
  }

  lines.push('## Comparison vs Baseline');
  lines.push('');
  lines.push('| Case | Current req/s | Baseline req/s | Delta % |');
  lines.push('| --- | ---: | ---: | ---: |');

  for (const item of comparison) {
    const signal = item.deltaPercent >= 0 ? '+' : '';
    lines.push(
      `| ${item.name} | ${item.currentReqPerSec} | ${item.baselineReqPerSec} | ${signal}${item.deltaPercent}% |`
    );
  }

  lines.push('');
  return `${lines.join('\n')}\n`;
}

async function loadJson(filePath) {
  try {
    const content = await readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

async function main() {
  const saveBaseline = process.argv.includes('--save-baseline');

  await mkdir(RESULTS_DIR, { recursive: true });

  const cases = [
    await benchmarkRouterLookup(),
    await benchmarkMiddlewarePipeline(),
    await benchmarkParameterizedRoutes(),
  ];

  const payload = {
    generatedAt: new Date().toISOString(),
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    cases,
  };

  await writeFile(LATEST_FILE, JSON.stringify(payload, null, 2));

  console.log('\nBenchmark results:');
  for (const item of cases) {
    console.log(
      `- ${item.name}: ${item.reqPerSec} req/s (${item.iterations} req in ${item.elapsedMs} ms)`
    );
  }

  if (saveBaseline) {
    await writeFile(BASELINE_FILE, JSON.stringify(payload, null, 2));
    const report = renderMarkdownReport(payload, [], false);
    await writeFile(REPORT_FILE, report);
    console.log(`\nBaseline saved to ${BASELINE_FILE}`);
    console.log(`Report saved to ${REPORT_FILE}`);
    return;
  }

  const baseline = await loadJson(BASELINE_FILE);
  if (!baseline) {
    const report = renderMarkdownReport(payload, [], false);
    await writeFile(REPORT_FILE, report);
    console.log(
      `\nNo baseline found at ${BASELINE_FILE}. Run with --save-baseline.`
    );
    console.log(`Report saved to ${REPORT_FILE}`);
    return;
  }

  const comparison = compareWithBaseline(payload, baseline);
  const report = renderMarkdownReport(payload, comparison, true);
  await writeFile(REPORT_FILE, report);

  console.log('\nComparison vs baseline:');
  for (const item of comparison) {
    const signal = item.deltaPercent >= 0 ? '+' : '';
    console.log(
      `- ${item.name}: ${signal}${item.deltaPercent}% (${item.currentReqPerSec} vs ${item.baselineReqPerSec} req/s)`
    );
  }

  console.log(`\nReport saved to ${REPORT_FILE}`);
}

await main();
