import type { RuleResult } from "@/types/molecule";

interface RuleBadgeProps {
  name: string;
  rule: RuleResult;
}

export function RuleBadge({ name, rule }: RuleBadgeProps) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-surface-border last:border-0">
      <span className="text-xs text-text-secondary">{name}</span>
      <div className="flex items-center gap-2">
        {rule.passes ? (
          <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-success-bg text-success-text border border-success-border">
            Yes{rule.violations > 0 ? `; ${rule.violations} violation` : ""}
          </span>
        ) : (
          <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-danger-bg text-danger-text border border-danger-border">
            No; {rule.violations} violation{rule.violations !== 1 ? "s" : ""}
          </span>
        )}
      </div>
    </div>
  );
}
