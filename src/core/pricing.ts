/**
 * Model Token Pricing & Cost Attribution Engine
 * Author: Jatin Sharma (https://jatinsh.netlify.app/)
 */

export interface ModelPricing {
  model: string;
  inputPer1M: number;
  outputPer1M: number;
  tier: 'frontier' | 'balanced' | 'fast';
}

export const MODEL_PRICING_TABLE: Record<string, ModelPricing> = {
  'gpt-4o': { model: 'gpt-4o', inputPer1M: 2.5, outputPer1M: 10.0, tier: 'frontier' },
  'gpt-4o-mini': { model: 'gpt-4o-mini', inputPer1M: 0.15, outputPer1M: 0.6, tier: 'fast' },
  'o3-mini': { model: 'o3-mini', inputPer1M: 1.1, outputPer1M: 4.4, tier: 'balanced' },
  'claude-3-7-sonnet': {
    model: 'claude-3-7-sonnet',
    inputPer1M: 3.0,
    outputPer1M: 15.0,
    tier: 'frontier'
  },
  'claude-3-5-haiku': {
    model: 'claude-3-5-haiku',
    inputPer1M: 0.8,
    outputPer1M: 4.0,
    tier: 'fast'
  },
  'gemini-2.5-pro': {
    model: 'gemini-2.5-pro',
    inputPer1M: 1.25,
    outputPer1M: 10.0,
    tier: 'frontier'
  },
  'gemini-2.5-flash': {
    model: 'gemini-2.5-flash',
    inputPer1M: 0.15,
    outputPer1M: 0.6,
    tier: 'fast'
  }
};

export function getModelPricing(model?: string): ModelPricing {
  if (!model) {
    return MODEL_PRICING_TABLE['gpt-4o-mini'];
  }
  const key = model.trim().toLowerCase();
  return MODEL_PRICING_TABLE[key] || MODEL_PRICING_TABLE['gpt-4o'];
}

export function calculateSpanCostUsd(
  model: string | undefined,
  inputTokens: number,
  outputTokens: number
): number {
  const pricing = getModelPricing(model);
  const inCost = (Math.max(0, inputTokens) / 1_000_000) * pricing.inputPer1M;
  const outCost = (Math.max(0, outputTokens) / 1_000_000) * pricing.outputPer1M;
  return Number((inCost + outCost).toFixed(6));
}

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}
