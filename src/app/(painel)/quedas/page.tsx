import type { Metadata } from "next";
import { FallsScreen } from "@/components/screens/falls-screen";
import { ScreenGate } from "@/components/shell/screen-gate";

export const metadata: Metadata = { title: "Quedas" };

export default function Page() {
  return (
    <ScreenGate>
      <FallsScreen />
    </ScreenGate>
  );
}
