/**
 * Deterministic Agent Loop & Budget Guardrail Simulator
 * Author: Jatin Sharma (https://jatinsh.netlify.app/)
 */

import { SimulationResult, SimulationScenario, SimulationStep } from '../types.js';

export class BudgetSimulator {
  static simulate(
    scenario: SimulationScenario,
    budgetUsd = 0.2,
    maxTurns = 8
  ): SimulationResult {
    const steps: SimulationStep[] = [];
    let cumulativeUsd = 0;
    let totalLatencyMs = 0;
    let abortedByGuard = false;
    let abortReason: string | undefined;

    if (scenario === 'unprotected-loop') {
      for (let i = 1; i <= 10; i++) {
        const stepCost = Number((0.024 + i * 0.011).toFixed(4));
        const latencyMs = 850 + i * 180;
        cumulativeUsd = Number((cumulativeUsd + stepCost).toFixed(4));
        totalLatencyMs += latencyMs;
        steps.push({
          step: i,
          action: i === 1 ? 'plan_fix (claude-3-7-sonnet)' : `retry_loop_run_tests #${i - 1}`,
          kind: i % 2 === 1 ? 'llm_call' : 'tool_call',
          latencyMs,
          costUsd: stepCost,
          cumulativeUsd,
          status: i >= 4 ? 'loop-warning' : 'ok'
        });
      }
      return {
        scenario,
        budgetUsd,
        maxTurns,
        turnsExecuted: steps.length,
        totalCostUsd: cumulativeUsd,
        totalLatencyMs,
        abortedByGuard: false,
        steps
      };
    }

    if (scenario === 'guarded-loop') {
      for (let i = 1; i <= maxTurns; i++) {
        const stepCost = Number((0.022 + i * 0.008).toFixed(4));
        const latencyMs = 760;
        if (i === 4) {
          abortedByGuard = true;
          abortReason = 'AT-001 Loop Circuit Breaker tripped after 2 identical run_tests failures.';
          steps.push({
            step: i,
            action: 'GUARD_ABORT: repeated tool signature run_tests({"suite":"auth"})',
            kind: 'error',
            latencyMs: 5,
            costUsd: 0,
            cumulativeUsd,
            status: 'blocked'
          });
          break;
        }
        if (cumulativeUsd + stepCost > budgetUsd) {
          abortedByGuard = true;
          abortReason = `AT-003 Budget Ceiling ($${budgetUsd.toFixed(2)}) reached.`;
          steps.push({
            step: i,
            action: 'GUARD_ABORT: maxBudgetUsd exceeded',
            kind: 'error',
            latencyMs: 5,
            costUsd: 0,
            cumulativeUsd,
            status: 'blocked'
          });
          break;
        }
        cumulativeUsd = Number((cumulativeUsd + stepCost).toFixed(4));
        totalLatencyMs += latencyMs;
        steps.push({
          step: i,
          action: i === 1 ? 'plan_fix (claude-3-7-sonnet)' : `run_tests attempt #${i - 1}`,
          kind: i % 2 === 1 ? 'llm_call' : 'tool_call',
          latencyMs,
          costUsd: stepCost,
          cumulativeUsd,
          status: 'ok'
        });
      }
      return {
        scenario,
        budgetUsd,
        maxTurns,
        turnsExecuted: steps.length,
        totalCostUsd: cumulativeUsd,
        totalLatencyMs,
        abortedByGuard,
        abortReason,
        steps
      };
    }

    // parallel-optimized
    const plan: Array<{ action: string; kind: SimulationStep['kind']; latencyMs: number; costUsd: number }> = [
      { action: 'route_intent (gemini-2.5-flash)', kind: 'llm_call', latencyMs: 240, costUsd: 0.0012 },
      { action: 'parallel_batch: [stripe_lookup, list_invoices, vector_search]', kind: 'retrieval', latencyMs: 680, costUsd: 0.0005 },
      { action: 'synthesize_final (claude-3-5-haiku)', kind: 'llm_call', latencyMs: 360, costUsd: 0.0041 }
    ];
    plan.forEach((p, idx) => {
      cumulativeUsd = Number((cumulativeUsd + p.costUsd).toFixed(4));
      totalLatencyMs += p.latencyMs;
      steps.push({
        step: idx + 1,
        action: p.action,
        kind: p.kind,
        latencyMs: p.latencyMs,
        costUsd: p.costUsd,
        cumulativeUsd,
        status: 'ok'
      });
    });

    return {
      scenario,
      budgetUsd,
      maxTurns,
      turnsExecuted: steps.length,
      totalCostUsd: cumulativeUsd,
      totalLatencyMs,
      abortedByGuard: false,
      steps
    };
  }
}
