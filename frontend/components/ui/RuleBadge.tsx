import type { RuleResult } from "@/types/molecule";

interface RuleBadgeProps {
  name: string;
  rule: RuleResult;
}

export function RuleBadge({ name, rule }: RuleBadgeProps) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-800/50 last:border-0">
      <span className="text-xs text-slate-300">{name}</span>
      <div className="flex items-center gap-2">
        {rule.passes ? (
          <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-emerald-900/50 text-emerald-400 border border-emerald-700/50">
            Yes{rule.violations > 0 ? `; ${rule.violations} violation` : ""}
          </span>
        ) : (
          <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-red-900/50 text-red-400 border border-red-700/50">
            No; {rule.violations} violation{rule.violations !== 1 ? "s" : ""}
          </span>
        )}
      </div>
    </div>
  );
}
