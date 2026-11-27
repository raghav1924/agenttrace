#!/usr/bin/env node
/**
 * AgentTrace CLI
 * Author: Jatin Sharma (https://jatinsh.netlify.app/)
 */

import fs from 'fs';
import { BudgetSimulator } from './core/budgetSimulator.js';
import { TraceAnalyzer } from './core/traceAnalyzer.js';
import { TraceAuditor } from './core/traceAuditor.js';
import { StudioServer } from './studio/server.js';
import { SimulationScenario } from './types.js';

const VERSION = '1.0.0';

function printHelp() {
  console.log(`
AgentTrace v${VERSION} — AI Agent Execution Trace Linter & Cost Guardrail Studio

USAGE:
  agenttrace <command> [options]

COMMANDS:
  studio [--port 7373]                 Launch Embedded Bento Grid Studio
  audit <trace.json|sample-id>         Audit an agent trace (--json, --md, --fail-under N)
  simulate <scenario>                  Simulate unprotected-loop | guarded-loop | parallel-optimized
  samples                              List built-in realistic trace fixtures
  version                              Print version
  help                                 Show help
`);
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0] || 'help';

  switch (cmd) {
    case 'samples': {
      console.log('\nBuilt-in AgentTrace Fixtures:');
      for (const t of TraceAnalyzer.getBuiltInTraces()) {
        console.log(`  - ${t.traceId.padEnd(24)} (${t.agentName}, ${t.spans.length} spans)`);
      }
      console.log('');
      break;
    }
    case 'audit': {
      const target = args[1] || 'trc_runaway_loop_01';
      const builtIn = TraceAnalyzer.getBuiltInTraces().find((t) => t.traceId === target);
      const trace = builtIn
        ? builtIn
        : TraceAnalyzer.parseTrace(fs.readFileSync(target, 'utf8'));
      const report = TraceAuditor.audit(trace);

      if (args.includes('--json')) {
        console.log(JSON.stringify(report, null, 2));
      } else if (args.includes('--md')) {
        console.log(TraceAuditor.toMarkdown(report, trace));
      } else {
        console.log(
          `\nAgentTrace Audit: ${trace.agentName} (${report.traceId}) -> ${report.healthScore}/100 [Grade ${report.grade}]`
        );
        console.log(
          `Cost: $${report.totalCostUsd.toFixed(4)} / $${trace.budgetUsd.toFixed(2)} | Tokens: ${report.totalTokens} | Loops: ${report.loopCount}\n`
        );
        for (const f of report.findings) {
          console.log(`  [${f.severity.toUpperCase()}] ${f.ruleId}: ${f.title}`);
        }
        console.log('');
      }

      const failIdx = args.indexOf('--fail-under');
      if (failIdx !== -1 && args[failIdx + 1]) {
        const threshold = Number(args[failIdx + 1]);
        if (report.healthScore < threshold) {
          process.exit(1);
        }
      }
      break;
    }
    case 'simulate': {
      const scenario = (args[1] as SimulationScenario) || 'guarded-loop';
      const sim = BudgetSimulator.simulate(scenario);
      console.log(JSON.stringify(sim, null, 2));
      break;
    }
    case 'studio': {
      const pIdx = args.indexOf('--port');
      const port = pIdx !== -1 && args[pIdx + 1] ? parseInt(args[pIdx + 1], 10) : 7373;
      const studio = new StudioServer(port);
      await studio.start();
      console.log(`AgentTrace Bento Grid Studio live at http://localhost:${port}`);
      break;
    }
    case 'version':
    case '-v':
    case '--version':
      console.log(`v${VERSION}`);
      break;
    default:
      printHelp();
      break;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
