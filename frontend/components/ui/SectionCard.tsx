interface SectionCardProps {
  title: string;
  children: React.ReactNode;
}

export function SectionCard({ title, children }: SectionCardProps) {
  return (
    <div className="rounded-lg border border-surface-border bg-surface-card p-5 shadow-card">
      <h3 className="text-[11px] font-semibold text-primary-500 uppercase tracking-wider mb-4">
        {title}
      </h3>
      {children}
    </div>
  );
}
