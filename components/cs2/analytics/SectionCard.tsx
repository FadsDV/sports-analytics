export function SectionCard({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-[#0f172a] border border-[#1e293b] rounded-xl overflow-hidden ${className ?? ""}`}>
      <div className="px-4 py-2.5 border-b border-[#1e293b]">
        <span className="text-[10px] font-semibold text-[#374151] uppercase tracking-widest">
          {label}
        </span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}
