/**
 * AgentTrace 12-Rule Reliability, Security & Cost Auditor
 * Author: Jatin Sharma (https://jatinsh.netlify.app/)
 */

import { AgentTrace, AuditFinding, AuditReport, Severity, SpanMetrics } from '../types.js';
import { calculateSpanCostUsd, getModelPricing } from './pricing.js';
import { TraceAnalyzer } from './traceAnalyzer.js';

const SECRET_PATTERNS: Array<{ name: string; regex: RegExp }> = [
  { name: 'AWS Access Key', regex: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'GitHub Token', regex: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/ },
  { name: 'OpenAI Key', regex: /\bsk-[A-Za-z0-9]{20,}\b/ },
  { name: 'Stripe Live Key', regex: /\bsk_live_[A-Za-z0-9]{16,}\b/ }
];

const EMAIL_PATTERN = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;

const SEVERITY_PENALTY: Record<Severity, number> = {
  critical: 24,
  high: 15,
  medium: 8,
  low: 4
};

function computeGrade(score: number): AuditReport['grade'] {
  if (score >= 93) return 'A+';
  if (score >= 82) return 'A';
  if (score >= 68) return 'B';
  if (score >= 50) return 'C';
  return 'F';
}

export class TraceAuditor {
  static audit(trace: AgentTrace): AuditReport {
    const findings: AuditFinding[] = [];
    const spanMetrics: Record<string, SpanMetrics> = {};
    const dag = TraceAnalyzer.computeDagMetrics(trace.spans);

    let totalCostUsd = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalDurationMs = 0;

    for (const s of trace.spans) {
      const cost = s.kind === 'llm_call' ? calculateSpanCostUsd(s.model, s.inputTokens, s.outputTokens) : 0;
      totalCostUsd += cost;
      totalInputTokens += s.inputTokens;
      totalOutputTokens += s.outputTokens;
      totalDurationMs += s.durationMs;

      spanMetrics[s.id] = {
        spanId: s.id,
        costUsd: cost,
        depth: dag.depths[s.id] ?? 0,
        isCriticalPath: dag.criticalPathIds.has(s.id)
      };
    }

    totalCostUsd = Number(totalCostUsd.toFixed(6));

    // AT-001: Runaway Tool-Call Loop Detection (>= 3 identical toolName + input)
    const callSignatures = new Map<string, string[]>();
    for (const s of trace.spans) {
      if (s.kind === 'tool_call') {
        const key = `${s.toolName || s.name}::${(s.input || '').trim()}`;
        const ids = callSignatures.get(key) || [];
        ids.push(s.id);
        callSignatures.set(key, ids);
      }
    }
    let loopCount = 0;
    for (const [sig, ids] of callSignatures.entries()) {
      if (ids.length >= 3) {
        loopCount += ids.length - 1;
        findings.push({
          id: `find-loop-${ids[0]}`,
          ruleId: 'AT-001',
          severity: 'critical',
          spanId: ids[ids.length - 1],
          title: `Runaway Tool-Call Loop (${ids.length}x repeated)`,
          description: `Tool signature "${sig}" executed ${ids.length} times identically without state progress.`,
          remediation: 'Enable a loop circuit breaker (`loopThreshold: 2`) to abort or escalate repeated identical tool calls.',
          estimatedWasteUsd: Number((totalCostUsd * 0.45).toFixed(4))
        });
      }
    }

    // AT-002: Secret / Credential Exposure in Trace Payloads
    for (const s of trace.spans) {
      const combined = `${s.input || ''}\n${s.output || ''}`;
      for (const pat of SECRET_PATTERNS) {
        if (pat.regex.test(combined)) {
          findings.push({
            id: `find-sec-${s.id}`,
            ruleId: 'AT-002',
            severity: 'critical',
            spanId: s.id,
            title: `${pat.name} Exposed in Span Payload`,
            description: `Span "${s.name}" contains an unredacted ${pat.name} inside prompt/tool telemetry.`,
            remediation: 'Enable `redactSecrets: true` in your trace exporter and strip credentials before sending context to LLMs.'
          });
          break;
        }
      }
    }

    // AT-003: Cost Budget Ceiling Exceeded
    if (totalCostUsd > trace.budgetUsd) {
      findings.push({
        id: 'find-budget',
        ruleId: 'AT-003',
        severity: 'high',
        title: 'Cost Budget Ceiling Exceeded',
        description: `Trace spent $${totalCostUsd.toFixed(4)} against a configured ceiling of $${trace.budgetUsd.toFixed(2)}.`,
        remediation: 'Enforce hard pre-turn cost guards (`maxBudgetUsd`) and route simple steps to fast-tier models.',
        estimatedWasteUsd: Number((totalCostUsd - trace.budgetUsd).toFixed(4))
      });
    }

    // AT-004: Max-Turn Limit Exceeded
    if (trace.spans.length > trace.maxTurns) {
      findings.push({
        id: 'find-turns',
        ruleId: 'AT-004',
        severity: 'high',
        title: 'Max-Turn Limit Exceeded',
        description: `Execution reached ${trace.spans.length} spans, exceeding maxTurns=${trace.maxTurns}.`,
        remediation: 'Cap agent execution loops with `maxTurns` and return a graceful partial summary on limit.'
      });
    }

    // AT-005: Quadratic Context Bloat
    const llmSpans = trace.spans.filter((s) => s.kind === 'llm_call' && s.inputTokens > 0);
    if (llmSpans.length >= 3) {
      const first = llmSpans[0].inputTokens;
      const last = llmSpans[llmSpans.length - 1].inputTokens;
      if (last > first * 4 && last > 5000) {
        findings.push({
          id: `find-bloat-${llmSpans[llmSpans.length - 1].id}`,
          ruleId: 'AT-005',
          severity: 'high',
          spanId: llmSpans[llmSpans.length - 1].id,
          title: 'Quadratic Context Window Bloat',
          description: `LLM input tokens grew ${(last / first).toFixed(1)}x (${first} -> ${last}) without history compaction.`,
          remediation: 'Summarize or prune stale tool outputs after every 2 turns to keep input tokens bounded.'
        });
      }
    }

    // AT-006: Sequential Sibling Tool Calls (Missed Parallelism)
    const byParent = new Map<string, typeof trace.spans>();
    for (const s of trace.spans) {
      if (s.parentId && (s.kind === 'tool_call' || s.kind === 'retrieval')) {
        const arr = byParent.get(s.parentId) || [];
        arr.push(s);
        byParent.set(s.parentId, arr);
      }
    }
    for (const [parentId, kids] of byParent.entries()) {
      if (kids.length >= 3) {
        const sorted = [...kids].sort((a, b) => a.timestampMs - b.timestampMs);
        let sequentialCount = 0;
        for (let i = 1; i < sorted.length; i++) {
          if (sorted[i].timestampMs >= sorted[i - 1].timestampMs + sorted[i - 1].durationMs - 20) {
            sequentialCount++;
          }
        }
        if (sequentialCount >= 2) {
          findings.push({
            id: `find-seq-${parentId}`,
            ruleId: 'AT-006',
            severity: 'medium',
            spanId: sorted[1].id,
            title: 'Sequential Tool Fan-Out Bottleneck',
            description: `${kids.length} sibling tool/retrieval calls under "${parentId}" executed sequentially instead of via Promise.all().`,
            remediation: 'Batch independent tool calls in parallel to reduce critical-path latency.'
          });
        }
      }
    }

    // AT-007: Unhandled Tool Errors / Timeouts
    const errorSpans = trace.spans.filter((s) => s.status === 'error' || s.status === 'timeout');
    if (errorSpans.length >= 2) {
      findings.push({
        id: `find-err-${errorSpans[0].id}`,
        ruleId: 'AT-007',
        severity: 'medium',
        spanId: errorSpans[0].id,
        title: `Repeated Tool Failures (${errorSpans.length} errors/timeouts)`,
        description: `Agent hit ${errorSpans.length} failed/timed-out tool calls without exponential backoff or fallback.`,
        remediation: 'Add tool-level timeouts, exponential backoff with jitter, and fail-fast error classification.'
      });
    }

    // AT-008: Unmasked PII (Email) in Trace Payload
    for (const s of trace.spans) {
      const combined = `${s.input || ''}\n${s.output || ''}`;
      if (EMAIL_PATTERN.test(combined)) {
        findings.push({
          id: `find-pii-${s.id}`,
          ruleId: 'AT-008',
          severity: 'medium',
          spanId: s.id,
          title: 'Unmasked Email PII in Trace',
          description: `Span "${s.name}" logs raw email addresses in trace telemetry.`,
          remediation: 'Mask PII fields (`[REDACTED_EMAIL]`) at the telemetry boundary.'
        });
        break;
      }
    }

    // AT-009: Expensive Frontier Model on Tiny Routing Step
    for (const s of llmSpans) {
      const pricing = getModelPricing(s.model);
      if (pricing.tier === 'frontier' && s.outputTokens > 0 && s.outputTokens <= 100 && s.inputTokens <= 1500) {
        findings.push({
          id: `find-tier-${s.id}`,
          ruleId: 'AT-009',
          severity: 'low',
          spanId: s.id,
          title: `Frontier Model (${pricing.model}) Used for Small Step`,
          description: `Span "${s.name}" generated only ${s.outputTokens} tokens on an expensive frontier model.`,
          remediation: 'Route lightweight classification/routing turns to `gpt-4o-mini` or `gemini-2.5-flash` (~15x cheaper).'
        });
        break;
      }
    }

    // AT-010: Latency Outlier Span
    for (const s of trace.spans) {
      if (s.durationMs >= 3000) {
        findings.push({
          id: `find-lat-${s.id}`,
          ruleId: 'AT-011',
          severity: 'low',
          spanId: s.id,
          title: `Latency Spike Outlier (${s.durationMs}ms)`,
          description: `Span "${s.name}" took ${s.durationMs}ms, dominating trace tail latency.`,
          remediation: 'Configure strict per-tool timeouts (`timeoutMs: 2000`) and circuit breakers.'
        });
        break;
      }
    }

    // AT-012: Deep Subagent Recursion
    if (dag.maxDepth > 4) {
      findings.push({
        id: 'find-depth',
        ruleId: 'AT-012',
        severity: 'medium',
        title: `Deep Subagent Nesting (Depth ${dag.maxDepth})`,
        description: `Trace depth reached ${dag.maxDepth} nested levels, increasing coordination overhead.`,
        remediation: 'Cap `maxDepth: 3` on subagent delegation.'
      });
    }

    let score = 100;
    for (const f of findings) {
      score -= SEVERITY_PENALTY[f.severity];
    }
    score = Math.max(0, Math.min(100, score));

    const baselinePolicy = {
      agent: trace.agentName,
      maxTurns: trace.maxTurns,
      maxBudgetUsd: trace.budgetUsd,
      loopThreshold: null,
      redactSecrets: false,
      redactPii: false,
      parallelizeIndependentTools: false
    };

    const hardenedPolicy = {
      agent: trace.agentName,
      maxTurns: Math.min(trace.maxTurns, 8),
      maxBudgetUsd: trace.budgetUsd,
      loopThreshold: 2,
      compactContextAfterTurns: 2,
      redactSecrets: true,
      redactPii: true,
      parallelizeIndependentTools: true,
      routingModel: 'gemini-2.5-flash',
      toolTimeoutMs: 2000
    };

    return {
      traceId: trace.traceId,
      agentName: trace.agentName,
      healthScore: score,
      grade: computeGrade(score),
      totalCostUsd,
      totalInputTokens,
      totalOutputTokens,
      totalTokens: totalInputTokens + totalOutputTokens,
      totalDurationMs,
      criticalPathMs: dag.criticalPathMs,
      loopCount,
      maxDepth: dag.maxDepth,
      spanMetrics,
      findings,
      baselinePolicyJson: JSON.stringify(baselinePolicy, null, 2),
      hardenedPolicyJson: JSON.stringify(hardenedPolicy, null, 2)
    };
  }

