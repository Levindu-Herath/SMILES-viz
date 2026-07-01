interface PropRowProps {
  label: string;
  value: string | number;
}

export function PropRow({ label, value }: PropRowProps) {
  return (
    <div className="flex justify-between items-baseline py-1.5 border-b border-slate-800/50 last:border-0">
      <span className="text-xs text-slate-400">{label}</span>
      <span className="text-sm text-slate-200 font-mono">{value}</span>
    </div>
  );
}
