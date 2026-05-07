import { FormResult } from "@/lib/types";

const COLOR: Record<FormResult, string> = {
  W: "bg-[#22C55E]/20 text-[#22C55E] border border-[#22C55E]/30",
  D: "bg-[#F59E0B]/20 text-[#F59E0B] border border-[#F59E0B]/30",
  L: "bg-[#EF4444]/20 text-[#EF4444] border border-[#EF4444]/30",
};

export default function FormPills({ form }: { form: FormResult[] }) {
  return (
    <div className="flex gap-1">
      {form.map((r, i) => (
        <span
          key={i}
          title={r === "W" ? "Win" : r === "D" ? "Draw" : "Loss"}
          className={`w-5 h-5 flex items-center justify-center rounded text-[10px] font-bold ${COLOR[r]}`}
        >
          {r}
        </span>
      ))}
    </div>
  );
}
