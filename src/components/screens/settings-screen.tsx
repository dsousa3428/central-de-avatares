"use client";

import { useState } from "react";
import { LogOut, Monitor, Moon, ShieldCheck, Sparkles, Sun, Trash2 } from "lucide-react";
import { signOut, useAuth } from "@/lib/auth";
import { countExamples, deleteExamples, EXAMPLES_VERSION, seedExamples } from "@/lib/examples";
import { plural } from "@/lib/format";
import { refresh, saveSettings, useStore } from "@/lib/store";
import { setThemeChoice, useThemeChoice, type ThemeChoice } from "@/lib/theme";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm";
import { Segmented } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";

const UPCOMING: Array<{ step: string; title: string; text: string }> = [
  { step: "b", title: "Aquecimento + tela Hoje", text: "Calendário de 10 dias por conta, minutos de cada dia, botão “feito” e data de fim calculada." },
  { step: "c", title: "Cofre de senhas", text: "Senhas e códigos de backup criptografados no seu aparelho com uma senha-mestra." },
  { step: "d", title: "Vendas", text: "Lançamento semanal, totais, gráfico, ranking e conversão para reais." },
  { step: "e", title: "“Conta caiu” + avisos", text: "Assistente de reposição com checklist e avisos automáticos de risco." },
  { step: "f", title: "App instalável + backup", text: "Instalar no celular, exportar/importar tudo, busca global." },
];

export function SettingsScreen() {
  const auth = useAuth();
  const db = useStore();
  const toast = useToast();
  const confirm = useConfirm();
  const theme = useThemeChoice();
  const [busy, setBusy] = useState<"delete" | "seed" | null>(null);

  const examples = countExamples(db);
  const summary = [
    examples.countries ? plural(examples.countries, "país", "países") : null,
    examples.avatars ? plural(examples.avatars, "avatar", "avatares") : null,
    examples.accounts ? plural(examples.accounts, "conta", "contas") : null,
    examples.phones ? plural(examples.phones, "celular", "celulares") : null,
    examples.profiles ? plural(examples.profiles, "perfil anti-detect", "perfis anti-detect") : null,
  ].filter(Boolean);

  async function removeExamples() {
    const ok = await confirm({
      title: "Apagar os dados de exemplo?",
      message: (
        <>
          <p>
            Serão apagados: <strong>{summary.join(", ")}</strong> — e tudo que pertence a eles (histórico, links, kit).
          </p>
          <p className="mt-2">
            O que você mesmo cadastrou continua intacto. Se você colocou algo seu dentro de um exemplo, esse exemplo é
            mantido e apenas deixa de ser marcado como exemplo.
          </p>
        </>
      ),
      confirmLabel: "Apagar exemplos",
      tone: "danger",
    });
    if (!ok) return;
    setBusy("delete");
    try {
      await deleteExamples();
      await refresh();
      toast.success("Exemplos apagados");
    } catch (err) {
      toast.error(err);
      void refresh();
    } finally {
      setBusy(null);
    }
  }

  async function recreateExamples() {
    setBusy("seed");
    try {
      await seedExamples();
      await saveSettings({ prefs: { ...(db.settings?.prefs ?? {}), examples_version: EXAMPLES_VERSION } });
      await refresh();
      toast.success("Exemplos criados");
    } catch (err) {
      toast.error(err);
      void refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader title="Configurações" />

      <div className="space-y-4">
        <Section title="Aparência" subtitle="Modo claro, escuro ou igual ao do seu aparelho.">
          <Segmented<ThemeChoice>
            ariaLabel="Tema"
            value={theme}
            onChange={setThemeChoice}
            items={[
              {
                value: "system",
                label: (
                  <>
                    <Monitor className="size-4" /> Sistema
                  </>
                ),
              },
              {
                value: "light",
                label: (
                  <>
                    <Sun className="size-4" /> Claro
                  </>
                ),
              },
              {
                value: "dark",
                label: (
                  <>
                    <Moon className="size-4" /> Escuro
                  </>
                ),
              },
            ]}
          />
        </Section>

        <div id="exemplos" className="scroll-mt-6">
          <Section title="Dados de exemplo" subtitle="Itália e Fra' Salvio, com dados fictícios, para conhecer o painel.">
            {examples.total > 0 ? (
              <>
                <p className="text-[15px] leading-relaxed">
                  Há exemplos no painel: <strong>{summary.join(", ")}</strong>.
                </p>
                <Button
                  variant="secondary"
                  className="mt-3 text-danger"
                  onClick={removeExamples}
                  loading={busy === "delete"}
                  disabled={busy !== null}
                >
                  <Trash2 className="size-4" /> Apagar exemplos
                </Button>
              </>
            ) : (
              <>
                <p className="text-[15px] leading-relaxed text-muted">Não há dados de exemplo no painel.</p>
                <Button
                  variant="secondary"
                  className="mt-3"
                  onClick={recreateExamples}
                  loading={busy === "seed"}
                  disabled={busy !== null}
                >
                  <Sparkles className="size-4" /> Criar exemplos de novo
                </Button>
              </>
            )}
          </Section>
        </div>

        <Section title="Sua conta">
          <p className="text-[15px]">
            Você entrou como <strong className="break-all">{auth.status === "signed_in" ? auth.email : "—"}</strong>
          </p>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            Sair desconecta só este aparelho. Para trocar a senha de login, use o painel do Supabase (Authentication →
            Users).
          </p>
          <Button variant="secondary" className="mt-3" onClick={() => void signOut()}>
            <LogOut className="size-4" /> Sair
          </Button>
        </Section>

        <Section title="Próximas etapas" subtitle="O que ainda vai entrar no painel, nesta ordem.">
          <ol className="divide-y divide-line">
            {UPCOMING.map((item) => (
              <li key={item.step} className="flex gap-3 py-2.5">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-sm font-semibold text-muted">
                  {item.step}
                </span>
                <div className="min-w-0">
                  <p className="text-[15px] font-medium">{item.title}</p>
                  <p className="text-sm leading-relaxed text-muted">{item.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </Section>

        <p className="flex items-start gap-2 px-1 text-xs leading-relaxed text-muted">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Este painel é só de organização: ele não acessa o Instagram, não automatiza nada e não faz login em conta
          nenhuma. Seus dados ficam no seu Supabase, visíveis apenas com o seu login.
        </p>
      </div>
    </>
  );
}
