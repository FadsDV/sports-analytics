import type { Metadata } from "next";
import BetSlipChecker from "@/components/betslip/BetSlipChecker";

export const metadata: Metadata = {
  title: "Slip Checker · DegenHUB",
  description: "Upload your AFL betslip and get an honest verdict on every leg.",
};

export default function BetSlipPage() {
  return (
    <main className="min-h-screen bg-bg">
      <div className="max-w-screen-sm mx-auto px-4 py-8">
        <BetSlipChecker />
      </div>
    </main>
  );
}
