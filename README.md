# AgentTrace

> **AI Agent Execution Trace Linter, Runaway Loop & Cost Budget Guardrail Simulator with Embedded Bento Grid Studio**  
> Built with **zero external runtime dependencies** in TypeScript & Node.js.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript: 5.7](https://img.shields.io/badge/TypeScript-5.7-3178C6.svg)](https://www.typescriptlang.org/)
[![Zero Dependencies](https://img.shields.io/badge/Dependencies-Zero-10b981.svg)](package.json)
[![Author](https://img.shields.io/badge/Architect-Jatin%20Sharma-38bdf8.svg)](https://jatinsh.netlify.app/)

---

## Why AgentTrace?

Autonomous AI agents fail in subtle, expensive ways: infinite tool-call loops, quadratic context-window bloat, unmasked credentials inside telemetry, and sequential fan-out bottlenecks. **AgentTrace** audits multi-step OpenAI, Anthropic, MCP, and LangGraph traces locally—before they burn production budgets.

- **12 Deterministic Audit Rules (`AT-001` – `AT-012`):** Detects runaway tool loops, exposed secrets (`AKIA...`, `ghp_`, `sk-`), PII, budget/turn overruns, quadratic context growth, and missed parallel tool calls.
- **DAG Critical Path & Model Cost Attribution:** Computes critical-path latency and per-turn USD spend across GPT-4o, Claude 3.7 Sonnet, Gemini 2.5 Pro/Flash, and o3-mini.
- **Loop & Budget Guardrail Simulator:** Compare `unprotected-loop`, `guarded-loop`, and `parallel-optimized` execution paths side-by-side.
- **Embedded Bento Grid Studio (`Port 7373`):** Glassmorphic dark-mode UI with a Circular SVG Health Gauge, Span Waterfall, Split-Screen Payload Inspector, Policy Hardening Diff, and Markdown/JSON export.

---

## Installation & Quickstart

```bash
git clone https://github.com/raghav1924/agenttrace.git
cd agenttrace
npm install
npm run build
npm test
```

### Launch the Bento Grid Studio

```bash
npm run studio
# Live at http://localhost:7373
```

### CLI Usage

```bash
# List built-in trace fixtures
node dist/cli.js samples

# Audit a trace with CI/CD gate
node dist/cli.js audit trc_runaway_loop_01 --fail-under 80

# Export Markdown audit report
node dist/cli.js audit trc_runaway_loop_01 --md

# Run deterministic budget guardrail simulation
node dist/cli.js simulate guarded-loop
```

---

## License

MIT License. Crafted by **[Jatin Sharma](https://jatinsh.netlify.app/)**.
