# Jornada 60 — ferramentas

O app em si é um arquivo só: `jornada-60/index.html` (mais o `jornada-60/LEIAME.md`). Ele não faz parte do painel
Central de Avatares: não é publicado na Vercel e não usa nada deste projeto. Esta pasta guarda o que serve para
conferir e regenerar o conteúdo dele.

## Versículos (`versiculos/`)

Todos os versículos do app vêm da **Almeida Revista e Corrigida, edição de Lisboa, 1911** (domínio público;
Projeto Gutenberg n.º 62383, pela transcrição estruturada de `mazza/biblia-arc1911`). Nenhum foi digitado de memória.

- `selecao.py` — as referências de cada conjunto (fases 1 a 4, recomeço, tentação, recompensa…).
- `baixar.py` — baixa o texto de 1911 de cada referência e grava `originais-1911.json` (fica guardado aqui, então
  não é preciso internet para refazer o resto).
- `fonte.py` — lê o texto original de uma referência (`python3 fonte.py 'JOS 1:9'`).
