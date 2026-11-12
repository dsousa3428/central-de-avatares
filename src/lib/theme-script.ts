// Script minúsculo que roda antes da página aparecer, para aplicar o tema
// (claro/escuro) sem "piscar". Mantenha em sincronia com src/lib/theme.ts.
export const THEME_STORAGE_KEY = "cda-theme";
export const THEME_COLORS = { light: "#f4f5f8", dark: "#0b0d12" } as const;

export const THEME_SCRIPT = `(function(){try{var c=localStorage.getItem("${THEME_STORAGE_KEY}");var d=c==="dark"||(c!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.setAttribute("data-theme",d?"dark":"light")}catch(e){}})()`;
