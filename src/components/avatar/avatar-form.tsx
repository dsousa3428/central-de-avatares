"use client";

import { useState } from "react";
import { clean, normalizeUrl, parseDecimal } from "@/lib/format";
import { CURRENCIES } from "@/lib/reference";
import { insertRow, updateRow, useStore } from "@/lib/store";
import type { Avatar, AvatarStatus } from "@/lib/types";
import { invalid } from "@/components/common/validation";
import { Field, Input, Select } from "@/components/ui/field";
import { FormModal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";

interface AvatarFormProps {
  avatar?: Avatar;
  /** País já escolhido ao criar (a aba aberta). */
  defaultCountryId?: string;
  onClose: () => void;
  onSaved?: (avatar: Avatar) => void;
}

/** Dados básicos do avatar: nome, nicho, foto, país, status, produto e preço. */
export function AvatarForm({ avatar, defaultCountryId, onClose, onSaved }: AvatarFormProps) {
  const db = useStore();
  const toast = useToast();

  const initialCountryId = avatar?.country_id ?? defaultCountryId ?? db.countries[0]?.id ?? "";
  const initialCountry = db.countries.find((c) => c.id === initialCountryId);

  const [name, setName] = useState(avatar?.name ?? "");
  const [niche, setNiche] = useState(avatar?.niche ?? "");
  const [photoUrl, setPhotoUrl] = useState(avatar?.photo_url ?? "");
  const [countryId, setCountryId] = useState(initialCountryId);
  const [status, setStatus] = useState<AvatarStatus>(avatar?.status ?? "ativo");
  const [productName, setProductName] = useState(avatar?.product_name ?? "");
  const [price, setPrice] = useState(
    avatar?.product_price !== null && avatar?.product_price !== undefined
      ? String(avatar.product_price).replace(".", ",")
      : "",
  );
  const [currency, setCurrency] = useState(avatar?.product_currency ?? initialCountry?.currency ?? "EUR");

  const currencyKnown = CURRENCIES.some((c) => c.code === currency);

  function changeCountry(id: string) {
    setCountryId(id);
    // ao criar, a moeda do produto acompanha a moeda do país
    if (!avatar) {
      const country = db.countries.find((c) => c.id === id);
      if (country) setCurrency(country.currency);
    }
  }

  async function submit() {
    const cleanName = name.trim();
    if (!cleanName) invalid("Informe o nome do avatar.");
    if (!countryId) invalid("Escolha o país do avatar.");
    const parsedPrice = price.trim() ? parseDecimal(price) : null;
    if (price.trim() && (parsedPrice === null || parsedPrice < 0)) {
      invalid("O preço não parece um número válido. Exemplo: 27,90");
    }
    const values = {
      name: cleanName,
      niche: clean(niche),
      photo_url: normalizeUrl(photoUrl),
      country_id: countryId,
      status,
      product_name: clean(productName),
      product_price: parsedPrice,
      product_currency: currency || null,
    };
    if (avatar) {
      await updateRow("avatars", avatar.id, values);
      toast.success("Avatar atualizado");
    } else {
      const position =
        db.avatars.filter((a) => a.country_id === countryId).reduce((max, a) => Math.max(max, a.position), -1) + 1;
      const row = await insertRow("avatars", { ...values, position });
      toast.success("Avatar criado");
      onSaved?.(row);
    }
  }

  return (
    <FormModal title={avatar ? "Editar avatar" : "Novo avatar"} onClose={onClose} onSubmit={submit}>
      <Field label="Nome do avatar">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Fra' Salvio" autoComplete="off" />
      </Field>
      <Field label="Nicho" optional>
        <Input
          value={niche}
          onChange={(e) => setNiche(e.target.value)}
          placeholder="Remédios naturais e bem-estar"
          autoComplete="off"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="País">
          <Select value={countryId} onChange={(e) => changeCountry(e.target.value)}>
            {db.countries.map((c) => (
              <option key={c.id} value={c.id}>
                {c.flag ? `${c.flag} ` : ""}
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status">
          <Select value={status} onChange={(e) => setStatus(e.target.value as AvatarStatus)}>
            <option value="ativo">Ativo</option>
            <option value="pausado">Pausado</option>
          </Select>
        </Field>
      </div>
      <Field label="Foto (link)" optional hint="Cole o endereço de uma imagem. Sem foto, aparecem as iniciais.">
        <Input
          value={photoUrl}
          onChange={(e) => setPhotoUrl(e.target.value)}
          placeholder="https://…"
          inputMode="url"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
        />
      </Field>
      <Field label="Produto" optional>
        <Input
          value={productName}
          onChange={(e) => setProductName(e.target.value)}
          placeholder="Nome do produto vendido"
          autoComplete="off"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Preço" optional>
          <Input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="27,00" inputMode="decimal" autoComplete="off" />
        </Field>
        <Field label="Moeda">
          <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {!currencyKnown && currency ? <option value={currency}>{currency}</option> : null}
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} — {c.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </FormModal>
  );
}
