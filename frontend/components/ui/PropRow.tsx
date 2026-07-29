interface PropRowProps {
  label: string;
  value: string | number;
}

export function PropRow({ label, value }: PropRowProps) {
  return (
    <div className="flex justify-between items-baseline py-1.5 border-b border-surface-border last:border-0">
      <span className="text-xs text-text-secondary">{label}</span>
      <span className="text-sm text-text-primary font-medium font-mono">{value}</span>
    </div>
  );
}
