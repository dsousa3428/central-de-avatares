import { Suspense } from "react";
import type { Metadata } from "next";
import { SalesScreen } from "@/components/screens/sales-screen";
import { ScreenGate } from "@/components/shell/screen-gate";
import { Spinner } from "@/components/ui/spinner";

export const metadata: Metadata = { title: "Vendas" };

export default function Page() {
  // A semana pode vir do endereço (?semana=…), que só existe no navegador: por isso o Suspense.
  return (
    <ScreenGate>
      <Suspense
        fallback={
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        }
      >
        <SalesScreen />
      </Suspense>
    </ScreenGate>
  );
}
