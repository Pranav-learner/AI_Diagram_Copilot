/**
 * The default rule set — every shipped rule, assembled into a {@link RuleRegistry}.
 *
 * This is the one place that knows the full catalogue. New rules are added by
 * dropping them into a domain file and listing them here; the engine, scoring, and
 * UI need no change. `defaultRuleRegistry()` returns a fresh registry so tests can
 * build isolated ones.
 */

import { RuleRegistry } from '../../model/Rule';
import type { ReviewRule } from '../../model/Rule';
import { UNIVERSAL_RULES } from './universal';
import { SOFTWARE_RULES } from './software';
import { BUSINESS_RULES } from './business';
import { EDUCATION_RULES } from './education';

export * from './universal';
export * from './software';
export * from './business';
export * from './education';

/** Every rule the platform ships with, in a stable order. */
export const ALL_RULES: readonly ReviewRule[] = [
  ...UNIVERSAL_RULES,
  ...SOFTWARE_RULES,
  ...BUSINESS_RULES,
  ...EDUCATION_RULES,
];

/** A fresh registry populated with every default rule. */
export function defaultRuleRegistry(): RuleRegistry {
  return new RuleRegistry().registerAll(ALL_RULES);
}
