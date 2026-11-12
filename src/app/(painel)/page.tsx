import type { Metadata } from "next";
import { TodayScreen } from "@/components/screens/today-screen";
import { ScreenGate } from "@/components/shell/screen-gate";

export const metadata: Metadata = { title: "Hoje" };

export default function Page() {
  return (
    <ScreenGate>
      <TodayScreen />
    </ScreenGate>
  );
}
