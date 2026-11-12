"use client";

import { useEffect, useState } from "react";
import { Database, ExternalLink, PlugZap, RefreshCw, TriangleAlert } from "lucide-react";
import type { AppError } from "@/lib/errors";
import { copyText } from "@/lib/clipboard";
import { signOut } from "@/lib/auth";
import type { SupabaseConfigProblem } from "@/lib/supabase";
import { Button, buttonClass } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import { useToast } from "@/components/ui/toast";

function SetupLayout({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-5 py-10">
      <div className="mb-6 flex items-center gap-3">
        <Logo />
        <span className="font-semibold">Central de Avatares</span>
      </div>
      <div className="rounded-3xl border border-line bg-surface p-6 shadow-card">
        <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-primary-soft text-primary-soft-fg [&_svg]:size-6">
          {icon}
        </div>
        <h1 className="text-xl font-bold tracking-tight">{title}</h1>
        <div className="mt-3 space-y-4 text-[15px] leading-relaxed text-muted">{children}</div>
      </div>
    </div>
  );
}

function Steps({ children }: { children: React.ReactNode }) {
  return <ol className="list-decimal space-y-2 pl-5 text-fg marker:font-semibold marker:text-muted">{children}</ol>;
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="break-all rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-[13px] text-fg">{children}</code>
  );
}

/** Faltam as variáveis de ambiente do Supabase (configuração na Vercel). */
export function EnvMissingScreen({ problem }: { problem: SupabaseConfigProblem }) {
  return (
    <SetupLayout icon={<PlugZap />} title="Falta conectar o Supabase">
      <p>
        {problem === "bad_url"
          ? "O endereço do Supabase informado não parece válido. Ele deve ser algo como https://abcdefgh.supabase.co."
          : "O painel ainda não sabe onde fica o seu banco de dados. Isso se resolve uma única vez, na Vercel:"}
      </p>
      <Steps>
        <li>
          Na Vercel, abra o projeto → <strong>Settings</strong> → <strong>Environment Variables</strong>.
        </li>
        <li>
          Crie <Code>NEXT_PUBLIC_SUPABASE_URL</Code> com o endereço do seu projeto no Supabase.
        </li>
        <li>
          Crie <Code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</Code> com a chave pública (publishable / anon).
        </li>
        <li>
          Vá em <strong>Deployments</strong>, abra o menu (⋯) do último e clique em <strong>Redeploy</strong>.
        </li>
      </Steps>
      <p className="text-sm">O passo a passo completo, com cliques, está no arquivo README do projeto.</p>
    </SetupLayout>
  );
}

/** As tabelas ainda não existem (ou estão desatualizadas) no Supabase. */
export function SchemaMissingScreen({ error, onRetry }: { error: AppError; onRetry: () => void }) {
  const toast = useToast();
  const [sql, setSql] = useState<string | null>(null);

  // Já deixa o script na memória: ao tocar em "Copiar" a cópia é imediata.
  useEffect(() => {
    let active = true;
    fetch("/schema.sql")
      .then((response) => (response.ok ? response.text() : null))
      .then((text) => {
        if (active && text) setSql(text);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  async function copySql() {
    if (!sql) return;
    const ok = await copyText(sql);
    if (ok) toast.success("Script copiado. Agora cole no SQL Editor do Supabase.");
    else toast.error("Não consegui copiar. Abra o arquivo supabase/schema.sql no GitHub e copie de lá.");
  }

  return (
    <SetupLayout icon={<Database />} title="Falta preparar o banco de dados">
      <p>
        O login funcionou, mas as tabelas do painel ainda não existem no seu Supabase (ou estão desatualizadas).
        Leva um minuto para resolver:
      </p>
      <Steps>
        <li>
          Toque em <strong>Copiar script SQL</strong> aqui embaixo.
        </li>
        <li>
          No Supabase, abra <strong>SQL Editor</strong> (menu da esquerda) e cole o script.
        </li>
        <li>
          Clique em <strong>Run</strong>. Deve aparecer <em>“Tudo certo!”</em>.
        </li>
        <li>
          Volte aqui e toque em <strong>Já rodei</strong>.
        </li>
      </Steps>
      <p className="text-sm">Rodar o script de novo é seguro: ele só cria o que falta e nunca apaga dados.</p>
      <div className="flex flex-col gap-2 pt-1 sm:flex-row">
        <Button variant="primary" onClick={copySql} disabled={!sql}>
          Copiar script SQL
        </Button>
        <a
          className={buttonClass("secondary")}
          href="https://supabase.com/dashboard"
          target="_blank"
          rel="noopener noreferrer"
        >
          Abrir o Supabase <ExternalLink className="size-4" />
        </a>
        <Button variant="secondary" onClick={onRetry}>
          <RefreshCw className="size-4" /> Já rodei
        </Button>
      </div>
      {error.detail ? <p className="font-mono text-xs opacity-70">Detalhe técnico: {error.detail}</p> : null}
    </SetupLayout>
  );
}

/** Qualquer outra falha ao carregar os dados. */
export function LoadErrorScreen({ error, onRetry }: { error: AppError; onRetry: () => void }) {
  return (
    <SetupLayout icon={<TriangleAlert />} title="Não consegui carregar seus dados">
      <p>{error.message}</p>
      <div className="flex flex-col gap-2 pt-1 sm:flex-row">
        <Button variant="primary" onClick={onRetry}>
          <RefreshCw className="size-4" /> Tentar de novo
        </Button>
        <Button variant="secondary" onClick={() => void signOut()}>
          Sair da conta
        </Button>
      </div>
      {error.detail && error.detail !== error.message ? (
        <p className="font-mono text-xs opacity-70">Detalhe técnico: {error.detail}</p>
      ) : null}
    </SetupLayout>
  );
}
