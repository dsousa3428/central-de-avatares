"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Fingerprint, Smartphone, Table2, TrendingUp, UserRound } from "lucide-react";
import { changeAccountStatus } from "@/lib/account-actions";
import { formatDate, isValidISODate, todayISO } from "@/lib/dates";
import { clean, formatMoney, formatNumber, normalizeHandle, parseCount, parseDecimal, prettyUrl } from "@/lib/format";
import { cleanRates, inBRL, weekLabel } from "@/lib/sales";
import { patchSale } from "@/lib/sales-actions";
import {
  accountsOf,
  currentAccount,
  describeAccount,
  generationLabel,
  isWarmupRunning,
  lifetimeDays,
  usageByPhone,
  usageByProfile,
  warmupOf,
  type Usage,
} from "@/lib/selectors";
import { updateRow, useStore, type Db } from "@/lib/store";
import { pendingLabels, structureProgress } from "@/lib/structure";
import type {
  Account,
  AccountStatus,
  AntidetectProfile,
  Avatar,
  AvatarStatus,
  Country,
  Phone,
  WeeklySale,
} from "@/lib/types";
import { warmupInfo, warmupShortLabel } from "@/lib/warmup";
import { AccountForm } from "@/components/avatar/account-form";
import { ExternalLinkText } from "@/components/common/detail-row";
import { invalid } from "@/components/common/validation";
import { PageHeader } from "@/components/shell/page-header";
import { DataGrid, type GridColumn, type GridOption } from "@/components/sheet/data-grid";
import { ACCOUNT_STATUS, AVATAR_STATUS, AccountStatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/card";
import { Select } from "@/components/ui/field";
import { Tabs } from "@/components/ui/tabs";

type SheetName = "contas" | "avatares" | "vendas" | "celulares" | "perfis";

const STATUS_ORDER: AccountStatus[] = ["aquecendo", "ativa", "restrita", "caida"];
const STATUS_DOT: Record<AccountStatus, string> = {
  aquecendo: "bg-amber-500",
  ativa: "bg-emerald-500",
  restrita: "bg-orange-500",
  caida: "bg-red-500",
};
const NO_USAGE: Usage = { live: [], fallen: [] };
const quick = { optimistic: true } as const;

/** Tela "Planilha": os mesmos dados do painel, em formato de tabela. */
export function SheetScreen() {
  const db = useStore();
  const [sheet, setSheet] = useState<SheetName>("contas");

  return (
    <>
      <PageHeader title="Planilha" subtitle="Tudo em tabela: ordene, filtre, edite direto nas células e exporte." />
      <Tabs
        ariaLabel="Tabelas"
        value={sheet}
        onChange={setSheet}
        className="mb-4"
        items={[
          { value: "contas", label: "Contas", count: db.accounts.length },
          { value: "avatares", label: "Avatares", count: db.avatars.length },
          { value: "vendas", label: "Vendas", count: db.sales.length },
          { value: "celulares", label: "Celulares", count: db.phones.length },
          { value: "perfis", label: "Perfis anti-detect", count: db.profiles.length },
        ]}
      />
      {sheet === "contas" ? <AccountsSheet db={db} /> : null}
      {sheet === "avatares" ? <AvatarsSheet db={db} /> : null}
      {sheet === "vendas" ? <SalesSheet db={db} /> : null}
      {sheet === "celulares" ? <PhonesSheet db={db} /> : null}
      {sheet === "perfis" ? <ProfilesSheet db={db} /> : null}
    </>
  );
}

function AvatarLink({ avatar, country, tab }: { avatar: Avatar; country?: Country; tab?: string }) {
  return (
    <Link
      href={`/avatar?id=${avatar.id}${tab ? `&aba=${tab}` : ""}`}
      className="text-primary underline-offset-2 hover:underline"
    >
      {country?.flag ? `${country.flag} ` : ""}
      {avatar.name}
    </Link>
  );
}

function usageText(db: Db, accounts: Account[]): string {
  return accounts.map((a) => describeAccount(db, a)).join("; ");
}

function situation(usage: Usage): string {
  if (usage.live.length > 1) return `Em uso por ${usage.live.length} contas`;
  if (usage.live.length === 1) return "Em uso";
  return "Livre";
}

/** Caixa de seleção compacta para os filtros acima da grade. */
function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: GridOption[];
}) {
  return (
    <span className="min-w-[9.5rem] flex-1 md:w-44 md:flex-none">
      <Select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} className="h-10 md:text-sm">
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Contas
// ---------------------------------------------------------------------------

interface AccountRow {
  account: Account;
  avatar: Avatar | undefined;
  country: Country | undefined;
  phone: Phone | undefined;
  profile: AntidetectProfile | undefined;
  warmup: string;
  life: number | null;
  isCurrent: boolean;
}

function AccountsSheet({ db }: { db: Db }) {
  const [country, setCountry] = useState("");
  const [status, setStatus] = useState("");
  const [onlyCurrent, setOnlyCurrent] = useState(false);
  const [falling, setFalling] = useState<{ account: Account; avatar: Avatar } | null>(null);

  const rows = useMemo<AccountRow[]>(() => {
    const today = todayISO();
    const currentIds = new Set(
      db.avatars.map((avatar) => currentAccount(accountsOf(db, avatar.id))?.id).filter(Boolean) as string[],
    );
    return db.accounts
      .map((account) => {
        const avatar = db.avatars.find((a) => a.id === account.avatar_id);
        const warmup = warmupOf(db, account.id);
        return {
          account,
          avatar,
          country: avatar ? db.countries.find((c) => c.id === avatar.country_id) : undefined,
          phone: db.phones.find((p) => p.id === account.phone_id),
          profile: db.profiles.find((p) => p.id === account.profile_id),
          warmup: warmup && isWarmupRunning(account, warmup) ? warmupShortLabel(warmupInfo(warmup, today)) : "",
          life: lifetimeDays(account, today),
          isCurrent: currentIds.has(account.id),
        };
      })
      .filter((row) => {
        if (country && row.country?.id !== country) return false;
        if (status === "vivas" && row.account.status === "caida") return false;
        if (status && status !== "vivas" && row.account.status !== status) return false;
        if (onlyCurrent && !row.isCurrent) return false;
        return true;
      })
      .sort(
        (a, b) =>
          (a.country?.name ?? "").localeCompare(b.country?.name ?? "", "pt-BR") ||
          (a.avatar?.name ?? "").localeCompare(b.avatar?.name ?? "", "pt-BR") ||
          b.account.generation - a.account.generation,
      );
  }, [db, country, status, onlyCurrent]);

  const columns = useMemo<GridColumn<AccountRow>[]>(() => {
    const phoneOptions: GridOption[] = [
      { value: "", label: "—" },
      ...db.phones.map((p) => ({ value: p.id, label: p.nickname })),
    ];
    const profileOptions: GridOption[] = [
      { value: "", label: "—" },
      ...db.profiles.map((p) => ({ value: p.id, label: `Perfil ${p.number}` })),
    ];
    const statusOptions: GridOption[] = STATUS_ORDER.map((s) => ({ value: s, label: ACCOUNT_STATUS[s].label }));

    return [
      {
        key: "avatar",
        header: "Avatar",
        width: "min-w-36",
        text: (r) => r.avatar?.name ?? "",
        render: (r) => (r.avatar ? <AvatarLink avatar={r.avatar} country={r.country} tab="conta" /> : "—"),
      },
      { key: "pais", header: "País", text: (r) => r.country?.name ?? "" },
      {
        key: "conta",
        header: "Conta (@)",
        text: (r) => r.account.handle,
        render: (r) => `@${r.account.handle}`,
        edit: {
          type: "text",
          value: (r) => r.account.handle,
          save: async (r, value) => {
            const handle = normalizeHandle(value);
            if (!handle) invalid("O @ da conta não pode ficar vazio.");
            await updateRow("accounts", r.account.id, { handle }, quick);
          },
        },
      },
      {
        key: "geracao",
        header: "Geração",
        align: "right",
        text: (r) => String(r.account.generation),
        sort: (r) => r.account.generation,
      },
      {
        key: "status",
        header: "Status",
        text: (r) => ACCOUNT_STATUS[r.account.status].label,
        sort: (r) => STATUS_ORDER.indexOf(r.account.status),
        dot: (r) => STATUS_DOT[r.account.status],
        edit: {
          type: "select",
          value: (r) => r.account.status,
          options: () => statusOptions,
          save: async (r, value) => {
            if (value === "caida") {
              // queda precisa de data e motivo: abre o formulário da conta
              if (r.avatar) setFalling({ account: r.account, avatar: r.avatar });
              return;
            }
            await changeAccountStatus(r.account, value as Exclude<AccountStatus, "caida">);
          },
        },
      },
      {
        key: "seguidores",
        header: "Seguidores",
        align: "right",
        text: (r) => (r.account.followers === null ? "" : String(r.account.followers)),
        sort: (r) => r.account.followers,
        render: (r) => (r.account.followers === null ? "" : formatNumber(r.account.followers)),
        edit: {
          type: "text",
          inputMode: "numeric",
          value: (r) => (r.account.followers === null ? "" : String(r.account.followers)),
          save: async (r, value) => {
            const followers = value.trim() ? parseCount(value) : null;
            if (value.trim() && followers === null) invalid("Não entendi o número. Exemplos: 1840, 1.840 ou 12,3 mil.");
            await updateRow(
              "accounts",
              r.account.id,
              { followers, followers_updated_at: new Date().toISOString() },
              quick,
            );
          },
        },
      },
      { key: "aquecimento", header: "Aquecimento", text: (r) => r.warmup },
      {
        key: "celular",
        header: "Celular",
        text: (r) => r.phone?.nickname ?? "",
        edit: {
          type: "select",
          value: (r) => r.account.phone_id ?? "",
          options: () => phoneOptions,
          save: (r, value) => updateRow("accounts", r.account.id, { phone_id: value || null }, quick),
        },
      },
      {
        key: "perfil",
        header: "Perfil",
        text: (r) => (r.profile ? `Perfil ${r.profile.number}` : ""),
        sort: (r) => r.profile?.number ?? null,
        edit: {
          type: "select",
          value: (r) => r.account.profile_id ?? "",
          options: () => profileOptions,
          save: (r, value) => updateRow("accounts", r.account.id, { profile_id: value || null }, quick),
        },
      },
      {
        key: "proxy",
        header: "Proxy / IP",
        text: (r) => r.account.proxy ?? "",
        edit: {
          type: "text",
          value: (r) => r.account.proxy ?? "",
          save: (r, value) => updateRow("accounts", r.account.id, { proxy: clean(value) }, quick),
        },
      },
      {
        key: "email",
        header: "E-mail",
        text: (r) => r.account.email ?? "",
        edit: {
          type: "text",
          inputMode: "email",
          value: (r) => r.account.email ?? "",
          save: (r, value) =>
            updateRow("accounts", r.account.id, { email: clean(value)?.toLowerCase() ?? null }, quick),
        },
      },
      // só diz se há senhas guardadas: o conteúdo do cofre nunca aparece (nem é exportado) aqui
      { key: "senhas", header: "Senhas", text: (r) => (r.account.secrets_enc ? "No cofre" : "") },
      {
        key: "criada",
        header: "Criada em",
        text: (r) => formatDate(r.account.created_on),
        sort: (r) => r.account.created_on,
        edit: {
          type: "date",
          value: (r) => r.account.created_on,
          save: async (r, value) => {
            if (!isValidISODate(value)) invalid("Informe uma data de criação válida.");
            if (value > todayISO()) invalid("A data de criação não pode ser no futuro.");
            if (value < "2010-01-01") invalid("Confira o ano da data de criação.");
            if (r.account.fell_on && value > r.account.fell_on) {
              invalid("A data de criação não pode ser depois da data da queda.");
            }
            await updateRow("accounts", r.account.id, { created_on: value }, quick);
          },
        },
      },
      {
        key: "vida",
        header: "Dias de vida",
        align: "right",
        text: (r) => (r.life === null ? "" : String(r.life)),
        sort: (r) => r.life,
      },
      {
        key: "caiu",
        header: "Caiu em",
        text: (r) => (r.account.fell_on ? formatDate(r.account.fell_on) : ""),
        sort: (r) => r.account.fell_on,
      },
      { key: "motivo", header: "Motivo da queda", text: (r) => r.account.fall_reason ?? "" },
      {
        key: "anotacoes",
        header: "Anotações",
        text: (r) => r.account.notes ?? "",
        edit: {
          type: "text",
          value: (r) => r.account.notes ?? "",
          save: (r, value) => updateRow("accounts", r.account.id, { notes: clean(value) }, quick),
        },
      },
    ];
  }, [db.phones, db.profiles]);

  return (
    <>
      <DataGrid
        columns={columns}
        rows={rows}
        rowKey={(r) => r.account.id}
        exportName="contas"
        filters={
          <>
            <FilterSelect
              label="Filtrar por país"
              value={country}
              onChange={setCountry}
              options={[
                { value: "", label: "País: todos" },
                ...db.countries.map((c) => ({ value: c.id, label: `${c.flag ? `${c.flag} ` : ""}${c.name}` })),
              ]}
            />
            <FilterSelect
              label="Filtrar por status"
              value={status}
              onChange={setStatus}
              options={[
                { value: "", label: "Status: todos" },
                { value: "vivas", label: "Não caídas" },
                ...STATUS_ORDER.map((s) => ({ value: s, label: ACCOUNT_STATUS[s].label })),
              ]}
            />
            <label className="flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-xl border border-line bg-surface px-3 text-sm shadow-card">
              <input
                type="checkbox"
                checked={onlyCurrent}
                onChange={(e) => setOnlyCurrent(e.target.checked)}
                className="size-4 accent-[var(--primary)]"
              />
              Só a conta atual
            </label>
          </>
        }
        empty={
          <EmptyState icon={<Table2 />} title="Nenhuma conta para mostrar">
            {db.accounts.length === 0
              ? "As contas cadastradas nos avatares aparecem aqui, uma por linha."
              : "Nenhuma conta combina com os filtros escolhidos."}
          </EmptyState>
        }
      />
      {falling ? (
        <AccountForm
          avatar={falling.avatar}
          account={falling.account}
          initialStatus="caida"
          onClose={() => setFalling(null)}
        />
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Vendas
// ---------------------------------------------------------------------------

interface SaleRow {
  sale: WeeklySale;
  avatar: Avatar | undefined;
  country: Country | undefined;
  account: Account | undefined;
  /** O valor em reais, ou null se a moeda não tem cotação. */
  brl: number | null;
}

/** Um valor em dinheiro como as planilhas em português esperam: "1234,50". */
function plainAmount(value: number): string {
  return value.toFixed(2).replace(".", ",");
}

function SalesSheet({ db }: { db: Db }) {
  const [country, setCountry] = useState("");
  const today = todayISO();

  const rows = useMemo<SaleRow[]>(() => {
    const rates = cleanRates(db.settings?.brl_rates);
    return db.sales
      .map((sale) => {
        const avatar = db.avatars.find((a) => a.id === sale.avatar_id);
        return {
          sale,
          avatar,
          country: avatar ? db.countries.find((c) => c.id === avatar.country_id) : undefined,
          account: db.accounts.find((a) => a.id === sale.account_id),
          brl: inBRL(sale, rates),
        };
      })
      .filter((row) => !country || row.country?.id === country)
      .sort(
        (a, b) =>
          b.sale.week_start.localeCompare(a.sale.week_start) ||
          (a.avatar?.name ?? "").localeCompare(b.avatar?.name ?? "", "pt-BR"),
      );
  }, [db.sales, db.avatars, db.countries, db.accounts, db.settings?.brl_rates, country]);

  const columns = useMemo<GridColumn<SaleRow>[]>(
    () => [
      {
        key: "avatar",
        header: "Avatar",
        width: "min-w-36",
        text: (r) => r.avatar?.name ?? "",
        render: (r) => (r.avatar ? <AvatarLink avatar={r.avatar} country={r.country} tab="vendas" /> : "—"),
      },
      { key: "pais", header: "País", text: (r) => r.country?.name ?? "" },
      {
        key: "semana",
        header: "Semana",
        width: "min-w-32",
        // na exportação vai a data da segunda-feira; na tela, o intervalo da semana
        text: (r) => formatDate(r.sale.week_start),
        sort: (r) => r.sale.week_start,
        render: (r) => weekLabel(r.sale.week_start, today),
      },
      {
        key: "valor",
        header: "Valor",
        align: "right",
        text: (r) => plainAmount(Number(r.sale.amount)),
        sort: (r) => Number(r.sale.amount),
        render: (r) => formatMoney(Number(r.sale.amount), r.sale.currency),
        edit: {
          type: "text",
          inputMode: "decimal",
          value: (r) => plainAmount(Number(r.sale.amount)),
          save: async (r, value) => {
            const amount = parseDecimal(value);
            if (amount === null || amount < 0) invalid("Não entendi o valor. Exemplos: 150 ou 1.234,50.");
            await patchSale(r.sale, { amount });
          },
        },
      },
      { key: "moeda", header: "Moeda", text: (r) => r.sale.currency },
      {
        key: "quantidade",
        header: "Qtd. de vendas",
        align: "right",
        text: (r) => (r.sale.sales_count === null ? "" : String(r.sale.sales_count)),
        sort: (r) => r.sale.sales_count,
        edit: {
          type: "text",
          inputMode: "numeric",
          value: (r) => (r.sale.sales_count === null ? "" : String(r.sale.sales_count)),
          save: async (r, value) => {
            const count = value.trim() ? parseCount(value) : null;
            if (value.trim() && count === null) invalid("Não entendi a quantidade. Exemplo: 12.");
            // (patchSale: um lançamento de exemplo que você corrige deixa de ser exemplo)
            await patchSale(r.sale, { sales_count: count }, quick);
          },
        },
      },
      {
        key: "reais",
        header: "Em reais",
        align: "right",
        text: (r) => (r.brl === null ? "" : plainAmount(r.brl)),
        sort: (r) => r.brl,
        render: (r) => (r.brl === null ? "sem cotação" : formatMoney(r.brl, "BRL")),
      },
      {
        key: "conta",
        header: "Conta na semana",
        text: (r) => (r.account ? `${r.account.handle} (${generationLabel(r.account.generation)})` : ""),
        render: (r) => (r.account ? `@${r.account.handle} · ${generationLabel(r.account.generation)}` : "—"),
      },
      {
        key: "observacao",
        header: "Observação",
        text: (r) => r.sale.notes ?? "",
        edit: {
          type: "text",
          value: (r) => r.sale.notes ?? "",
          save: (r, value) => patchSale(r.sale, { notes: clean(value) }, quick),
        },
      },
    ],
    [today],
  );

  return (
    <DataGrid
      columns={columns}
      rows={rows}
      rowKey={(row) => row.sale.id}
      exportName="vendas"
      filters={
        <FilterSelect
          label="Filtrar por país"
          value={country}
          onChange={setCountry}
          options={[{ value: "", label: "País: todos" }, ...db.countries.map((c) => ({ value: c.id, label: c.name }))]}
        />
      }
      empty={
        <EmptyState icon={<TrendingUp />} title="Nenhuma venda para mostrar">
          {db.sales.length === 0
            ? "As vendas lançadas na tela Vendas aparecem aqui, uma semana de um avatar por linha."
            : "Nenhuma venda combina com o filtro escolhido."}
        </EmptyState>
      }
    />
  );
}

// ---------------------------------------------------------------------------
// Avatares
// ---------------------------------------------------------------------------

interface AvatarRow {
  avatar: Avatar;
  country: Country | undefined;
  current: Account | null;
  total: number;
  falls: number;
  averageLife: number | null;
  pendingVideos: number;
}

function AvatarsSheet({ db }: { db: Db }) {
  const rows = useMemo<AvatarRow[]>(() => {
    const today = todayISO();
    return db.avatars
      .map((avatar) => {
        const accounts = accountsOf(db, avatar.id);
        const fallenLives = accounts
          .filter((a) => a.status === "caida")
          .map((a) => lifetimeDays(a, today))
          .filter((d): d is number => d !== null);
        return {
          avatar,
          country: db.countries.find((c) => c.id === avatar.country_id),
          current: currentAccount(accounts),
          total: accounts.length,
          falls: accounts.filter((a) => a.status === "caida").length,
          averageLife:
            fallenLives.length > 0 ? Math.round(fallenLives.reduce((sum, d) => sum + d, 0) / fallenLives.length) : null,
          pendingVideos: (avatar.model_videos ?? []).filter((v) => v.status === "a_modelar").length,
        };
      })
      .sort(
        (a, b) =>
          (a.country?.name ?? "").localeCompare(b.country?.name ?? "", "pt-BR") ||
          a.avatar.name.localeCompare(b.avatar.name, "pt-BR"),
      );
  }, [db]);

  const columns = useMemo<GridColumn<AvatarRow>[]>(
    () => [
      {
        key: "avatar",
        header: "Avatar",
        width: "min-w-36",
        text: (r) => r.avatar.name,
        render: (r) => <AvatarLink avatar={r.avatar} country={r.country} />,
      },
      { key: "pais", header: "País", text: (r) => r.country?.name ?? "" },
      {
        key: "status",
        header: "Status",
        text: (r) => AVATAR_STATUS[r.avatar.status].label,
        dot: (r) => (r.avatar.status === "ativo" ? "bg-emerald-500" : "bg-slate-400"),
        edit: {
          type: "select",
          value: (r) => r.avatar.status,
          options: () => [
            { value: "ativo", label: "Ativo" },
            { value: "pausado", label: "Pausado" },
          ],
          save: (r, value) => updateRow("avatars", r.avatar.id, { status: value as AvatarStatus }, quick),
        },
      },
      {
        key: "estrutura",
        header: "Estrutura",
        // site, entregável, checkout e automação: quantos já estão prontos e o que falta
        text: (r) => {
          const progress = structureProgress(r.avatar.kit);
          return progress.complete ? "Pronta" : `${progress.done} de ${progress.total} (falta ${pendingLabels(progress)})`;
        },
        sort: (r) => structureProgress(r.avatar.kit).done,
      },
      {
        key: "nicho",
        header: "Nicho",
        text: (r) => r.avatar.niche ?? "",
        edit: {
          type: "text",
          value: (r) => r.avatar.niche ?? "",
          save: (r, value) => updateRow("avatars", r.avatar.id, { niche: clean(value) }, quick),
        },
      },
      {
        key: "produto",
        header: "Produto",
        text: (r) => r.avatar.product_name ?? "",
        edit: {
          type: "text",
          value: (r) => r.avatar.product_name ?? "",
          save: (r, value) => updateRow("avatars", r.avatar.id, { product_name: clean(value) }, quick),
        },
      },
      {
        key: "preco",
        header: "Preço",
        align: "right",
        text: (r) =>
          r.avatar.product_price === null ? "" : formatMoney(r.avatar.product_price, r.avatar.product_currency),
        sort: (r) => r.avatar.product_price,
      },
      {
        key: "conta",
        header: "Conta atual",
        text: (r) => (r.current ? `@${r.current.handle}` : "Sem conta ativa"),
        render: (r) =>
          r.current ? `@${r.current.handle}` : <span className="text-red-600 dark:text-red-400">Sem conta ativa</span>,
      },
      {
        key: "statusConta",
        header: "Status da conta",
        text: (r) => (r.current ? ACCOUNT_STATUS[r.current.status].label : ""),
        sort: (r) => (r.current ? STATUS_ORDER.indexOf(r.current.status) : null),
        render: (r) => (r.current ? <AccountStatusBadge status={r.current.status} /> : ""),
      },
      {
        key: "geracao",
        header: "Geração",
        align: "right",
        text: (r) => (r.current ? String(r.current.generation) : ""),
        sort: (r) => r.current?.generation ?? null,
      },
      {
        key: "seguidores",
        header: "Seguidores",
        align: "right",
        text: (r) => (r.current?.followers === null || !r.current ? "" : String(r.current.followers)),
        sort: (r) => r.current?.followers ?? null,
        render: (r) => (r.current?.followers === null || !r.current ? "" : formatNumber(r.current.followers)),
      },
      { key: "contas", header: "Contas", align: "right", text: (r) => String(r.total), sort: (r) => r.total },
      { key: "quedas", header: "Quedas", align: "right", text: (r) => String(r.falls), sort: (r) => r.falls },
      {
        key: "vidaMedia",
        header: "Vida média (dias)",
        align: "right",
        text: (r) => (r.averageLife === null ? "" : String(r.averageLife)),
        sort: (r) => r.averageLife,
      },
      {
        key: "videos",
        header: "Vídeos a modelar",
        align: "right",
        text: (r) => String(r.pendingVideos),
        sort: (r) => r.pendingVideos,
      },
      {
        key: "site",
        header: "Site de vendas",
        text: (r) => r.avatar.sales_site_url ?? "",
        render: (r) =>
          r.avatar.sales_site_url ? <ExternalLinkText url={r.avatar.sales_site_url} /> : "",
        sort: (r) => prettyUrl(r.avatar.sales_site_url),
      },
    ],
    [],
  );

  return (
    <DataGrid
      columns={columns}
      rows={rows}
      rowKey={(r) => r.avatar.id}
      exportName="avatares"
      empty={
        <EmptyState icon={<UserRound />} title="Nenhum avatar cadastrado">
          Os avatares criados em “Países” aparecem aqui, um por linha.
        </EmptyState>
      }
    />
  );
}

// ---------------------------------------------------------------------------
// Celulares e perfis anti-detect
// ---------------------------------------------------------------------------

interface PhoneRow {
  phone: Phone;
  usage: Usage;
}

function PhonesSheet({ db }: { db: Db }) {
  const rows = useMemo<PhoneRow[]>(() => {
    const usage = usageByPhone(db);
    return db.phones.map((phone) => ({ phone, usage: usage.get(phone.id) ?? NO_USAGE }));
  }, [db]);

  const columns = useMemo<GridColumn<PhoneRow>[]>(() => {
    const field = (key: "model" | "number" | "notes", header: string): GridColumn<PhoneRow> => ({
      key,
      header,
      text: (r) => r.phone[key] ?? "",
      edit: {
        type: "text",
        value: (r) => r.phone[key] ?? "",
        save: (r, value) => updateRow("phones", r.phone.id, { [key]: clean(value) }, quick),
      },
    });
    return [
      {
        key: "apelido",
        header: "Celular",
        width: "min-w-36",
        text: (r) => r.phone.nickname,
        edit: {
          type: "text",
          value: (r) => r.phone.nickname,
          save: async (r, value) => {
            const nickname = value.trim();
            if (!nickname) invalid("O apelido do celular não pode ficar vazio.");
            await updateRow("phones", r.phone.id, { nickname }, quick);
          },
        },
      },
      field("model", "Modelo"),
      field("number", "Número / chip"),
      { key: "situacao", header: "Situação", text: (r) => situation(r.usage) },
      { key: "emUso", header: "Em uso por", text: (r) => usageText(db, r.usage.live) },
      { key: "caidas", header: "Usado por conta que caiu", text: (r) => usageText(db, r.usage.fallen) },
      field("notes", "Observação"),
    ];
  }, [db]);

  return (
    <DataGrid
      columns={columns}
      rows={rows}
      rowKey={(r) => r.phone.id}
      exportName="celulares"
      empty={
        <EmptyState icon={<Smartphone />} title="Nenhum celular cadastrado">
          Cadastre os aparelhos em “Infraestrutura”.
        </EmptyState>
      }
    />
  );
}

interface ProfileRow {
  profile: AntidetectProfile;
  usage: Usage;
}

function ProfilesSheet({ db }: { db: Db }) {
  const rows = useMemo<ProfileRow[]>(() => {
    const usage = usageByProfile(db);
    return db.profiles.map((profile) => ({ profile, usage: usage.get(profile.id) ?? NO_USAGE }));
  }, [db]);

  const columns = useMemo<GridColumn<ProfileRow>[]>(() => {
    const field = (key: "name" | "proxy" | "notes", header: string): GridColumn<ProfileRow> => ({
      key,
      header,
      text: (r) => r.profile[key] ?? "",
      edit: {
        type: "text",
        value: (r) => r.profile[key] ?? "",
        save: (r, value) => updateRow("antidetect_profiles", r.profile.id, { [key]: clean(value) }, quick),
      },
    });
    return [
      {
        key: "numero",
        header: "Perfil nº",
        width: "min-w-28",
        text: (r) => r.profile.number,
        edit: {
          type: "text",
          value: (r) => r.profile.number,
          save: async (r, value) => {
            const number = value.trim();
            if (!number) invalid("O número do perfil não pode ficar vazio.");
            const repeated = db.profiles.some(
              (p) => p.id !== r.profile.id && p.number.trim().toLowerCase() === number.toLowerCase(),
            );
            if (repeated) invalid(`Já existe um perfil com o número ${number}.`);
            await updateRow("antidetect_profiles", r.profile.id, { number }, quick);
          },
        },
      },
      field("name", "Nome"),
      field("proxy", "Proxy"),
      { key: "situacao", header: "Situação", text: (r) => situation(r.usage) },
      { key: "emUso", header: "Em uso por", text: (r) => usageText(db, r.usage.live) },
      { key: "caidas", header: "Usado por conta que caiu", text: (r) => usageText(db, r.usage.fallen) },
      field("notes", "Observação"),
    ];
  }, [db]);

  return (
    <DataGrid
      columns={columns}
      rows={rows}
      rowKey={(r) => r.profile.id}
      exportName="perfis-anti-detect"
      empty={
        <EmptyState icon={<Fingerprint />} title="Nenhum perfil cadastrado">
          Cadastre os perfis do navegador anti-detect em “Infraestrutura”.
        </EmptyState>
      }
    />
  );
}
