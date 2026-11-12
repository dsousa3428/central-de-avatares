// Gera os ícones do aplicativo instalável (public/icons/*.png) a partir do desenho do
// ícone do painel. Só precisa rodar de novo se o desenho mudar:
//
//   node dev/make-icons.cjs
const { chromium } = require("playwright");
const { join } = require("node:path");

const OUT = join(__dirname, "..", "public", "icons");

const GRADIENT = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6366f1"/><stop offset="1" stop-color="#4338ca"/></linearGradient></defs>`;
const GLYPH = `<circle cx="32" cy="25" r="10" fill="#fff"/><path d="M13 54c1.6-11 9.4-17 19-17s17.4 6 19 17z" fill="#fff" fill-opacity=".92"/><circle cx="49" cy="15" r="5" fill="#a5b4fc"/>`;

// ícone comum: o quadrado de cantos arredondados, como o da aba do navegador
const plain = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${GRADIENT}<rect width="64" height="64" rx="14" fill="url(#g)"/>${GLYPH}</svg>`;
// ícone "maskable": fundo até as bordas e o desenho menor, dentro da área que nenhum formato de ícone corta
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${GRADIENT}<rect width="64" height="64" fill="url(#g)"/><g transform="translate(32 33) scale(0.68) translate(-32 -34)">${GLYPH}</g></svg>`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const shoot = async (svg, size, name) => {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace("<svg ", `<svg width="${size}" height="${size}" style="display:block" `)}</body></html>`);
    await page.screenshot({ path: join(OUT, name), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
    console.log("gerado:", name);
  };
  await shoot(plain, 192, "icon-192.png");
  await shoot(plain, 512, "icon-512.png");
  await shoot(maskable, 512, "icon-maskable-512.png");
  await browser.close();
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
