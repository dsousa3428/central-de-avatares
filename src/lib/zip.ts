// Um arquivo .zip simples, montado no próprio aparelho: os arquivos entram sem
// compressão ("store"), o que dispensa qualquer biblioteca. Serve para entregar
// várias planilhas CSV num arquivo só. Regras puras (sem tela e sem banco).

const encoder = new TextEncoder();

let table: Uint32Array | null = null;

/** CRC-32 (o mesmo do zip, do PNG e do gzip). */
export function crc32(data: Uint8Array): number {
  if (!table) {
    table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  /** Nome do arquivo dentro do zip (pode ter acentos; barras "/" criam pastas). */
  name: string;
  /** O conteúdo: texto (vai em UTF-8) ou bytes. */
  data: string | Uint8Array;
}

/** Data e hora no formato do zip (herdado do MS-DOS: precisão de 2 segundos, a partir de 1980). */
function dosDateTime(date: Date): { time: number; day: number } {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    day: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

/** Monta o .zip (sem compressão) com os arquivos dados. */
export function zipStore(entries: ZipEntry[], date: Date): Uint8Array {
  const { time, day } = dosDateTime(date);
  const files = entries.map((entry) => {
    const name = encoder.encode(entry.name);
    const data = typeof entry.data === "string" ? encoder.encode(entry.data) : entry.data;
    return { name, data, crc: crc32(data) };
  });

  const localSize = files.reduce((sum, file) => sum + 30 + file.name.length + file.data.length, 0);
  const centralSize = files.reduce((sum, file) => sum + 46 + file.name.length, 0);
  const out = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(out.buffer);
  const FLAG_UTF8 = 0x0800; // os nomes estão em UTF-8
  let at = 0;
  const offsets: number[] = [];

  for (const file of files) {
    offsets.push(at);
    view.setUint32(at, 0x04034b50, true); // cabeçalho local
    view.setUint16(at + 4, 20, true); // versão mínima para abrir (2.0)
    view.setUint16(at + 6, FLAG_UTF8, true);
    view.setUint16(at + 8, 0, true); // método 0 = sem compressão
    view.setUint16(at + 10, time, true);
    view.setUint16(at + 12, day, true);
    view.setUint32(at + 14, file.crc, true);
    view.setUint32(at + 18, file.data.length, true);
    view.setUint32(at + 22, file.data.length, true);
    view.setUint16(at + 26, file.name.length, true);
    view.setUint16(at + 28, 0, true);
    out.set(file.name, at + 30);
    out.set(file.data, at + 30 + file.name.length);
    at += 30 + file.name.length + file.data.length;
  }

  const centralStart = at;
  files.forEach((file, index) => {
    view.setUint32(at, 0x02014b50, true); // entrada do índice
    view.setUint16(at + 4, 20, true); // feito por: versão 2.0
    view.setUint16(at + 6, 20, true); // versão mínima para abrir
    view.setUint16(at + 8, FLAG_UTF8, true);
    view.setUint16(at + 10, 0, true);
    view.setUint16(at + 12, time, true);
    view.setUint16(at + 14, day, true);
    view.setUint32(at + 16, file.crc, true);
    view.setUint32(at + 20, file.data.length, true);
    view.setUint32(at + 24, file.data.length, true);
    view.setUint16(at + 28, file.name.length, true);
    view.setUint16(at + 30, 0, true); // sem campo extra
    view.setUint16(at + 32, 0, true); // sem comentário
    view.setUint16(at + 34, 0, true); // disco 0
    view.setUint16(at + 36, 0, true); // atributos internos
    view.setUint32(at + 38, 0, true); // atributos externos
    view.setUint32(at + 42, offsets[index], true);
    out.set(file.name, at + 46);
    at += 46 + file.name.length;
  });

  view.setUint32(at, 0x06054b50, true); // fim do índice
  view.setUint16(at + 4, 0, true);
  view.setUint16(at + 6, 0, true);
  view.setUint16(at + 8, files.length, true);
  view.setUint16(at + 10, files.length, true);
  view.setUint32(at + 12, at - centralStart, true);
  view.setUint32(at + 16, centralStart, true);
  view.setUint16(at + 20, 0, true);
  return out;
}
