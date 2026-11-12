import type { Metadata } from "next";
import { CountriesScreen } from "@/components/screens/countries-screen";
import { ScreenGate } from "@/components/shell/screen-gate";

export const metadata: Metadata = { title: "Países" };

export default function Page() {
  return (
    <ScreenGate>
      <CountriesScreen />
    </ScreenGate>
  );
}
