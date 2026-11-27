/**
 * AgentTrace Core Domain Types
 * Author: Jatin Sharma (https://jatinsh.netlify.app/)
 */

export type SpanKind = 'llm_call' | 'tool_call' | 'subagent' | 'retrieval' | 'error';

export type SpanStatus = 'ok' | 'error' | 'timeout';

export type Severity = 'critical' | 'high' | 'medium' | 'low';

export interface TraceSpan {
  id: string;
  parentId?: string;
  name: string;
  kind: SpanKind;
  model?: string;
  toolName?: string;
  input?: string;
  output?: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  status: SpanStatus;
  timestampMs: number;
}

export interface AgentTrace {
  traceId: string;
  agentName: string;
  environment: string;
  budgetUsd: number;
  maxTurns: number;
  spans: TraceSpan[];
}

export interface AuditFinding {
  id: string;
  ruleId: string;
  severity: Severity;
  spanId?: string;
  title: string;
  description: string;
  remediation: string;
  estimatedWasteUsd?: number;
}

export interface SpanMetrics {
  spanId: string;
  costUsd: number;
  depth: number;
  isCriticalPath: boolean;
}

export interface AuditReport {
  traceId: string;
  agentName: string;
  healthScore: number;
  grade: 'A+' | 'A' | 'B' | 'C' | 'F';
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalDurationMs: number;
  criticalPathMs: number;
  loopCount: number;
  maxDepth: number;
  spanMetrics: Record<string, SpanMetrics>;
  findings: AuditFinding[];
  hardenedPolicyJson: string;
  baselinePolicyJson: string;
}

export type SimulationScenario = 'unprotected-loop' | 'guarded-loop' | 'parallel-optimized';

export interface SimulationStep {
  step: number;
  action: string;
  kind: SpanKind;
  latencyMs: number;
  costUsd: number;
  cumulativeUsd: number;
  status: 'ok' | 'blocked' | 'loop-warning';
}

export interface SimulationResult {
  scenario: SimulationScenario;
  budgetUsd: number;
  maxTurns: number;
  turnsExecuted: number;
  totalCostUsd: number;
  totalLatencyMs: number;
  abortedByGuard: boolean;
  abortReason?: string;
  steps: SimulationStep[];
}
