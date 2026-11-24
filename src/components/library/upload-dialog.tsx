"use client";

import { useState } from "react";
import { CircleAlert, CircleCheck, LoaderCircle } from "lucide-react";
import { fileProblem, formatBytes } from "@/lib/library";
import { uploadFiles } from "@/lib/library-actions";
import { plural } from "@/lib/format";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";

type State = { state: "waiting" | "sending" | "done" | "error"; message?: string };

/**
 * Envia os arquivos escolhidos (um item para cada, com o nome do arquivo como
 * título). Arquivo grande demais já aparece recusado antes de começar.
 */
export function UploadDialog({
  files,
  initialAvatar,
  onClose,
}: {
  files: File[];
  initialAvatar?: string | null;
  onClose: () => void;
}) {
  const db = useStore();
  const toast = useToast();
  const [avatar, setAvatar] = useState(initialAvatar ?? "");
  const [states, setStates] = useState<State[]>(() =>
    files.map((file) => {
      const problem = fileProblem(file);
      return problem ? { state: "error", message: problem } : { state: "waiting" };
    }),
  );
  const [phase, setPhase] = useState<"ready" | "sending" | "finished">("ready");
  const sendable = files.map((file, index) => ({ file, index })).filter(({ file }) => !fileProblem(file));
  // (o avatar escolhido pode ter sido apagado em outra aba: aí os arquivos ficam gerais)
  const avatarId = db.avatars.some((item) => item.id === avatar) ? avatar : "";

  async function send() {
    setPhase("sending");
    const results = await uploadFiles(
      sendable.map(({ file }) => file),
      avatarId || null,
      (position, state, message) =>
        setStates((current) => current.map((entry, index) => (index === sendable[position].index ? { state, message } : entry))),
    );
    const sent = results.filter((result) => result.item).length;
    if (sent === files.length) {
      toast.success(sent === 1 ? "Arquivo guardado" : `${sent} arquivos guardados`);
      onClose();
      return;
    }
    setPhase("finished");
  }

  const sent = states.filter((entry) => entry.state === "done").length;
  return (
    <Modal
      open
      onClose={onClose}
      canClose={phase !== "sending"}
      closeOnBackdrop={phase !== "sending"}
      title="Enviar arquivos"
      description={
        phase === "finished"
          ? `${plural(sent, "arquivo guardado", "arquivos guardados")}; os que não foram aparecem com o motivo.`
          : "Cada arquivo vira um item, com o nome do arquivo como título (dá para trocar depois)."
      }
      footer={
        phase === "finished" ? (
          <Button variant="primary" onClick={onClose}>
            Fechar
          </Button>
        ) : (
          <>
            <Button onClick={onClose} disabled={phase === "sending"}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={() => void send()} loading={phase === "sending"} disabled={sendable.length === 0}>
              {sendable.length > 1 ? `Enviar ${sendable.length}` : "Enviar"}
            </Button>
          </>
        )
      }
    >
      <div className="space-y-4">
        <Field label="De qual avatar">
          <Select value={avatarId} onChange={(event) => setAvatar(event.target.value)} disabled={phase !== "ready"}>
            <option value="">Geral (todos os avatares)</option>
            {db.avatars.map((item) => {
              const flag = db.countries.find((country) => country.id === item.country_id)?.flag;
              return (
                <option key={item.id} value={item.id}>
                  {flag ? `${flag} ` : ""}
                  {item.name}
                </option>
              );
            })}
          </Select>
        </Field>
        <ul className="divide-y divide-line rounded-xl border border-line" aria-label="Arquivos escolhidos">
          {files.map((file, index) => {
            const entry = states[index];
            return (
              <li key={`${index}-${file.name}`} className="flex items-start gap-2.5 px-3 py-2.5">
                <Status state={entry.state} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{file.name}</p>
                  <p className={entry.state === "error" ? "text-xs font-medium text-danger" : "text-xs text-muted"}>
                    {entry.state === "error"
                      ? entry.message
                      : entry.state === "sending"
                        ? `${formatBytes(file.size)} · enviando…`
                        : entry.state === "done"
                          ? `${formatBytes(file.size)} · guardado`
                          : formatBytes(file.size)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
        <p className="text-xs leading-relaxed text-muted">
          Os arquivos ficam no seu Supabase, num lugar privado que só o seu login abre. Arquivo grande demora: deixe esta
          janela aberta até terminar.
        </p>
      </div>
    </Modal>
  );
}

function Status({ state }: { state: State["state"] }) {
  if (state === "done") return <CircleCheck className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-label="Guardado" />;
  if (state === "error") return <CircleAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-label="Não enviado" />;
  if (state === "sending") return <LoaderCircle className="mt-0.5 size-4 shrink-0 animate-spin text-primary" aria-label="Enviando" />;
  return <span className="mt-1 size-3 shrink-0 rounded-full border-2 border-line-strong" aria-hidden />;
}
