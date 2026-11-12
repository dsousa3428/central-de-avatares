"use client";

import { useEffect, useRef, useState } from "react";
import { Download, FileSpreadsheet, TriangleAlert, Upload } from "lucide-react";
import { backupCounts, backupSecrets, parseBackup, type BackupFile } from "@/lib/backup";
import { downloadBackup, downloadSheets, restoreBackup } from "@/lib/backup-actions";
import { AppError } from "@/lib/errors";
import { refresh, RESTORE_UNAVAILABLE, schemaVersion } from "@/lib/store";
import { CopySchemaButton } from "@/components/common/copy-schema-button";
import { invalid } from "@/components/common/validation";
import { Button } from "@/components/ui/button";
import { Callout, Section } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { FormModal, Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";

const WORD = "RESTAURAR";

const LABELS: Array<[keyof ReturnType<typeof backupCounts>, string, string]> = [
  ["countries", "país", "países"],
  ["avatars", "avatar", "avatares"],
  ["accounts", "conta", "contas"],
  ["phones", "celular", "celulares"],
  ["antidetect_profiles", "perfil anti-detect", "perfis anti-detect"],
  ["warmups", "calendário de aquecimento", "calendários de aquecimento"],
  ["weekly_sales", "lançamento de vendas", "lançamentos de vendas"],
  ["activity_log", "registro na linha do tempo", "registros na linha do tempo"],
];

function when(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "data desconhecida";
  const two = (n: number) => String(n).padStart(2, "0");
  return `${two(date.getDate())}/${two(date.getMonth() + 1)}/${date.getFullYear()} às ${two(date.getHours())}:${two(date.getMinutes())}`;
}

/** Configurações → Backup: baixar tudo (para guardar), baixar as planilhas e restaurar um backup. */
export function BackupSection() {
  const toast = useToast();
  const picker = useRef<HTMLInputElement>(null);
  const [chosen, setChosen] = useState<{ file: BackupFile; name: string } | null>(null);

  function download(what: "backup" | "sheets") {
    try {
      const name = what === "backup" ? downloadBackup() : downloadSheets();
      toast.success(`Arquivo baixado: ${name}`);
    } catch (err) {
      toast.error(err);
    }
  }

  async function pick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // escolher o mesmo arquivo de novo volta a abrir a janela
    if (!file) return;
    try {
      if (file.size > 50 * 1024 * 1024) invalid("Este arquivo é grande demais para ser um backup do painel.");
      setChosen({ file: parseBackup(await file.text()), name: file.name });
    } catch (err) {
      toast.error(err);
    }
  }

  return (
    <Section title="Backup" subtitle="Guarde uma cópia de tudo fora do painel. Vale fazer de tempos em tempos.">
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => download("backup")}>
            <Download className="size-4" /> Baixar backup
          </Button>
          <Button variant="secondary" onClick={() => download("sheets")}>
            <FileSpreadsheet className="size-4" /> Baixar planilhas
          </Button>
        </div>
        <p className="text-sm leading-relaxed text-muted">
          <strong className="font-medium text-fg">Backup</strong> é um arquivo só (.json) com tudo do painel — é com ele
          que se restaura. As senhas do cofre vão junto, mas continuam cifradas: só abrem com a sua senha-mestra.{" "}
          <strong className="font-medium text-fg">Planilhas</strong> é um .zip com uma tabela (.csv) por assunto, para
          abrir no Excel ou no Google Planilhas (sem as senhas). Os dois arquivos têm os seus dados: guarde em um lugar
          só seu.
        </p>
        <div className="border-t border-line pt-3">
          <Button variant="secondary" onClick={() => picker.current?.click()}>
            <Upload className="size-4" /> Restaurar backup…
          </Button>
          <input
            ref={picker}
            type="file"
            accept=".json,application/json"
            onChange={(event) => void pick(event)}
            className="sr-only"
            tabIndex={-1}
            aria-label="Arquivo de backup para restaurar"
          />
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Restaurar troca tudo o que está no painel pelo conteúdo do arquivo. Antes de trocar, o painel mostra o que o
            arquivo tem e pede uma confirmação.
          </p>
        </div>
      </div>
      {chosen ? <RestoreDialog file={chosen.file} name={chosen.name} onClose={() => setChosen(null)} /> : null}
    </Section>
  );
}

