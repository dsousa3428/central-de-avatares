import type { Metadata } from "next";
import { SettingsScreen } from "@/components/screens/settings-screen";
import { ScreenGate } from "@/components/shell/screen-gate";

export const metadata: Metadata = { title: "Configurações" };

export default function Page() {
  return (
    <ScreenGate>
      <SettingsScreen />
    </ScreenGate>
  );
}
