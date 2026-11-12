import Link from "next/link";
import { Logo } from "@/components/logo";
import { buttonClass } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col items-center justify-center px-5 text-center">
      <Logo className="size-14" />
      <h1 className="mt-4 text-xl font-bold">Página não encontrada</h1>
      <p className="mt-1 text-sm text-muted">Este endereço não existe no painel.</p>
      <Link href="/" className={buttonClass("primary", "md", "mt-6")}>
        Voltar ao início
      </Link>
    </main>
  );
}
