/**
 * Agent Trace Parser, Critical Path DAG Analyzer & Built-In Realistic Trace Fixtures
 * Author: Jatin Sharma (https://jatinsh.netlify.app/)
 */

import { AgentTrace, SpanKind, SpanStatus, TraceSpan } from '../types.js';

const VALID_KINDS = new Set<SpanKind>(['llm_call', 'tool_call', 'subagent', 'retrieval', 'error']);
const VALID_STATUS = new Set<SpanStatus>(['ok', 'error', 'timeout']);

function normalizeSpan(raw: Record<string, unknown>, index: number): TraceSpan {
  const kind = VALID_KINDS.has(raw.kind as SpanKind) ? (raw.kind as SpanKind) : 'tool_call';
  const status = VALID_STATUS.has(raw.status as SpanStatus) ? (raw.status as SpanStatus) : 'ok';
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : `span-${index + 1}`,
    parentId: typeof raw.parentId === 'string' && raw.parentId ? raw.parentId : undefined,
    name: typeof raw.name === 'string' && raw.name ? raw.name : `step_${index + 1}`,
    kind,
    model: typeof raw.model === 'string' ? raw.model : undefined,
    toolName: typeof raw.toolName === 'string' ? raw.toolName : undefined,
    input: typeof raw.input === 'string' ? raw.input : raw.input ? JSON.stringify(raw.input) : undefined,
    output: typeof raw.output === 'string' ? raw.output : raw.output ? JSON.stringify(raw.output) : undefined,
    inputTokens: Number(raw.inputTokens) || 0,
    outputTokens: Number(raw.outputTokens) || 0,
    durationMs: Math.max(0, Number(raw.durationMs) || 0),
    status,
    timestampMs: Number(raw.timestampMs) || index * 400
  };
}

