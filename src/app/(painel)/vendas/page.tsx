import type { Metadata } from "next";
import { SalesScreen } from "@/components/screens/sales-screen";
import { ScreenGate } from "@/components/shell/screen-gate";

export const metadata: Metadata = { title: "Vendas" };

export default function Page() {
  return (
    <ScreenGate>
      <SalesScreen />
    </ScreenGate>
  );
}
