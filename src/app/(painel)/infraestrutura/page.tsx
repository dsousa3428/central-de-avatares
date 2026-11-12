import type { Metadata } from "next";
import { InfraScreen } from "@/components/screens/infra-screen";
import { ScreenGate } from "@/components/shell/screen-gate";

export const metadata: Metadata = { title: "Infraestrutura" };

export default function Page() {
  return (
    <ScreenGate>
      <InfraScreen />
    </ScreenGate>
  );
}