export class TraceAnalyzer {
  static parseTrace(rawInput: string): AgentTrace {
    const trimmed = rawInput.trim();
    if (!trimmed) {
      throw new Error('Trace input is empty.');
    }

    if (trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed) as Record<string, unknown>;
        const rawSpans = Array.isArray(parsed.spans) ? parsed.spans : [];
        return {
          traceId: typeof parsed.traceId === 'string' ? parsed.traceId : 'trace-custom',
          agentName: typeof parsed.agentName === 'string' ? parsed.agentName : 'CustomAgent',
          environment: typeof parsed.environment === 'string' ? parsed.environment : 'local',
          budgetUsd: Number(parsed.budgetUsd) > 0 ? Number(parsed.budgetUsd) : 0.5,
          maxTurns: Number(parsed.maxTurns) > 0 ? Number(parsed.maxTurns) : 10,
          spans: rawSpans.map((s, idx) => normalizeSpan((s || {}) as Record<string, unknown>, idx))
        };
      } catch {
        // Multi-line JSONL starting with '{' falls through to JSONL parser below
      }
    }

    if (trimmed.startsWith('[')) {
      const arr = JSON.parse(trimmed) as Array<Record<string, unknown>>;
      return {
        traceId: 'trace-array',
        agentName: 'ImportedAgent',
        environment: 'local',
        budgetUsd: 0.5,
        maxTurns: 12,
        spans: arr.map((s, idx) => normalizeSpan(s || {}, idx))
      };
    }

    // JSONL fallback (one span JSON object per line)
    const lines = trimmed
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const spans = lines.map((line, idx) => normalizeSpan(JSON.parse(line) as Record<string, unknown>, idx));
    return {
      traceId: 'trace-jsonl',
      agentName: 'StreamedAgent',
      environment: 'local',
      budgetUsd: 0.5,
      maxTurns: 12,
      spans
    };
  }

  static computeDagMetrics(spans: TraceSpan[]): {
    depths: Record<string, number>;
    maxDepth: number;
    criticalPathIds: Set<string>;
    criticalPathMs: number;
  } {
    const byId = new Map<string, TraceSpan>();
    const children = new Map<string, TraceSpan[]>();
    spans.forEach((s) => {
      byId.set(s.id, s);
      if (s.parentId) {
        const list = children.get(s.parentId) || [];
        list.push(s);
        children.set(s.parentId, list);
      }
    });

    const depths: Record<string, number> = {};
    const memoPath = new Map<string, { ms: number; ids: string[] }>();

    const getDepth = (id: string, seen = new Set<string>()): number => {
      if (depths[id] !== undefined) return depths[id];
      const span = byId.get(id);
      if (!span || !span.parentId || !byId.has(span.parentId) || seen.has(id)) {
        depths[id] = 0;
        return 0;
      }
      seen.add(id);
      const d = 1 + getDepth(span.parentId, seen);
      depths[id] = d;
      return d;
    };

    const longestFrom = (id: string, seen = new Set<string>()): { ms: number; ids: string[] } => {
      if (memoPath.has(id)) return memoPath.get(id)!;
      const span = byId.get(id);
      if (!span || seen.has(id)) return { ms: 0, ids: [] };
      seen.add(id);
      const kids = children.get(id) || [];
      let bestChild = { ms: 0, ids: [] as string[] };
      for (const k of kids) {
        const res = longestFrom(k.id, new Set(seen));
        if (res.ms > bestChild.ms) {
          bestChild = res;
        }
      }
      const out = { ms: span.durationMs + bestChild.ms, ids: [id, ...bestChild.ids] };
      memoPath.set(id, out);
      return out;
    };

    let maxDepth = 0;
    for (const s of spans) {
      maxDepth = Math.max(maxDepth, getDepth(s.id));
    }

    const roots = spans.filter((s) => !s.parentId || !byId.has(s.parentId));
    let bestRoot = { ms: 0, ids: [] as string[] };
    for (const r of roots) {
      const res = longestFrom(r.id);
      if (res.ms > bestRoot.ms) {
        bestRoot = res;
      }
    }

    return {
      depths,
      maxDepth,
      criticalPathIds: new Set(bestRoot.ids),
      criticalPathMs: bestRoot.ms
    };
  }

  static getBuiltInTraces(): AgentTrace[] {
    return [
      {
        traceId: 'trc_runaway_loop_01',
        agentName: 'RepoFixerAgent',
        environment: 'production',
        budgetUsd: 0.2,
        maxTurns: 8,
        spans: [
          {
            id: 'sp-1',
            name: 'plan_fix',
            kind: 'llm_call',
            model: 'claude-3-7-sonnet',
            input: 'Fix failing auth test in src/auth.ts',
            output: 'Calling read_file("src/auth.ts")',
            inputTokens: 1200,
            outputTokens: 110,
            durationMs: 720,
            status: 'ok',
            timestampMs: 0
          },
          {
            id: 'sp-2',
            parentId: 'sp-1',
            name: 'read_auth_file',
            kind: 'tool_call',
            toolName: 'read_file',
            input: '{"path":"src/auth.ts"}',
            output: 'AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE\nexport function verify() {}',
            inputTokens: 0,
            outputTokens: 0,
            durationMs: 45,
            status: 'ok',
            timestampMs: 730
          },
          {
            id: 'sp-3',
            parentId: 'sp-1',
            name: 'run_tests_1',
            kind: 'tool_call',
            toolName: 'run_tests',
            input: '{"suite":"auth"}',
            output: 'Error: ECONNREFUSED 127.0.0.1:5432',
            inputTokens: 0,
            outputTokens: 0,
            durationMs: 1450,
            status: 'error',
            timestampMs: 790
          },
          {
            id: 'sp-4',
            parentId: 'sp-1',
            name: 'retry_plan_1',
            kind: 'llm_call',
            model: 'claude-3-7-sonnet',
            input: 'History + Error: ECONNREFUSED 127.0.0.1:5432',
            output: 'Retrying run_tests({"suite":"auth"})',
            inputTokens: 3400,
            outputTokens: 95,
            durationMs: 890,
            status: 'ok',
            timestampMs: 2250
          },
          {
            id: 'sp-5',
            parentId: 'sp-4',
            name: 'run_tests_2',
            kind: 'tool_call',
            toolName: 'run_tests',
            input: '{"suite":"auth"}',
            output: 'Error: ECONNREFUSED 127.0.0.1:5432',
            inputTokens: 0,
            outputTokens: 0,
            durationMs: 1520,
            status: 'error',
            timestampMs: 3150
          },
          {
            id: 'sp-6',
            parentId: 'sp-4',
            name: 'retry_plan_2',
            kind: 'llm_call',
            model: 'claude-3-7-sonnet',
            input: 'Full expanded history (6k tokens)',
            output: 'Retrying run_tests({"suite":"auth"})',
            inputTokens: 6900,
            outputTokens: 90,
            durationMs: 1120,
            status: 'ok',
            timestampMs: 4680
          },
          {
            id: 'sp-7',
            parentId: 'sp-6',
            name: 'run_tests_3',
            kind: 'tool_call',
            toolName: 'run_tests',
            input: '{"suite":"auth"}',
            output: 'Error: ECONNREFUSED 127.0.0.1:5432',
            inputTokens: 0,
            outputTokens: 0,
            durationMs: 1490,
            status: 'error',
            timestampMs: 5810
          },
          {
            id: 'sp-8',
            parentId: 'sp-6',
            name: 'retry_plan_3',
            kind: 'llm_call',
            model: 'claude-3-7-sonnet',
            input: 'Full expanded history (11k tokens)',
            output: 'Retrying run_tests({"suite":"auth"})',
            inputTokens: 11800,
            outputTokens: 120,
            durationMs: 1400,
            status: 'ok',
            timestampMs: 7310
          },
          {
            id: 'sp-9',
            parentId: 'sp-8',
            name: 'run_tests_4',
            kind: 'tool_call',
            toolName: 'run_tests',
            input: '{"suite":"auth"}',
            output: 'Timeout after 3500ms',
            inputTokens: 0,
            outputTokens: 0,
            durationMs: 3500,
            status: 'timeout',
            timestampMs: 8720
          }
        ]
      },
      {
        traceId: 'trc_seq_bottleneck_02',
        agentName: 'SupportTriageAgent',
        environment: 'staging',
        budgetUsd: 0.25,
        maxTurns: 10,
        spans: [
          {
            id: 'sp-1',
            name: 'route_ticket',
            kind: 'llm_call',
            model: 'gpt-4o',
            input: 'Classify ticket #4821 for user alice@example.com',
            output: 'Intent: billing_refund',
            inputTokens: 900,
            outputTokens: 65,
            durationMs: 640,
            status: 'ok',
            timestampMs: 0
          },
          {
            id: 'sp-2',
            parentId: 'sp-1',
            name: 'fetch_stripe_customer',
            kind: 'tool_call',
            toolName: 'stripe_lookup',
            input: '{"email":"alice@example.com"}',
            output: '{"cus":"cus_9281","plan":"pro"}',
            inputTokens: 0,
            outputTokens: 0,
            durationMs: 820,
            status: 'ok',
            timestampMs: 650
          },
          {
            id: 'sp-3',
            parentId: 'sp-1',
            name: 'fetch_invoices',
            kind: 'tool_call',
            toolName: 'list_invoices',
            input: '{"cus":"cus_9281"}',
            output: '[{"id":"in_11","amount":4900}]',
            inputTokens: 0,
            outputTokens: 0,
            durationMs: 910,
            status: 'ok',
            timestampMs: 1490
          },
          {
            id: 'sp-4',
            parentId: 'sp-1',
            name: 'kb_search',
            kind: 'retrieval',
            toolName: 'vector_search',
            input: '{"query":"pro plan refund policy"}',
            output: 'Refunds allowed within 14 days.',
            inputTokens: 0,
            outputTokens: 0,
            durationMs: 680,
            status: 'ok',
            timestampMs: 2420
          },
          {
            id: 'sp-5',
            parentId: 'sp-1',
            name: 'draft_reply',
            kind: 'llm_call',
            model: 'gpt-4o-mini',
            input: 'Compose empathetic refund confirmation.',
            output: 'Hi Alice, your $49 refund has been initiated.',
            inputTokens: 1450,
            outputTokens: 140,
            durationMs: 410,
            status: 'ok',
            timestampMs: 3120
          }
        ]
      },
      {
        traceId: 'trc_healthy_mcp_03',
        agentName: 'CodeReviewOrchestrator',
        environment: 'production',
        budgetUsd: 0.3,
        maxTurns: 10,
        spans: [
          {
            id: 'sp-1',
            name: 'orchestrate_review',
            kind: 'llm_call',
            model: 'gemini-2.5-flash',
            input: 'Review PR #142 across security, types, and tests.',
            output: 'Dispatching 3 parallel MCP sub-tasks.',
            inputTokens: 850,
            outputTokens: 90,
            durationMs: 320,
            status: 'ok',
            timestampMs: 0
          },
          {
            id: 'sp-2',
            parentId: 'sp-1',
            name: 'mcp_lint_types',
            kind: 'tool_call',
            toolName: 'tsc_check',
            input: '{"project":"tsconfig.json"}',
            output: '0 errors',
            inputTokens: 0,
            outputTokens: 0,
            durationMs: 540,
            status: 'ok',
            timestampMs: 330
          },
          {
            id: 'sp-3',
            parentId: 'sp-1',
            name: 'mcp_security_scan',
            kind: 'tool_call',
            toolName: 'semgrep_scan',
            input: '{"diff":"pr-142.patch"}',
            output: '0 findings',
            inputTokens: 0,
            outputTokens: 0,
            durationMs: 610,
            status: 'ok',
            timestampMs: 335
          },
          {
            id: 'sp-4',
            parentId: 'sp-1',
            name: 'synthesize_summary',
            kind: 'llm_call',
            model: 'claude-3-5-haiku',
            input: 'Summarize clean checks for PR #142.',
            output: 'All type and security checks passed cleanly.',
            inputTokens: 1100,
            outputTokens: 120,
            durationMs: 380,
            status: 'ok',
            timestampMs: 960
          }
        ]
      }
    ];
  }
}
