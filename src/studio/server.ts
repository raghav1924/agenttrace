/**
 * AgentTrace Embedded Bento Grid Studio Server (Port 7373)
 * Combines Bento Grid (#12), Dark Mode (#20), Swiss Grid (#3), Glassmorphism (#10),
 * Cybercore (#24), and Neumorphism (#8) with zero external runtime dependencies.
 * Author: Jatin Sharma (https://jatinsh.netlify.app/)
 */

import http from 'http';
import { BudgetSimulator } from '../core/budgetSimulator.js';
import { TraceAnalyzer } from '../core/traceAnalyzer.js';
import { TraceAuditor } from '../core/traceAuditor.js';
import { SimulationScenario } from '../types.js';

export class StudioServer {
  private server?: http.Server;

  constructor(private readonly port = 7373) {}

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = http.createServer((req, res) => {
        const url = new URL(req.url || '/', `http://localhost:${this.port}`);

        if (req.method === 'GET' && url.pathname === '/api/health') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, service: 'agenttrace', port: this.port }));
          return;
        }

        if (req.method === 'GET' && url.pathname === '/api/traces') {
          const traces = TraceAnalyzer.getBuiltInTraces().map((trace) => ({
            trace,
            report: TraceAuditor.audit(trace)
          }));
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ traces }));
          return;
        }

        if (req.method === 'POST' && url.pathname === '/api/audit') {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
          });
          req.on('end', () => {
            try {
              const payload = JSON.parse(body || '{}') as { raw?: string };
              const trace = TraceAnalyzer.parseTrace(payload.raw || '');
              const report = TraceAuditor.audit(trace);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ trace, report }));
            } catch (err) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Invalid trace JSON' }));
            }
          });
          return;
        }

        if (req.method === 'POST' && url.pathname === '/api/simulate') {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
          });
          req.on('end', () => {
            try {
              const payload = JSON.parse(body || '{}') as {
                scenario?: SimulationScenario;
                budgetUsd?: number;
                maxTurns?: number;
              };
              const scenario = payload.scenario || 'guarded-loop';
              const sim = BudgetSimulator.simulate(
                scenario,
                Number(payload.budgetUsd) || 0.2,
                Number(payload.maxTurns) || 8
              );
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(sim));
            } catch (err) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Simulation failed' }));
            }
          });
          return;
        }

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(this.renderHtml());
      });

      this.server.listen(this.port, () => resolve());
    });
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    await new Promise<void>((resolve) => this.server!.close(() => resolve()));
  }

  private renderHtml(): string {
    const initial = TraceAnalyzer.getBuiltInTraces().map((trace) => ({
      trace,
      report: TraceAuditor.audit(trace)
    }));
    const initialSim = {
      unprotected: BudgetSimulator.simulate('unprotected-loop', 0.2, 8),
      guarded: BudgetSimulator.simulate('guarded-loop', 0.2, 8),
      parallel: BudgetSimulator.simulate('parallel-optimized', 0.2, 8)
    };

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>AgentTrace — AI Agent Trace Linter & Budget Guardrail Studio</title>
  <style>
    :root {
      --bg: #070a12;
      --surface: rgba(15, 23, 42, 0.72);
      --surface-solid: #0f172a;
      --border: rgba(148, 163, 184, 0.16);
      --text: #f8fafc;
      --muted: #94a3b8;
      --emerald: #10b981;
      --cyan: #38bdf8;
      --amber: #f59e0b;
      --rose: #f43f5e;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Inter, -apple-system, BlinkMacSystemFont, sans-serif;
      background:
        radial-gradient(circle at 15% 10%, rgba(56, 189, 248, 0.08), transparent 36%),
        radial-gradient(circle at 85% 0%, rgba(16, 185, 129, 0.08), transparent 32%),
        var(--bg);
      color: var(--text);
      min-height: 100vh;
    }
    .shell { max-width: 1320px; margin: 0 auto; padding: 20px; }
    .topbar {
      display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px;
      padding: 14px 20px; border-radius: 16px;
      background: var(--surface); backdrop-filter: blur(16px); border: 1px solid var(--border);
      box-shadow: 6px 6px 18px rgba(0,0,0,0.45), -3px -3px 12px rgba(255,255,255,0.03);
    }
    .brand { display: flex; align-items: center; gap: 12px; }
    .logo {
      width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center;
      background: linear-gradient(135deg, #38bdf8, #10b981); color: #041016; font-weight: 800; font-family: monospace;
    }
    .pills { display: flex; flex-wrap: wrap; gap: 8px; }
    .btn {
      border: 1px solid var(--border); background: #0b1220; color: var(--text);
      padding: 7px 13px; border-radius: 999px; font-size: 12px; font-weight: 600; cursor: pointer;
      transition: all .15s ease;
    }
    .btn:hover { border-color: var(--cyan); }
    .btn.active { background: #f8fafc; color: #070a12; border-color: #f8fafc; }
    .bento {
      display: grid; grid-template-columns: repeat(12, 1fr); gap: 16px; margin-top: 16px;
    }
    .card {
      background: var(--surface); backdrop-filter: blur(16px);
      border: 1px solid var(--border); border-radius: 16px; padding: 18px;
      box-shadow: 6px 6px 16px rgba(0,0,0,0.38), -4px -4px 12px rgba(255,255,255,0.02);
    }
    .span-3 { grid-column: span 3; }
    .span-4 { grid-column: span 4; }
    .span-5 { grid-column: span 5; }
    .span-6 { grid-column: span 6; }
    .span-7 { grid-column: span 7; }
    .span-8 { grid-column: span 8; }
    .span-12 { grid-column: span 12; }
    @media (max-width: 960px) {
      .span-3, .span-4, .span-5, .span-6, .span-7, .span-8 { grid-column: span 12; }
    }
    .eyebrow {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted);
    }
    .metric { font-size: 28px; font-weight: 700; margin-top: 8px; font-variant-numeric: tabular-nums; }
    .sub { font-size: 12px; color: var(--muted); margin-top: 4px; }
    .gauge-wrap { display: flex; align-items: center; gap: 18px; margin-top: 10px; }
    .finding {
      border: 1px solid var(--border); border-radius: 12px; padding: 12px; margin-top: 10px;
      background: rgba(7, 10, 18, 0.6);
    }
    .sev {
      display: inline-block; font-family: monospace; font-size: 10px; padding: 2px 7px;
      border-radius: 999px; font-weight: 700; text-transform: uppercase; margin-right: 6px;
    }
    .sev-critical { background: rgba(244,63,94,.18); color: var(--rose); border: 1px solid rgba(244,63,94,.4); }
    .sev-high { background: rgba(245,158,11,.18); color: var(--amber); border: 1px solid rgba(245,158,11,.4); }
    .sev-medium { background: rgba(56,189,248,.18); color: var(--cyan); border: 1px solid rgba(56,189,248,.4); }
    .sev-low { background: rgba(16,185,129,.18); color: var(--emerald); border: 1px solid rgba(16,185,129,.4); }
    .span-row {
      display: flex; align-items: center; justify-content: space-between; gap: 10px;
      padding: 9px 12px; border-radius: 10px; border: 1px solid var(--border); margin-top: 8px;
      cursor: pointer; font-family: ui-monospace, monospace; font-size: 12px;
      background: rgba(7, 10, 18, 0.55);
    }
    .span-row.selected { border-color: var(--cyan); background: rgba(56, 189, 248, 0.1); }
    .bar-track { flex: 1; height: 6px; background: rgba(148,163,184,.12); border-radius: 999px; overflow: hidden; }
    .bar-fill { height: 100%; border-radius: 999px; }
    pre {
      margin: 10px 0 0; padding: 12px; border-radius: 12px; background: #05070d;
      border: 1px solid var(--border); overflow-x: auto; font-size: 11px; line-height: 1.5; color: #e2e8f0;
    }
    .diff-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 10px; }
    @media (max-width: 720px) { .diff-grid { grid-template-columns: 1fr; } }
    textarea {
      width: 100%; min-height: 110px; margin-top: 10px; border-radius: 12px; padding: 12px;
      background: #05070d; color: #e2e8f0; border: 1px solid var(--border); font-family: monospace; font-size: 11px;
    }
  </style>
</head>
<body>
  <div class="shell">
    <header class="topbar">
      <div class="brand">
        <div class="logo">AT</div>
        <div>
          <div style="font-weight:700;font-size:15px;">AgentTrace <span style="color:var(--cyan);font-family:monospace;font-size:12px;">v1.0</span></div>
          <div style="font-size:11px;color:var(--muted);">AI Agent Trace Linter · Runaway Loop &amp; Cost Budget Studio</div>
        </div>
      </div>
      <div class="pills" id="traceTabs"></div>
      <div class="pills">
        <button class="btn" onclick="exportMarkdown()">Export MD</button>
        <button class="btn" onclick="exportJson()">Export JSON</button>
      </div>
    </header>

    <section class="bento">
      <!-- Health Score Circular SVG Gauge -->
      <div class="card span-4">
        <div class="eyebrow">01 // Agent Health Score</div>
        <div class="gauge-wrap">
          <svg width="96" height="96" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="42" stroke="rgba(148,163,184,0.16)" stroke-width="10" fill="none"></circle>
            <circle id="gaugeRing" cx="50" cy="50" r="42" stroke="#10b981" stroke-width="10" fill="none"
              stroke-linecap="round" stroke-dasharray="263.89" stroke-dashoffset="263.89" transform="rotate(-90 50 50)"></circle>
            <text id="gaugeScore" x="50" y="54" text-anchor="middle" fill="#f8fafc" font-size="20" font-weight="700">--</text>
          </svg>
          <div>
            <div class="metric" id="gradeText">Grade --</div>
            <div class="sub" id="agentMeta">--</div>
          </div>
        </div>
      </div>

      <div class="card span-3">
        <div class="eyebrow">02 // Cost Attribution</div>
        <div class="metric" id="costMetric">$0.00</div>
        <div class="sub" id="budgetSub">Budget: $0.00</div>
      </div>

      <div class="card span-3">
        <div class="eyebrow">03 // Token Telemetry</div>
        <div class="metric" id="tokenMetric">0</div>
        <div class="sub" id="tokenSub">0 in / 0 out</div>
      </div>

      <div class="card span-2" style="grid-column: span 2;">
        <div class="eyebrow">04 // Loops</div>
        <div class="metric" id="loopMetric">0</div>
        <div class="sub" id="critSub">Critical: 0ms</div>
      </div>

      <!-- Interactive Span DAG & Waterfall -->
      <div class="card span-7">
        <div class="eyebrow">05 // Span Execution Waterfall &amp; Critical Path</div>
        <div id="spanList" style="margin-top:10px;"></div>
      </div>

      <!-- Findings & Diagnostics -->
      <div class="card span-5">
        <div class="eyebrow">06 // 12-Rule Security &amp; Reliability Diagnostics</div>
        <div id="findingsList" style="max-height:360px;overflow-y:auto;"></div>
      </div>

      <!-- Selected Span Inspector -->
      <div class="card span-6">
        <div class="eyebrow">07 // Split-Screen Span Payload Inspector</div>
        <div id="spanDetail" class="sub" style="margin-top:8px;">Click any span above to inspect input/output payloads.</div>
        <pre id="spanPayload">{}</pre>
      </div>

      <!-- Live Budget & Loop Guardrail Simulator -->
      <div class="card span-6">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
          <div class="eyebrow">08 // Loop &amp; Budget Guardrail Simulator</div>
          <div class="pills">
            <button class="btn" onclick="renderSim('unprotected')">Unprotected</button>
            <button class="btn active" onclick="renderSim('guarded')">Guarded</button>
            <button class="btn" onclick="renderSim('parallel')">Parallel</button>
          </div>
        </div>
        <div id="simSummary" class="sub" style="margin-top:10px;"></div>
        <div id="simSteps" style="margin-top:8px;max-height:220px;overflow-y:auto;"></div>
      </div>

      <!-- Side-by-Side Hardened Policy Diff -->
      <div class="card span-12">
        <div class="eyebrow">09 // Side-by-Side Automated Policy Hardening Diff</div>
        <div class="diff-grid">
          <div>
            <div class="sub" style="color:var(--rose);">CURRENT POLICY (UNPROTECTED)</div>
            <pre id="baselinePolicy"></pre>
          </div>
          <div>
            <div class="sub" style="color:var(--emerald);">HARDENED POLICY (RECOMMENDED)</div>
            <pre id="hardenedPolicy"></pre>
          </div>
        </div>
      </div>

      <!-- Custom Trace Paste Box -->
      <div class="card span-12">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div class="eyebrow">10 // Paste Custom Trace JSON / JSONL</div>
          <button class="btn active" onclick="auditCustom()">Audit Trace</button>
        </div>
        <textarea id="customInput" placeholder='Paste OpenAI / MCP / LangGraph trace JSON or JSONL here...'></textarea>
      </div>
    </section>
  </div>

  <script>
    const TRACES = ${JSON.stringify(initial)};
    const SIMS = ${JSON.stringify(initialSim)};
    let activeIdx = 0;
    let selectedSpanId = null;

    function renderTabs() {
      const el = document.getElementById('traceTabs');
      el.innerHTML = TRACES.map((item, i) =>
        '<button class="btn ' + (i === activeIdx ? 'active' : '') + '" onclick="selectTrace(' + i + ')">' +
        item.trace.agentName + '</button>'
      ).join('');
    }

    function selectTrace(i) {
      activeIdx = i;
      selectedSpanId = TRACES[i].trace.spans[0]?.id || null;
      renderTabs();
      renderActive();
    }

    function selectSpan(id) {
      selectedSpanId = id;
      renderActive();
    }

    function renderActive() {
      const { trace, report } = TRACES[activeIdx];
      const circ = 263.89;
      const ring = document.getElementById('gaugeRing');
      ring.style.strokeDashoffset = String(circ - (circ * report.healthScore) / 100);
      ring.style.stroke = report.healthScore >= 82 ? '#10b981' : report.healthScore >= 60 ? '#f59e0b' : '#f43f5e';
      document.getElementById('gaugeScore').textContent = report.healthScore + '%';
      document.getElementById('gradeText').textContent = 'Grade ' + report.grade;
      document.getElementById('agentMeta').textContent = trace.agentName + ' · ' + trace.environment;
      document.getElementById('costMetric').textContent = '$' + report.totalCostUsd.toFixed(4);
      document.getElementById('budgetSub').textContent = 'Budget: $' + trace.budgetUsd.toFixed(2);
      document.getElementById('tokenMetric').textContent = report.totalTokens.toLocaleString();
      document.getElementById('tokenSub').textContent = report.totalInputTokens + ' in / ' + report.totalOutputTokens + ' out';
      document.getElementById('loopMetric').textContent = String(report.loopCount);
      document.getElementById('critSub').textContent = 'Critical: ' + report.criticalPathMs + 'ms';

      const maxDur = Math.max(1, ...trace.spans.map(s => s.durationMs));
      document.getElementById('spanList').innerHTML = trace.spans.map(s => {
        const pct = Math.max(6, Math.round((s.durationMs / maxDur) * 100));
        const col = s.status !== 'ok' ? 'var(--rose)' : s.kind === 'llm_call' ? 'var(--cyan)' : 'var(--emerald)';
        const isSel = s.id === selectedSpanId;
        return '<div class="span-row ' + (isSel ? 'selected' : '') + '" onclick="selectSpan(\\'' + s.id + '\\')">' +
          '<span style="min-width:155px;">' + s.name + '</span>' +
          '<div class="bar-track"><div class="bar-fill" style="width:' + pct + '%;background:' + col + '"></div></div>' +
          '<span style="min-width:65px;text-align:right;">' + s.durationMs + 'ms</span>' +
        '</div>';
      }).join('');

      document.getElementById('findingsList').innerHTML = report.findings.length === 0
        ? '<div class="sub" style="margin-top:14px;color:var(--emerald);">✔ Zero reliability or security findings.</div>'
        : report.findings.map(f =>
            '<div class="finding">' +
              '<div><span class="sev sev-' + f.severity + '">' + f.severity + '</span><strong>' + f.ruleId + ': ' + f.title + '</strong></div>' +
              '<div class="sub">' + f.description + '</div>' +
              '<div class="sub" style="color:var(--cyan);">Fix: ' + f.remediation + '</div>' +
            '</div>'
          ).join('');

      const span = trace.spans.find(s => s.id === selectedSpanId) || trace.spans[0];
      document.getElementById('spanDetail').textContent = span ? (span.id + ' · ' + span.kind + ' · ' + (span.model || span.toolName || 'step')) : '';
      document.getElementById('spanPayload').textContent = JSON.stringify(span || {}, null, 2);

      document.getElementById('baselinePolicy').textContent = report.baselinePolicyJson;
      document.getElementById('hardenedPolicy').textContent = report.hardenedPolicyJson;
    }

    function renderSim(key) {
      const sim = SIMS[key];
      document.getElementById('simSummary').textContent =
        'Turns: ' + sim.turnsExecuted + ' · Cost: $' + sim.totalCostUsd.toFixed(4) + ' · Latency: ' + sim.totalLatencyMs + 'ms' +
        (sim.abortedByGuard ? ' · ✔ ' + sim.abortReason : '');
      document.getElementById('simSteps').innerHTML = sim.steps.map(st =>
        '<div class="span-row">' +
          '<span>#' + st.step + ' ' + st.action + '</span>' +
          '<span style="color:' + (st.status === 'blocked' ? 'var(--emerald)' : st.status === 'loop-warning' ? 'var(--rose)' : 'var(--muted)') + '">$' + st.cumulativeUsd.toFixed(4) + '</span>' +
        '</div>'
      ).join('');
    }

    async function auditCustom() {
      const raw = document.getElementById('customInput').value;
      const res = await fetch('/api/audit', { method: 'POST', body: JSON.stringify({ raw }) });
      const data = await res.json();
      if (data.error) { alert(data.error); return; }
      TRACES.unshift(data);
      selectTrace(0);
    }

    function exportJson() {
      const blob = new Blob([JSON.stringify(TRACES[activeIdx], null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = TRACES[activeIdx].trace.traceId + '-audit.json';
      a.click();
    }

    function exportMarkdown() {
      const { trace, report } = TRACES[activeIdx];
      const md = '# AgentTrace Report: ' + trace.agentName + '\\nScore: ' + report.healthScore + '/100 (' + report.grade + ')\\nFindings: ' + report.findings.length;
      navigator.clipboard?.writeText(md);
      alert('Markdown summary copied to clipboard.');
    }

    renderTabs();
    selectedSpanId = TRACES[0].trace.spans[0]?.id || null;
    renderActive();
    renderSim('guarded');
  </script>
</body>
</html>`;
  }
}
