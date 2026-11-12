// Listas de apoio para os formulários (moedas e países mais comuns).

export const CURRENCIES: Array<{ code: string; name: string }> = [
  { code: "EUR", name: "Euro" },
  { code: "USD", name: "Dólar americano" },
  { code: "BRL", name: "Real" },
  { code: "GBP", name: "Libra esterlina" },
  { code: "CHF", name: "Franco suíço" },
  { code: "MXN", name: "Peso mexicano" },
  { code: "ARS", name: "Peso argentino" },
  { code: "CLP", name: "Peso chileno" },
  { code: "COP", name: "Peso colombiano" },
  { code: "PEN", name: "Sol peruano" },
  { code: "UYU", name: "Peso uruguaio" },
  { code: "CAD", name: "Dólar canadense" },
  { code: "AUD", name: "Dólar australiano" },
  { code: "PLN", name: "Zloty polonês" },
  { code: "RON", name: "Leu romeno" },
  { code: "CZK", name: "Coroa tcheca" },
  { code: "HUF", name: "Florim húngaro" },
  { code: "BGN", name: "Lev búlgaro" },
  { code: "SEK", name: "Coroa sueca" },
  { code: "NOK", name: "Coroa norueguesa" },
  { code: "DKK", name: "Coroa dinamarquesa" },
  { code: "TRY", name: "Lira turca" },
  { code: "JPY", name: "Iene" },
  { code: "INR", name: "Rupia indiana" },
  { code: "ZAR", name: "Rand sul-africano" },
];

export interface CountryPreset {
  name: string;
  flag: string;
  language: string;
  currency: string;
  timezone: string;
}

export const COUNTRY_PRESETS: CountryPreset[] = [
  { name: "Itália", flag: "🇮🇹", language: "Italiano", currency: "EUR", timezone: "Europe/Rome" },
  { name: "Espanha", flag: "🇪🇸", language: "Espanhol", currency: "EUR", timezone: "Europe/Madrid" },
  { name: "Portugal", flag: "🇵🇹", language: "Português", currency: "EUR", timezone: "Europe/Lisbon" },
  { name: "França", flag: "🇫🇷", language: "Francês", currency: "EUR", timezone: "Europe/Paris" },
  { name: "Alemanha", flag: "🇩🇪", language: "Alemão", currency: "EUR", timezone: "Europe/Berlin" },
  { name: "Estados Unidos", flag: "🇺🇸", language: "Inglês", currency: "USD", timezone: "America/New_York" },
  { name: "Reino Unido", flag: "🇬🇧", language: "Inglês", currency: "GBP", timezone: "Europe/London" },
  { name: "Brasil", flag: "🇧🇷", language: "Português", currency: "BRL", timezone: "America/Sao_Paulo" },
  { name: "México", flag: "🇲🇽", language: "Espanhol", currency: "MXN", timezone: "America/Mexico_City" },
  { name: "Argentina", flag: "🇦🇷", language: "Espanhol", currency: "ARS", timezone: "America/Argentina/Buenos_Aires" },
  { name: "Colômbia", flag: "🇨🇴", language: "Espanhol", currency: "COP", timezone: "America/Bogota" },
  { name: "Chile", flag: "🇨🇱", language: "Espanhol", currency: "CLP", timezone: "America/Santiago" },
  { name: "Peru", flag: "🇵🇪", language: "Espanhol", currency: "PEN", timezone: "America/Lima" },
  { name: "Uruguai", flag: "🇺🇾", language: "Espanhol", currency: "UYU", timezone: "America/Montevideo" },
  { name: "Canadá", flag: "🇨🇦", language: "Inglês", currency: "CAD", timezone: "America/Toronto" },
  { name: "Austrália", flag: "🇦🇺", language: "Inglês", currency: "AUD", timezone: "Australia/Sydney" },
  { name: "Holanda", flag: "🇳🇱", language: "Holandês", currency: "EUR", timezone: "Europe/Amsterdam" },
  { name: "Bélgica", flag: "🇧🇪", language: "Holandês / Francês", currency: "EUR", timezone: "Europe/Brussels" },
  { name: "Áustria", flag: "🇦🇹", language: "Alemão", currency: "EUR", timezone: "Europe/Vienna" },
  { name: "Suíça", flag: "🇨🇭", language: "Alemão / Francês / Italiano", currency: "CHF", timezone: "Europe/Zurich" },
  { name: "Irlanda", flag: "🇮🇪", language: "Inglês", currency: "EUR", timezone: "Europe/Dublin" },
  { name: "Polônia", flag: "🇵🇱", language: "Polonês", currency: "PLN", timezone: "Europe/Warsaw" },
  { name: "Romênia", flag: "🇷🇴", language: "Romeno", currency: "RON", timezone: "Europe/Bucharest" },
  { name: "Grécia", flag: "🇬🇷", language: "Grego", currency: "EUR", timezone: "Europe/Athens" },
  { name: "República Tcheca", flag: "🇨🇿", language: "Tcheco", currency: "CZK", timezone: "Europe/Prague" },
  { name: "Hungria", flag: "🇭🇺", language: "Húngaro", currency: "HUF", timezone: "Europe/Budapest" },
  { name: "Bulgária", flag: "🇧🇬", language: "Búlgaro", currency: "BGN", timezone: "Europe/Sofia" },
  { name: "Croácia", flag: "🇭🇷", language: "Croata", currency: "EUR", timezone: "Europe/Zagreb" },
  { name: "Eslováquia", flag: "🇸🇰", language: "Eslovaco", currency: "EUR", timezone: "Europe/Bratislava" },
  { name: "Suécia", flag: "🇸🇪", language: "Sueco", currency: "SEK", timezone: "Europe/Stockholm" },
  { name: "Noruega", flag: "🇳🇴", language: "Norueguês", currency: "NOK", timezone: "Europe/Oslo" },
  { name: "Dinamarca", flag: "🇩🇰", language: "Dinamarquês", currency: "DKK", timezone: "Europe/Copenhagen" },
  { name: "Finlândia", flag: "🇫🇮", language: "Finlandês", currency: "EUR", timezone: "Europe/Helsinki" },
  { name: "Turquia", flag: "🇹🇷", language: "Turco", currency: "TRY", timezone: "Europe/Istanbul" },
  { name: "Japão", flag: "🇯🇵", language: "Japonês", currency: "JPY", timezone: "Asia/Tokyo" },
  { name: "Índia", flag: "🇮🇳", language: "Hindi / Inglês", currency: "INR", timezone: "Asia/Kolkata" },
  { name: "África do Sul", flag: "🇿🇦", language: "Inglês", currency: "ZAR", timezone: "Africa/Johannesburg" },
];

/** Motivos comuns de queda, para sugerir no formulário. */
export const FALL_REASONS = [
  "Seguiu gente demais em pouco tempo",
  "Postou link cedo demais",
  "Denúncias",
  "Verificação por selfie / documento",
  "IP ou aparelho vinculado a conta caída",
  "Conteúdo removido (diretrizes)",
  "Motivo desconhecido",
];

/** Lista de fusos do navegador (ou só o valor atual, se o navegador não souber listar). */
export function listTimezones(current?: string | null): string[] {
  let zones: string[] = [];
  try {
    const supported = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
    if (typeof supported === "function") zones = supported("timeZone");
  } catch {
    zones = [];
  }
  const presetZones = COUNTRY_PRESETS.map((p) => p.timezone);
  const all = new Set<string>([...zones, ...presetZones]);
  if (current) all.add(current);
  return [...all].sort((a, b) => a.localeCompare(b));
}
