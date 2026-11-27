import test from 'node:test';
import assert from 'node:assert';
import { calculateSpanCostUsd, estimateTokens } from '../core/pricing.js';
import { TraceAnalyzer } from '../core/traceAnalyzer.js';
import { TraceAuditor } from '../core/traceAuditor.js';
import { BudgetSimulator } from '../core/budgetSimulator.js';
import { StudioServer } from '../studio/server.js';

test('Pricing: calculates model token cost and estimates tokens', () => {
  const cost = calculateSpanCostUsd('gpt-4o', 1_000_000, 500_000);
  assert.strictEqual(cost, 7.5);
  assert.ok(estimateTokens('hello world!') >= 3);
});

test('TraceAnalyzer: parses JSONL traces and computes critical path', () => {
  const jsonl = [
    JSON.stringify({ id: 'a', name: 'root', kind: 'llm_call', durationMs: 200, timestampMs: 0 }),
    JSON.stringify({ id: 'b', parentId: 'a', name: 'child1', kind: 'tool_call', durationMs: 500, timestampMs: 200 }),
    JSON.stringify({ id: 'c', parentId: 'a', name: 'child2', kind: 'tool_call', durationMs: 900, timestampMs: 210 })
  ].join('\n');

  const parsed = TraceAnalyzer.parseTrace(jsonl);
  assert.strictEqual(parsed.spans.length, 3);
  const dag = TraceAnalyzer.computeDagMetrics(parsed.spans);
  assert.strictEqual(dag.criticalPathMs, 1100);
  assert.strictEqual(dag.maxDepth, 1);
});

test('TraceAuditor: detects runaway loop, secret leak, and context bloat in fixture 1', () => {
  const [runaway, seq, healthy] = TraceAnalyzer.getBuiltInTraces();

  const r1 = TraceAuditor.audit(runaway);
  assert.ok(r1.loopCount >= 3);
  assert.ok(r1.findings.some((f) => f.ruleId === 'AT-001'));
  assert.ok(r1.findings.some((f) => f.ruleId === 'AT-002'));
  assert.ok(r1.findings.some((f) => f.ruleId === 'AT-005'));
  assert.ok(r1.healthScore < 50);

  const r2 = TraceAuditor.audit(seq);
  assert.ok(r2.findings.some((f) => f.ruleId === 'AT-006'));

  const r3 = TraceAuditor.audit(healthy);
  assert.strictEqual(r3.grade, 'A+');
  assert.strictEqual(r3.findings.length, 0);

  const md = TraceAuditor.toMarkdown(r1, runaway);
  assert.ok(md.includes('AgentTrace Audit Report'));
});

test('BudgetSimulator: guarded-loop trips circuit breaker before runaway spend', () => {
  const unguarded = BudgetSimulator.simulate('unprotected-loop', 0.2, 8);
  const guarded = BudgetSimulator.simulate('guarded-loop', 0.2, 8);
  const parallel = BudgetSimulator.simulate('parallel-optimized', 0.2, 8);

  assert.strictEqual(unguarded.abortedByGuard, false);
  assert.strictEqual(guarded.abortedByGuard, true);
  assert.ok(guarded.totalCostUsd < unguarded.totalCostUsd);
  assert.ok(parallel.totalLatencyMs < 1500);
});

test('StudioServer: serves Bento Grid UI and REST audit/simulate endpoints', async () => {
  const studio = new StudioServer(7474);
  await studio.start();
  try {
    const health = await fetch('http://localhost:7474/api/health');
    assert.strictEqual(health.status, 200);

    const html = await fetch('http://localhost:7474/');
    const text = await html.text();
    assert.ok(text.includes('AgentTrace'));

    const simRes = await fetch('http://localhost:7474/api/simulate', {
      method: 'POST',
      body: JSON.stringify({ scenario: 'guarded-loop', budgetUsd: 0.2, maxTurns: 8 })
    });
    const simData = (await simRes.json()) as { abortedByGuard: boolean };
    assert.strictEqual(simData.abortedByGuard, true);
  } finally {
    await studio.stop();
  }
});
