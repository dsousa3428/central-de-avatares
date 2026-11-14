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
- `propor.py` + `decisoes.py` — a edição de 1911 usa a grafia da época (*n’aquelle*, *peccado*, *animo*). Estes dois
  propõem a escrita de hoje **palavra por palavra** (nunca trocam uma palavra por outra) e mostram o que precisa de
  decisão. O resultado conferido fica congelado em `grafia.json` (cada troca, uma a uma).
- `montar.py` — aplica `grafia.json` e grava `versiculos.json` (o texto que vai para o app). Além da grafia, só faz
  ajustes mecânicos, todos listados na saída: minúscula ao juntar versículos seguidos, maiúscula depois de `?`,
  ponto final no fim do trecho e o "por que" interrogativo de Neemias 6:3.
- `conferir_gutenberg.py` — conferência independente: cada versículo extraído tem de aparecer, igual e com o mesmo
  número, no arquivo bruto do Projeto Gutenberg (`pg62383.txt`, 5 MB, que não fica no repositório).

Nomes próprios raros ficaram como na edição de 1911 (*Mispah*, *Sen*, *Eben-ezer*).
