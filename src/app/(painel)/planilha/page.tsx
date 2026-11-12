import type { Metadata } from "next";
import { SheetScreen } from "@/components/screens/sheet-screen";
import { ScreenGate } from "@/components/shell/screen-gate";

export const metadata: Metadata = { title: "Planilha" };

export default function Page() {
  return (
    <ScreenGate>
      <SheetScreen />
    </ScreenGate>
  );
}
