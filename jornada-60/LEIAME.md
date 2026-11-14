# Jornada 60

Um aplicativo pessoal, em um arquivo só (`index.html`), para ficar 60 dias sem algo que te prejudica, liberando
recompensas a cada marco de dias vencidos. Não usa internet e não envia nada para lugar nenhum.

## Como abrir

1. Guarde o `index.html` em uma pasta que você não vai mexer (por exemplo, `Documentos/Jornada 60`).
2. Dê dois cliques nele. Ele abre no navegador (Chrome, Edge ou Firefox).
3. Salve nos favoritos, para abrir sempre do mesmo jeito.

Na primeira vez o app faz seis perguntas rápidas (nome, compromisso, data de início, motivos, pessoa de confiança e
recompensas). Depois é só abrir todo dia e marcar “Venci hoje” ou “Recaí hoje”.

## Onde fica o meu progresso (leia isto)

O progresso fica guardado **dentro do navegador**, ligado a este arquivo. Por isso:

- use **sempre o mesmo navegador** e **não mude o arquivo de pasta nem de nome** (se precisar mudar, faça o backup
  antes e restaure depois);
- **não use aba anônima** e não mande o navegador “limpar dados de navegação/dados de sites”: isso apaga o progresso;
- **confira uma vez**: depois de configurar, feche a aba e abra o arquivo de novo. Deve aparecer o aviso
  “Tudo certo: este navegador está guardando o seu progresso”. Se o app voltar para a configuração, ou mostrar um
  aviso amarelo dizendo que não consegue guardar, esse navegador não serve: use outro.

**No celular:** a tela foi feita primeiro para o celular, mas cada navegador de celular trata arquivos locais de um
jeito, e isso eu não consegui testar em um aparelho de verdade. No Android, abra o arquivo pelo aplicativo de arquivos
escolhendo o Chrome e faça a conferência acima (fechar e abrir). No iPhone, o Safari não guarda dados de arquivos
abertos assim; para usar no iPhone o arquivo precisa estar em um endereço na internet (os dados continuam só no
aparelho). Em qualquer caso, quem garante o progresso é o backup.

## Como fazer backup

- Toque na **engrenagem** (canto de cima) → **Baixar backup**. O app baixa um arquivo
  `jornada60-backup-AAAA-MM-DD.json`. Guarde fora do aparelho: mande para o seu e-mail, salve na nuvem ou em um pendrive.
  Se o download não funcionar, a mesma janela mostra o backup em texto para copiar e colar em um lugar seguro.
- A cada 7 dias sem backup o app lembra, com um aviso discreto na tela inicial.
- Para **restaurar**: engrenagem → **Restaurar backup** e escolha o arquivo (ou cole o texto). Em um navegador novo,
  a primeira tela tem o atalho “Já tenho um backup: restaurar”.
- **Trocar de aparelho ou de navegador** é isto: baixar o backup no antigo e restaurar no novo.
- **Reiniciar jornada** (engrenagem → Reiniciar jornada…) apaga os check-ins e pede duas confirmações. Faça um
  backup antes.

## Como editar as mensagens

As mensagens ficam dentro do próprio `index.html`. Editar o arquivo **não apaga o progresso**.

1. Faça uma cópia do `index.html` antes (por segurança).
2. Abra o arquivo em um editor de texto simples: no Windows, botão direito → *Abrir com* → **Bloco de Notas**;
   no Mac, **TextEdit** (em *Formatar → Converter em Texto Simples*).
3. Procure por `BANCO DE MENSAGENS`. Logo abaixo estão os conjuntos, cada um com o seu título:
   `fase1` (dias 1–7), `fase2` (8–21), `fase3` (22–40), `fase4` (41–60), `recomeco` (dia seguinte a uma recaída),
   `recompensa` (dia em que uma recompensa é liberada), `tentacao` (botão “Estou sendo tentado”), `queda`, `vitoria`
   e `final`.
4. Cada entrada tem este formato:

   ```
   {
     ref: "Josué 1:9",
     versiculo: "texto do versículo",
     mensagem: "a mensagem do dia",
     missao: "a missão prática"
   },
   ```

   - mexa só no texto que está **entre as aspas duplas**;
   - não use aspas duplas `"` dentro do texto (use “assim” ou 'assim');
   - para **acrescentar** uma entrada, copie um bloco inteiro, de `{` até `},`, cole logo abaixo e troque os textos;
   - para **tirar** uma entrada, apague o bloco inteiro, de `{` até `},` (deixe pelo menos uma em cada conjunto).
5. Salve e abra o `index.html` de novo. Se alguma coisa ficou errada (uma vírgula ou aspas faltando), o app continua
   abrindo, mostra um aviso com a linha aproximada do erro e usa mensagens de reserva: desfaça a última alteração.

Os versículos são da tradução de João Ferreira de Almeida, edição Revista e Corrigida de 1911 (domínio público), com a
ortografia atualizada e conferidos um a um na fonte. Se for trocar ou acrescentar um versículo, copie o texto de uma
Bíblia, sem adaptar.

## Modo de teste (para experimentar sem mexer nos seus dados)

Abra o arquivo e acrescente `?hoje=2026-12-01` no fim do endereço (na barra do navegador), trocando pela data que
quiser simular. Aparece uma faixa “Modo de teste”, com botões para avançar e voltar um dia. Tudo o que você fizer ali
fica separado do seu progresso de verdade. Para sair, toque em “sair” na faixa.