  static toMarkdown(report: AuditReport, trace: AgentTrace): string {
    const lines = [
      `# AgentTrace Audit Report — ${trace.agentName} (\`${report.traceId}\`)`,
      '',
      `- **Health Score:** ${report.healthScore}/100 (**Grade ${report.grade}**)`,
      `- **Total Cost:** $${report.totalCostUsd.toFixed(4)} (Budget: $${trace.budgetUsd.toFixed(2)})`,
      `- **Total Tokens:** ${report.totalTokens.toLocaleString()} (${report.totalInputTokens} in / ${report.totalOutputTokens} out)`,
      `- **Critical Path:** ${report.criticalPathMs}ms (Total Span Time: ${report.totalDurationMs}ms)`,
      `- **Detected Loops:** ${report.loopCount}`,
      '',
      `## Findings (${report.findings.length})`,
      ''
    ];
    if (report.findings.length === 0) {
      lines.push('No issues detected. Agent trace passes all 12 AgentTrace reliability and security checks.');
    } else {
      for (const f of report.findings) {
        lines.push(`### [${f.severity.toUpperCase()}] ${f.ruleId}: ${f.title}`);
        lines.push(`${f.description}`);
        lines.push(`- **Remediation:** ${f.remediation}`);
        lines.push('');
      }
    }
    return lines.join('\n');
  }
}
