import { AppShell } from "@/components/shell/app-shell";

export default function PainelLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