function RestoreDialog({ file, name, onClose }: { file: BackupFile; name: string; onClose: () => void }) {
  const toast = useToast();
  const [typed, setTyped] = useState("");
  // null = ainda conferindo se o banco já tem a função de restaurar
  const [ready, setReady] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(0);

  // Enquanto a janela está aberta, busca no banco o estado mais recente (pode ter mudado em outro
  // aparelho): o backup de segurança, feito na hora de restaurar, precisa ser do que existe de fato.
  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    let active = true;
    schemaVersion()
      .then((version) => {
        if (active) setReady(version >= 3);
      })
      .catch(() => {
        if (active) setReady(true); // sem resposta agora: deixa tentar; o erro certo aparece ao restaurar
      });
    return () => {
      active = false;
    };
  }, [checking]);

  const counts = backupCounts(file);
  const secrets = backupSecrets(file);
  const lines = LABELS.filter(([key]) => counts[key] > 0).map(
    ([key, one, many]) => `${counts[key]} ${counts[key] === 1 ? one : many}`,
  );

  async function submit() {
    if (typed.trim().toUpperCase() !== WORD) invalid(`Para confirmar, digite ${WORD} no campo.`);
    try {
      await restoreBackup(file);
    } catch (err) {
      if (err instanceof AppError && err.code === RESTORE_UNAVAILABLE) setReady(false);
      throw err;
    }
    toast.success("Backup restaurado");
  }

  if (ready === false) {
    return (
      <Modal open onClose={onClose} title="Falta atualizar o banco (uma vez)">
        <div className="space-y-3 text-[15px] leading-relaxed">
          <p>
            Restaurar um backup usa uma função nova do banco de dados, que troca tudo de uma vez só (ou troca tudo, ou
            não mexe em nada). Ela entra quando você roda o script SQL atualizado:
          </p>
          <ol className="list-decimal space-y-1.5 pl-5">
            <li>
              Toque em <strong>Copiar script SQL</strong>, aqui embaixo.
            </li>
            <li>
              No site do Supabase, abra o seu projeto, vá em <strong>SQL Editor</strong>, cole o script e toque em{" "}
              <strong>Run</strong>. Ele não apaga nada.
            </li>
            <li>
              Volte aqui e toque em <strong>Já rodei</strong>.
            </li>
          </ol>
          <div className="flex flex-wrap gap-2">
            <CopySchemaButton />
            <Button
              variant="secondary"
              onClick={() => {
                setReady(null);
                setChecking((n) => n + 1);
              }}
            >
              Já rodei
            </Button>
          </div>
          <p className="text-sm text-muted">Nada foi alterado no painel.</p>
        </div>
      </Modal>
    );
  }

  return (
    <FormModal title="Restaurar backup" description={name} onClose={onClose} onSubmit={submit} submitLabel="Restaurar">
      <div>
        <p className="text-sm text-muted">Backup feito em {when(file.exported_at)}. Ele tem:</p>
        {lines.length > 0 ? (
          <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-[15px]">
            {lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
            {secrets > 0 ? (
              <li>
                senhas no cofre de {secrets} {secrets === 1 ? "conta" : "contas"} (cifradas)
              </li>
            ) : null}
          </ul>
        ) : (
          <p className="mt-1.5 text-[15px]">Nenhum dado (o painel ficaria vazio).</p>
        )}
      </div>

      <Callout tone="danger" icon={<TriangleAlert />}>
        <p>
          <strong>Tudo o que está no painel agora será substituído</strong> pelo conteúdo deste arquivo — o que foi
          criado ou mudado depois deste backup deixa de existir.
        </p>
        <p className="mt-1.5">
          Por segurança, antes de trocar o painel baixa um backup do que existe agora. Se o arquivo tiver senhas no
          cofre, elas abrem com a senha-mestra de quando o backup foi feito.
        </p>
      </Callout>

      <Field label={`Para confirmar, digite ${WORD}`}>
        <Input
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder={WORD}
        />
      </Field>
    </FormModal>
  );
}
