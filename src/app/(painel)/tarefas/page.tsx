import { Suspense } from "react";
import type { Metadata } from "next";
import { TasksScreen } from "@/components/screens/tasks-screen";
import { ScreenGate } from "@/components/shell/screen-gate";
import { Spinner } from "@/components/ui/spinner";

export const metadata: Metadata = { title: "Tarefas" };

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
        <TasksScreen />
      </Suspense>
    </ScreenGate>
  );
}
