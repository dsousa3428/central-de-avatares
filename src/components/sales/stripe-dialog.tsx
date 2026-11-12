"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CircleCheck, FlaskConical, KeyRound, TriangleAlert } from "lucide-react";
import { todayISO } from "@/lib/dates";
import { errorMessage } from "@/lib/errors";
import { formatMoney, plural, prettyUrl } from "@/lib/format";
import { addWeeks, cleanRates, weekLabel, weekStart, weekTitle } from "@/lib/sales";
import { getStore, refresh, useStore } from "@/lib/store";
import {
  applyStripePlan,
  fetchStripeLinks,
  fetchStripeSales,
  matchStripeLinks,
  StripeError,
  zeroCandidates,
  type ApplyResult,
  type StripeAccount,
  type StripeProblem,
} from "@/lib/stripe-actions";
import {
  buildPlan,
  matchLinks,
  weeklyFromStripe,
  type LinkMatching,
  type MoneyPart,
  type Plan,
  type PlanRow,
} from "@/lib/stripe-sync";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";

type Step =
  | { name: "loading" }
  | { name: "problem"; problem: StripeProblem }
  | { name: "ready" }
  | { name: "fetching"; done: number; total: number }
  | { name: "preview"; plan: Plan }
  | { name: "applying"; done: number; total: number }
  | { name: "result"; result: ApplyResult };

const PERIODS: Array<{ value: string; label: string }> = [
  { value: "2", label: "Esta semana e a passada" },
  { value: "4", label: "Últimas 4 semanas" },
  { value: "12", label: "Últimas 12 semanas" },
  { value: "26", label: "Últimos 6 meses" },
  { value: "52", label: "Último ano" },
];

function problemOf(err: unknown): StripeProblem {
  return err instanceof StripeError ? err.problem : { kind: "unknown", detail: errorMessage(err) };
}

function money(part: MoneyPart): string {
  return `${formatMoney(part.amount, part.currency)} · ${plural(part.count, "venda", "vendas")}`;
}

/**
 * Vendas pela Stripe: confere a ligação, mostra de que avatar é cada link de
 * pagamento, busca as vendas do período e — só depois de o dono ver o que muda —
 * grava nos lançamentos semanais.
 */
