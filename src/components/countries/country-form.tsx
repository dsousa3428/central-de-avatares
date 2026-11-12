"use client";

import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { clean } from "@/lib/format";
import { COUNTRY_PRESETS, CURRENCIES, listTimezones } from "@/lib/reference";
import { deleteRow, insertRow, updateRow, useStore } from "@/lib/store";
import type { Country } from "@/lib/types";
import { invalid } from "@/components/common/validation";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { FormModal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";

/** "#a, #b\ntema c" -> ["#a", "#b", "tema c"] (sem repetidos) */
export function parseTags(text: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const piece of text.split(/[\n,;]+/)) {
    const tag = piece.trim();
    const key = tag.toLowerCase();
    if (tag && !seen.has(key)) {
      seen.add(key);
      tags.push(tag);
    }
  }
  return tags;
}

interface CountryFormProps {
  country?: Country;
  onClose: () => void;
  onSaved?: (country: Country) => void;
}

export function CountryForm({ country, onClose, onSaved }: CountryFormProps) {
  const db = useStore();
  const toast = useToast();
  const confirm = useConfirm();

  const [preset, setPreset] = useState("");
  const [name, setName] = useState(country?.name ?? "");
  const [flag, setFlag] = useState(country?.flag ?? "");
  const [language, setLanguage] = useState(country?.language ?? "");
  const [currency, setCurrency] = useState(country?.currency ?? "EUR");
  const [timezone, setTimezone] = useState(country?.timezone ?? "");
  const [tags, setTags] = useState((country?.warmup_tags ?? []).join("\n"));
  const [notes, setNotes] = useState(country?.notes ?? "");

  const timezones = useMemo(() => listTimezones(country?.timezone), [country?.timezone]);
  const currencyKnown = CURRENCIES.some((c) => c.code === currency);
  const avatarCount = country ? db.avatars.filter((a) => a.country_id === country.id).length : 0;

  function applyPreset(value: string) {
    setPreset(value);
    const found = COUNTRY_PRESETS.find((p) => p.name === value);
    if (!found) return;
    setName(found.name);
    setFlag(found.flag);
    setLanguage(found.language);
    setCurrency(found.currency);
    setTimezone(found.timezone);
  }

  async function submit() {
    const cleanName = name.trim();
    if (!cleanName) invalid("Informe o nome do país.");
    const values = {
      name: cleanName,
      flag: clean(flag),
      language: clean(language),
      currency: (currency || "EUR").trim().toUpperCase(),
      timezone: clean(timezone),
      warmup_tags: parseTags(tags),
      notes: clean(notes),
    };
    if (country) {
      await updateRow("countries", country.id, values);
      toast.success("País atualizado");
    } else {
      const position = db.countries.reduce((max, c) => Math.max(max, c.position), -1) + 1;
      const row = await insertRow("countries", { ...values, position });
      toast.success("País adicionado");
      onSaved?.(row);
    }
  }

  async function remove() {
    if (!country) return;
    if (avatarCount > 0) {
      toast.error(
        `Este país tem ${avatarCount === 1 ? "1 avatar" : `${avatarCount} avatares`}. Apague ou mova os avatares para outro país antes.`,
      );
      return;
    }
    const ok = await confirm({
      title: `Apagar ${country.name}?`,
      message: "O país e as tags de aquecimento dele serão apagados. Esta ação não pode ser desfeita.",
      confirmLabel: "Apagar país",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await deleteRow("countries", country.id);
      toast.success("País apagado");
      onClose();
    } catch (err) {
      toast.error(err);
    }
  }

  return (
    <FormModal
      title={country ? `Editar ${country.name}` : "Novo país"}
      onClose={onClose}
      onSubmit={submit}
      extraActions={
        country ? (
          <Button variant="danger-ghost" onClick={remove} className="md:mr-auto">
            <Trash2 className="size-4" /> Apagar
          </Button>
        ) : null
      }
    >
      {!country ? (
        <Field label="Escolher da lista" hint="Preenche bandeira, idioma, moeda e fuso sozinho. Depois você pode ajustar.">
          <Select value={preset} onChange={(e) => applyPreset(e.target.value)}>
            <option value="">— Outro país (preencher à mão) —</option>
            {COUNTRY_PRESETS.map((p) => (
              <option key={p.name} value={p.name}>
                {p.flag} {p.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      <div className="grid grid-cols-[1fr_5.5rem] gap-3">
        <Field label="Nome">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Itália" autoComplete="off" />
        </Field>
        <Field label="Bandeira">
          <Input value={flag} onChange={(e) => setFlag(e.target.value)} placeholder="🇮🇹" className="text-center" autoComplete="off" />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Idioma" optional>
          <Input value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="Italiano" autoComplete="off" />
        </Field>
        <Field label="Moeda padrão">
          <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {!currencyKnown ? <option value={currency}>{currency}</option> : null}
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} — {c.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Fuso horário" optional>
        <Select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
          <option value="">— Não informado —</option>
          {timezones.map((zone) => (
            <option key={zone} value={zone}>
              {zone.replace(/_/g, " ")}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="Tags de aquecimento"
        optional
        hint="Hashtags, temas e perfis para interagir durante o aquecimento. Uma por linha (ou separadas por vírgula)."
      >
        <Textarea
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          rows={5}
          placeholder={"#benessere\n#rimedinaturali\ncucina tradizionale\n@perfil.exemplo"}
          autoCapitalize="none"
          spellCheck={false}
        />
      </Field>

      <Field label="Anotações" optional>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </Field>
    </FormModal>
  );
}
