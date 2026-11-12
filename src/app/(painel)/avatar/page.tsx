import { Suspense } from "react";
import type { Metadata } from "next";
import { AvatarScreen } from "@/components/screens/avatar-screen";
import { ScreenGate } from "@/components/shell/screen-gate";
import { Spinner } from "@/components/ui/spinner";

export const metadata: Metadata = { title: "Avatar" };

export default function Page() {
  // O avatar vem do endereço (?id=…), que só existe no navegador: por isso o Suspense.
  return (
    <ScreenGate>
      <Suspense
        fallback={
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        }
      >
        <AvatarScreen />
      </Suspense>
    </ScreenGate>
  );
}
