import { Suspense } from "react";
import type { Metadata } from "next";
import { LibraryScreen } from "@/components/screens/library-screen";
import { ScreenGate } from "@/components/shell/screen-gate";
import { Spinner } from "@/components/ui/spinner";

export const metadata: Metadata = { title: "Arquivos e prompts" };

export default function Page() {
  // O avatar pode vir do endereço (?avatar=…), que só existe no navegador: por isso o Suspense.
  return (
    <ScreenGate>
      <Suspense
        fallback={
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        }
      >
        <LibraryScreen />
      </Suspense>
    </ScreenGate>
  );
}
