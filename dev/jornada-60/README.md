# Jornada 60 — ferramentas

O app em si é um arquivo só: `jornada-60/index.html` (mais o `jornada-60/LEIAME.md`, que é o guia do dono). Ele não
faz parte do painel Central de Avatares: não é publicado na Vercel, não usa nada deste projeto e não tem build.
Esta pasta guarda o que serve para conferir o conteúdo e testar o app.

**Quem manda é o `index.html`.** O dono pode editar as mensagens à mão dentro dele (o LEIAME ensina). Nada aqui
regenera o arquivo: as ferramentas só leem e conferem.

## Testes (`testes/`)

Abrem o `index.html` direto do disco (`file://`), como o dono abre, com o Chromium do Playwright.

```bash
node dev/jornada-60/testes/todos.cjs
```

| Arquivo | O que confere |
|---|---|
| `contas.cjs` | datas (dia a dia, 2019–2032) e contas da jornada contra uma referência escrita à parte; liberação de recompensas |
| `fluxos.cjs` | primeira abertura, check-in, pendentes, recaída, correções, virada da meia-noite, dia 60, backup, reinício |
| `mensagens.cjs` | o banco **dentro do `index.html`**: cada versículo igual ao texto conferido, tamanhos, fases, sorteio sem repetição, banco quebrado |
| `tentacao.cjs` | passo a passo do botão “Estou sendo tentado”, com o relógio controlado nos 90 segundos |
| `robustez.cjs` | relógio de verdade às 23h30 em São Paulo, dados ilegíveis, navegador que não salva, só teclado, telas de 320–390 px, duas abas |
| `revisao.cjs` | os casos achados por uma revisão independente do código: janela de confirmação aberta na virada do dia, toque duplo (o segundo toque não vale no botão que apareceu embaixo do dedo), “Tirar a marcação” de hoje, restaurar backup na tela de dados ilegíveis, dados gravados por outra aba ou por uma versão mais nova, backup adulterado, banco quebrado por um dia |
| `acessibilidade.cjs` | contraste de cada texto visível (mínimo 4,5:1; 3:1 em texto grande), nome de cada botão e rótulo de cada campo, em 37 telas e janelas |
| `pasta-com-acentos.cjs` | o arquivo guardado em uma pasta com espaços e acentos abre e salva igual |
| `fotos.cjs`, `fotos-extra.cjs`, `fotos-entrega.cjs` | não são testes: fotografam as telas (`celular` ou `computador`) em `capturas/` para a conferência visual |

O modo de teste do app (`index.html?hoje=AAAA-MM-DD`) simula a data e usa a chave `jornada60:teste` do
localStorage; só nesse modo existe `window.__j60` (ganchos usados pelos testes).

Um teste novo só vale se **falhar no app sem a correção**. Para conferir, rode-o contra a versão anterior:

```bash
git show HEAD:jornada-60/index.html > /tmp/j60-anterior.html
```

```bash
J60_ARQUIVO=/tmp/j60-anterior.html node dev/jornada-60/testes/revisao.cjs
```

Duas regras do app que os testes precisam respeitar: uma tela ou janela que acabou de aparecer não aceita toque por
um instante (0,35 s; os botões do check-in, 0,6 s) e o segundo clique de um clique duplo é ignorado. O `click` do
Playwright espera o botão aceitar toques; **não use `{ force: true }`** nem `dblclick` para “apertar duas vezes”.

## Versículos (`versiculos/`)

Todos os versículos do app vêm da **Almeida Revista e Corrigida, edição de Lisboa, 1911** (domínio público;
Projeto Gutenberg n.º 62383, pela transcrição estruturada de `mazza/biblia-arc1911`). Nenhum foi digitado de memória.

- `selecao.py` — as referências de cada conjunto (fases 1 a 4, recomeço, tentação, recompensa…) e as reservas.
- `baixar.py` — baixa o texto de 1911 de cada referência e grava `originais-1911.json` (fica guardado aqui, então
  não é preciso internet para refazer o resto).
- `fonte.py` — lê o texto original de uma referência (`python3 fonte.py 'JOS 1:9'`).
- `propor.py` + `decisoes.py` — a edição de 1911 usa a grafia da época (*n’aquelle*, *peccado*, *animo*). Estes dois
  propõem a escrita de hoje **palavra por palavra** (nunca trocam uma palavra por outra) e mostram o que precisa de
  decisão. O resultado conferido fica congelado em `grafia.json` (cada troca, uma a uma).
- `montar.py` — aplica `grafia.json` e grava `versiculos.json` (o texto que foi para o app). Além da grafia, só faz
  ajustes mecânicos, todos listados na saída: minúscula ao juntar versículos seguidos, maiúscula depois de `?`,
  ponto final no fim do trecho e o “por que” interrogativo de Neemias 6:3.
- `conferir_gutenberg.py` — conferência independente: cada versículo extraído tem de aparecer, igual e com o mesmo
  número, no arquivo bruto do Projeto Gutenberg (`pg62383.txt`, 5 MB, que não fica no repositório).

Nomes próprios raros ficaram como na edição de 1911 (*Mispah*, *Sen*, *Eben-ezer*).

Para acrescentar um versículo novo ao app: ponha a referência em `selecao.py`, rode `baixar.py`, `propor.py`
(decida as palavras novas em `decisoes.py`), `propor.py --gravar` e `montar.py`; copie o texto de `versiculos.json`
para o bloco do `index.html` e rode `testes/mensagens.cjs`.

## Mensagens (`mensagens/`)

`banco.py` é o texto de origem das mensagens e missões, e `gerar_bloco.py` conferiu e montou o bloco que foi colado
no `index.html` **na primeira vez**. Ficam aqui só como registro: depois disso, o que vale é o que está no arquivo.