export function StripeDialog({ onClose }: { onClose: () => void }) {
  const db = useStore();
  const toast = useToast();
  const [account, setAccount] = useState<StripeAccount | null>(null);
  const [step, setStep] = useState<Step>({ name: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [weeks, setWeeks] = useState("4");
  // as linhas que o dono desmarcou na conferência (as outras são gravadas)
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(new Set());
  // janela fechada no meio de uma busca: os pedidos que ainda faltavam não são feitos
  const cancel = useRef({ cancelled: false });
  useEffect(() => {
    const flag = cancel.current;
    flag.cancelled = false;
    return () => {
      flag.cancelled = true;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    fetchStripeLinks().then(
      (loaded) => {
        if (!alive) return;
        setAccount(loaded);
        setStep({ name: "ready" });
      },
      (err) => {
        if (alive) setStep({ name: "problem", problem: problemOf(err) });
      },
    );
    return () => {
      alive = false;
    };
  }, [attempt]);

  function retry() {
    setStep({ name: "loading" });
    setAttempt((n) => n + 1);
  }

  const matching = useMemo(() => (account ? matchLinks(db.avatars, account.links) : null), [account, db.avatars]);
  const nameOf = (avatarId: string) => {
    const avatar = db.avatars.find((item) => item.id === avatarId);
    if (!avatar) return "Avatar apagado";
    const flag = db.countries.find((country) => country.id === avatar.country_id)?.flag;
    return `${flag ? `${flag} ` : ""}${avatar.name}`;
  };

  async function search() {
    if (!account) return;
    const thisWeek = weekStart(todayISO());
    const count = Number(weeks);
    // (lido de novo na hora: um link pode ter acabado de ser cadastrado em outra aba)
    const current = matchStripeLinks(account.links);
    const linkIds = [...current.owner.keys()];
    setStep({ name: "fetching", done: 0, total: linkIds.length });
    try {
      const [sales] = await Promise.all([
        fetchStripeSales(
          linkIds,
          addWeeks(thisWeek, 1 - count),
          (done, total) => setStep((now) => (now.name === "fetching" ? { name: "fetching", done, total } : now)),
          cancel.current,
        ),
        // os lançamentos do painel também são lidos de novo: a comparação é com o que está no banco agora
        refresh().catch(() => undefined),
      ]);
      const store = getStore();
      const plan = buildPlan({
        weeks: weeklyFromStripe(sales, current.owner),
        sales: store.sales,
        rates: cleanRates(store.settings?.brl_rates),
        zeros: count >= 2 ? zeroCandidates(current, addWeeks(thisWeek, -1)) : [],
      });
      setSkipped(new Set());
      setStep({ name: "preview", plan });
    } catch (err) {
      setStep({ name: "problem", problem: problemOf(err) });
    }
  }

  async function apply(plan: Plan) {
    const rows = plan.rows.filter((row) => !skipped.has(row.key));
    if (rows.length === 0) return;
    setStep({ name: "applying", done: 0, total: rows.length });
    const result = await applyStripePlan(rows, (done, total) => setStep({ name: "applying", done, total }));
    if (result.failed.length === 0) {
      toast.success(`${plural(result.saved, "lançamento atualizado", "lançamentos atualizados")} pela Stripe`);
      onClose();
    } else {
      setStep({ name: "result", result });
    }
  }

  function toggle(key: string) {
    setSkipped((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }

  const busy = step.name === "fetching" || step.name === "applying";
  const chosen = step.name === "preview" ? step.plan.rows.filter((row) => !skipped.has(row.key)).length : 0;
  const linked = matching ? matching.byAvatar.size : 0;

  let footer: React.ReactNode;
  if (step.name === "problem") {
    footer = (
      <>
        <Button onClick={onClose}>Fechar</Button>
        <Button variant="primary" onClick={retry}>
          Tentar de novo
        </Button>
      </>
    );
  } else if (step.name === "ready") {
    footer = (
      <>
        <Button onClick={onClose}>Fechar</Button>
        <Button variant="primary" onClick={() => void search()} disabled={linked === 0}>
          Buscar vendas
        </Button>
      </>
    );
  } else if (step.name === "preview") {
    footer =
      step.plan.rows.length === 0 ? (
        <Button variant="primary" onClick={onClose}>
          Fechar
        </Button>
      ) : (
        <>
          <Button onClick={() => setStep({ name: "ready" })}>Voltar</Button>
          <Button variant="primary" onClick={() => void apply(step.plan)} disabled={chosen === 0}>
            {chosen === 0 ? "Lançar" : `Lançar ${chosen}`}
          </Button>
        </>
      );
  } else if (step.name === "result") {
    footer = (
      <Button variant="primary" onClick={onClose}>
        Fechar
      </Button>
    );
  } else {
    footer = (
      <Button onClick={onClose} disabled={step.name === "applying"}>
        Fechar
      </Button>
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      canClose={step.name !== "applying"}
      closeOnBackdrop={!busy && step.name !== "preview"}
      title="Vendas pela Stripe"
      description="O painel busca na Stripe as vendas de cada link de pagamento e lança na semana certa do avatar."
      size="lg"
      footer={footer}
    >
      {step.name === "loading" ? (
        <Waiting text="Conferindo a ligação com a Stripe…" />
      ) : step.name === "problem" ? (
        <Problem problem={step.problem} />
      ) : step.name === "fetching" ? (
        <Waiting
          text={
            step.total > 1
              ? `Buscando as vendas na Stripe… ${step.done} de ${step.total} links`
              : "Buscando as vendas na Stripe…"
          }
        />
      ) : step.name === "applying" ? (
        <Waiting text={`Gravando… ${step.done} de ${step.total}`} />
      ) : step.name === "result" ? (
        <div className="space-y-3">
          {step.result.saved > 0 ? (
            <p className="text-[15px]">
              {plural(step.result.saved, "lançamento foi atualizado", "lançamentos foram atualizados")}.
            </p>
          ) : null}
          <Callout tone="danger" icon={<TriangleAlert />}>
            <p className="font-medium">
              {plural(step.result.failed.length, "lançamento não foi gravado", "lançamentos não foram gravados")}:
            </p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {step.result.failed.map(({ row, message }) => (
                <li key={row.key}>
                  {nameOf(row.avatarId)}, semana de {weekLabel(row.week, todayISO())}: {message}
                </li>
              ))}
            </ul>
            <p className="mt-2">Feche e toque em Stripe de novo para repetir só o que faltou.</p>
          </Callout>
        </div>
      ) : account && matching ? (
        <div className="space-y-4">
          {!account.live ? (
            <Callout tone="warn" icon={<FlaskConical />}>
              A chave guardada na Vercel é de <strong>teste</strong>: os números abaixo são vendas de teste da Stripe,
              não de clientes de verdade.
            </Callout>
          ) : null}

          {!account.restricted ? (
            <Callout tone="warn" icon={<KeyRound />}>
              A chave guardada na Vercel é a chave secreta <strong>completa</strong> (começa com sk_). Funciona, mas ela
              dá acesso total à sua conta Stripe. O recomendado é trocá-la por uma <strong>chave restrita</strong>{" "}
              (rk_), só com leitura de Checkout Sessions e Payment Links.
            </Callout>
          ) : null}

          {step.name === "ready" ? (
            <>
              <Links
                matching={matching}
                nameOf={nameOf}
                unlinked={db.avatars.filter((avatar) => !matching.byAvatar.has(avatar.id)).map((avatar) => avatar.name)}
                total={account.links.length}
              />
              {linked > 0 ? (
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium">Buscar as vendas de</span>
                  <Select value={weeks} onChange={(event) => setWeeks(event.target.value)}>
                    {PERIODS.map((period) => (
                      <option key={period.value} value={period.value}>
                        {period.label}
                      </option>
                    ))}
                  </Select>
                </label>
              ) : null}
              <p className="text-xs leading-relaxed text-muted">
                Entram as vendas pagas, pelo valor cobrado do cliente (reembolsos não são descontados). A semana é a do
                horário deste aparelho. Antes de gravar, o painel mostra o que vai mudar.
              </p>
            </>
          ) : (
            <Preview plan={step.plan} skipped={skipped} onToggle={toggle} nameOf={nameOf} />
          )}
        </div>
      ) : null}
    </Modal>
  );
}

function Waiting({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-3 py-6" role="status">
      <Spinner className="text-primary" />
      <p className="text-[15px] text-muted">{text}</p>
    </div>
  );
}

/** De que avatar é cada link de pagamento — e o que ficou sem dono. */
function Links({
  matching,
  nameOf,
  unlinked,
  total,
}: {
  matching: LinkMatching;
  nameOf: (avatarId: string) => string;
  unlinked: string[];
  total: number;
}) {
  const linked = [...matching.byAvatar.entries()];
  return (
    <div className="space-y-3">
      {linked.length === 0 ? (
        <Callout tone="info">
          <p className="font-medium">Nenhum avatar está ligado a um link da Stripe ainda.</p>
          <p className="mt-1">
            Abra o avatar → aba <strong>Links</strong> → <strong>Editar</strong> e cole no campo{" "}
            <strong>Checkout</strong> o link de pagamento da Stripe (começa com buy.stripe.com/). Depois volte aqui.
          </p>
          <p className="mt-1">
            {total === 0
              ? "A sua conta Stripe ainda não tem nenhum link de pagamento."
              : `A sua conta Stripe tem ${plural(total, "link de pagamento", "links de pagamento")}.`}
          </p>
        </Callout>
      ) : (
        <div>
          <h3 className="text-sm font-semibold">Avatares ligados</h3>
          <ul className="mt-1 divide-y divide-line">
            {linked.map(([avatarId, links]) => (
              <li key={avatarId} className="py-2">
                <p className="text-[15px] font-medium">{nameOf(avatarId)}</p>
                {links.map((link) => (
                  <p key={link.id} className="text-sm text-muted">
                    {prettyUrl(link.url)}
                    {link.active ? null : (
                      <Badge tone="gray" className="ml-2">
                        desativado
                      </Badge>
                    )}
                  </p>
                ))}
              </li>
            ))}
          </ul>
        </div>
      )}

      {matching.shared.map(({ link, avatarIds }) => (
        <Callout key={link.id} tone="warn" icon={<TriangleAlert />}>
          O link <strong>{prettyUrl(link.url)}</strong> está em mais de um avatar ({avatarIds.map(nameOf).join(", ")}). O
          painel não tem como dividir as vendas: deixe o link em um avatar só.
        </Callout>
      ))}

      {linked.length > 0 && unlinked.length > 0 ? (
        <p className="text-sm leading-relaxed text-muted">
          Sem link da Stripe: {unlinked.join(", ")}. Para ligar, cole o link de pagamento no campo Checkout do avatar
          (aba Links).
        </p>
      ) : null}

      {matching.unused.length > 0 ? (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted">
            {plural(matching.unused.length, "link da Stripe sem avatar", "links da Stripe sem avatar")}
          </summary>
          <ul className="mt-1 space-y-1 pl-4">
            {matching.unused.map((link) => (
              <li key={link.id} className="flex items-center gap-1 text-muted">
                <span className="min-w-0 flex-1">
                  {prettyUrl(link.url)}
                  {link.active ? "" : " (desativado)"}
                </span>
                <CopyButton text={link.url} message="Link copiado" />
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

/** A conferência: o que muda em cada semana, com uma caixa para deixar de fora o que não deve ser gravado. */
function Preview({
  plan,
  skipped,
  onToggle,
  nameOf,
}: {
  plan: Plan;
  skipped: ReadonlySet<string>;
  onToggle: (key: string) => void;
  nameOf: (avatarId: string) => string;
}) {
  const today = todayISO();
  // vendas em outra moeda que continuam de fora por falta de cotação (em semanas onde não há mais nada a gravar)
  const leftOut =
    plan.incomplete.length > 0 ? (
      <Callout tone="warn" icon={<TriangleAlert />}>
        <p className="font-medium">Vendas que continuam de fora, por falta de cotação:</p>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          {plan.incomplete.map((item) => (
            <li key={item.key}>
              {nameOf(item.avatarId)}, semana de {weekLabel(item.week, today)}: {item.left.map(money).join(" e ")}
            </li>
          ))}
        </ul>
        <p className="mt-2">
          O painel guarda uma moeda por semana. Digite as cotações em Vendas → Cotações e atualize de novo para somar
          tudo.
        </p>
      </Callout>
    ) : null;
  if (plan.rows.length === 0) {
    if (leftOut) {
      return (
        <div className="space-y-3">
          <p className="text-[15px]">Nenhum lançamento para atualizar.</p>
          {leftOut}
        </div>
      );
    }
    return (
      <Callout tone="info" icon={<CircleCheck />}>
        <p className="font-medium">Tudo em dia.</p>
        <p className="mt-1">
          {plan.same > 0
            ? `As vendas da Stripe neste período já estão lançadas no painel (${plural(plan.same, "lançamento conferido", "lançamentos conferidos")}).`
            : "A Stripe não tem vendas pagas destes links neste período."}
        </p>
      </Callout>
    );
  }
  const weeks = [...new Set(plan.rows.map((row) => row.week))];
  return (
    <div className="space-y-4">
      <p className="text-[15px]">
        {plural(plan.rows.length, "lançamento para atualizar", "lançamentos para atualizar")}. Desmarque o que não deve
        ser gravado.
      </p>
      {weeks.map((week) => (
        <section key={week}>
          <h3 className="text-sm font-semibold">
            {weekTitle(week, today)}
            {weekTitle(week, today).startsWith("Semana de") ? null : (
              <span className="font-normal text-muted"> · {weekLabel(week, today)}</span>
            )}
          </h3>
          <ul className="mt-1 divide-y divide-line">
            {plan.rows
              .filter((row) => row.week === week)
              .sort((a, b) => nameOf(a.avatarId).localeCompare(nameOf(b.avatarId), "pt-BR"))
              .map((row) => (
                <li key={row.key}>
                  <label className="flex cursor-pointer items-start gap-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={!skipped.has(row.key)}
                      onChange={() => onToggle(row.key)}
                      className="mt-0.5 size-5 shrink-0 accent-[var(--primary)]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="text-[15px] font-medium">{nameOf(row.avatarId)}</span>
                      <RowText row={row} />
                    </span>
                  </label>
                </li>
              ))}
          </ul>
        </section>
      ))}
      {plan.same > 0 ? (
        <p className="text-sm text-muted">
          {plural(plan.same, "outro lançamento já estava igual", "outros lançamentos já estavam iguais")} ao da Stripe.
        </p>
      ) : null}
      {leftOut}
    </div>
  );
}

function RowText({ row }: { row: PlanRow }) {
  return (
    <>
      <span className="block text-sm text-muted">
        {row.kind === "zero" ? (
          <>Nenhuma venda na Stripe: lança {formatMoney(0, row.next.currency)}.</>
        ) : row.current ? (
          <>
            No painel: {formatMoney(row.current.amount, row.current.currency)}
            {row.current.count === null ? "" : ` · ${plural(row.current.count, "venda", "vendas")}`}
            {" → "}
            <strong className="font-semibold text-fg">{money(row.next)}</strong>
          </>
        ) : (
          <>
            Novo: <strong className="font-semibold text-fg">{money(row.next)}</strong>
          </>
        )}
      </span>
      {row.converted ? (
        <span className="block text-xs text-muted">
          Vendas em mais de uma moeda, somadas pelas cotações do painel.
        </span>
      ) : null}
      {row.left.length > 0 ? (
        <span className="mt-1 block text-xs font-medium text-amber-700 dark:text-amber-300">
          Ficou de fora: {row.left.map(money).join(" e ")}. O painel guarda uma moeda por semana — digite a cotação de{" "}
          {[row.next.currency, ...row.left.map((part) => part.currency)].filter((code) => code !== "BRL").join(" e ")} em
          Vendas → Cotações e atualize de novo para somar tudo.
        </span>
      ) : null}
    </>
  );
}

/** Por que a ligação não funcionou — e o que fazer. */
function Problem({ problem }: { problem: StripeProblem }) {
  if (problem.kind === "not_configured") return <StripeSetup problem={problem.problem} />;
  let title: string;
  let text: React.ReactNode;
  let detail = "";
  if (problem.kind === "signup_open") {
    title = "O cadastro público do Supabase está ligado";
    text = (
      <>
        Por segurança, o painel só usa a chave da Stripe quando ninguém mais consegue criar conta nele. No Supabase:{" "}
        <strong>Authentication → Sign In / Providers</strong> → desligue <strong>Allow new users to sign up</strong> →{" "}
        <strong>Save</strong>. Depois toque em Tentar de novo.
      </>
    );
  } else if (problem.kind === "stripe") {
    // (o que a Stripe respondeu ajuda a entender uma recusa; em "não respondeu" e "pedidos demais" não há o que acrescentar)
    if (problem.error !== "unavailable" && problem.error !== "rate") detail = problem.detail;
    if (problem.error === "key") {
      title = "A Stripe recusou a chave";
      text = (
        <>
          A chave pode ter sido apagada na Stripe ou copiada pela metade. Crie outra chave restrita, troque o valor de{" "}
          <strong>STRIPE_SECRET_KEY</strong> na Vercel e faça um <strong>Redeploy</strong>.
        </>
      );
    } else if (problem.error === "permission") {
      title = "A chave não tem permissão para ler as vendas";
      text = (
        <>
          Na Stripe, edite a chave restrita e deixe em <strong>Leitura</strong> as permissões{" "}
          <strong>Checkout Sessions</strong> e <strong>Payment Links</strong>. Depois toque em Tentar de novo.
        </>
      );
    } else if (problem.error === "rate") {
      title = "Muitos pedidos seguidos";
      text = "A Stripe pediu um intervalo. Espere um minuto e tente de novo.";
    } else if (problem.error === "unavailable") {
      title = "A Stripe não respondeu";
      text = "Pode ser uma instabilidade passageira. Tente de novo em instantes.";
    } else {
      title = "A Stripe recusou o pedido";
      text = "Tente de novo. Se continuar, tire um print desta tela para pedir ajuda.";
    }
  } else if (problem.kind === "supabase") {
    title = "Não consegui conferir o seu login";
    text = "O Supabase não respondeu agora. Tente de novo em instantes.";
  } else if (problem.kind === "forbidden") {
    title = "Este login não pode usar a Stripe do painel";
    text = (
      <>
        A ligação com a Stripe está reservada a outro e-mail (variável <strong>STRIPE_OWNER_EMAIL</strong>, na Vercel).
        Entre com o e-mail do dono do painel, ou corrija a variável e faça um Redeploy.
      </>
    );
  } else if (problem.kind === "auth") {
    title = "Sua sessão expirou";
    text = "Saia e entre de novo no painel, e então volte aqui.";
  } else if (problem.kind === "offline") {
    title = "Sem conexão";
    text = "Confira a internet e tente de novo.";
  } else {
    title = "A ligação com a Stripe não respondeu como esperado";
    text = "Tente de novo. Se continuar, tire um print desta tela para pedir ajuda.";
    detail = problem.detail;
  }
  return (
    <Callout tone={problem.kind === "signup_open" ? "warn" : "danger"} icon={<TriangleAlert />}>
      <p className="font-medium">{title}</p>
      <p className="mt-1">{text}</p>
      {detail ? <p className="mt-2 text-xs opacity-80">Detalhe: {detail}</p> : null}
    </Callout>
  );
}

const KEY_PROBLEM_TEXT: Record<"publishable" | "format" | "exposed", React.ReactNode> = {
  publishable: (
    <>
      A variável <strong>STRIPE_SECRET_KEY</strong> está com a chave <em>publicável</em> (começa com pk_). O painel
      precisa da chave <strong>restrita</strong> (começa com rk_). Refaça os passos abaixo.
    </>
  ),
  format: (
    <>
      O valor de <strong>STRIPE_SECRET_KEY</strong> não parece uma chave da Stripe (ela começa com rk_live_). Confira se
      a chave foi copiada inteira, sem espaços, e refaça os passos 3 e 4.
    </>
  ),
  exposed: (
    <>
      Há uma chave secreta da Stripe numa variável cujo nome começa com <strong>NEXT_PUBLIC_</strong> — essas variáveis
      são públicas. Apague essa variável na Vercel, apague essa chave na Stripe (ela não é mais segura) e crie outra,
      seguindo os passos abaixo.
    </>
  ),
};

/** O passo a passo para ligar o painel à Stripe (uma vez só). */
export function StripeSetup({ problem }: { problem: "missing" | "publishable" | "format" | "exposed" }) {
  return (
    <div className="space-y-4">
      {problem === "missing" ? (
        <Callout tone="info">
          <p className="font-medium">Falta ligar o painel à sua conta Stripe.</p>
          <p className="mt-1">É uma vez só e leva uns 5 minutos. É mais fácil fazer no computador.</p>
        </Callout>
      ) : (
        <Callout tone="danger" icon={<TriangleAlert />}>
          {KEY_PROBLEM_TEXT[problem]}
        </Callout>
      )}
      <ol className="list-decimal space-y-3 pl-5 text-[15px] leading-relaxed marker:font-semibold">
        <li>
          Na <strong>Stripe</strong>, abra <strong>Desenvolvedores → Chaves da API</strong> e clique em{" "}
          <strong>Criar chave restrita</strong>.
        </li>
        <li>
          Dê o nome <strong>Central de Avatares</strong>. Nas permissões, deixe tudo em <strong>Nenhuma</strong>, menos
          duas, que ficam em <strong>Leitura</strong>: <strong>Checkout Sessions</strong> e{" "}
          <strong>Payment Links</strong>. Crie a chave e copie o valor (começa com <strong>rk_live_</strong>).
        </li>
        <li>
          Na <strong>Vercel</strong>, abra o projeto do painel → <strong>Settings → Environment Variables</strong> e crie
          uma variável com este nome:
          <span className="mt-1.5 flex flex-wrap items-center gap-2">
            <code className="whitespace-nowrap rounded-md border border-line bg-surface-2 px-2 py-1 text-sm">
              STRIPE_SECRET_KEY
            </code>
            <CopyButton text="STRIPE_SECRET_KEY" message="Nome copiado" label="Copiar nome" variant="secondary" />
          </span>
          <span className="mt-1.5 block">
            No valor, cole a chave da Stripe. Clique em <strong>Save</strong>.
          </span>
        </li>
        <li>
          Ainda na Vercel: <strong>Deployments</strong> → nos três pontinhos da publicação mais recente →{" "}
          <strong>Redeploy</strong>. Espere terminar.
        </li>
        <li>
          Volte aqui e toque em <strong>Tentar de novo</strong>.
        </li>
      </ol>
      <p className="text-sm leading-relaxed text-muted">
        A chave fica guardada só na Vercel — nunca no código do painel nem no seu navegador. Ela só permite{" "}
        <strong>ler</strong> vendas e links de pagamento: não movimenta dinheiro nem altera nada na sua conta Stripe.
        Não mande a chave para ninguém.
      </p>
    </div>
  );
}
