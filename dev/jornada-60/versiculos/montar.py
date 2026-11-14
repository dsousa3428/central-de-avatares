"""Monta o texto final de cada referência escolhida e grava versiculos.json.

Passos (todos mecânicos e registrados na saída):
  1. texto de 1911 (originais-1911.json), versículo por versículo;
  2. ortografia de hoje pela tabela conferida (ortografia.py);
  3. junção de versículos seguidos: quando o anterior não termina a frase (vírgula, ponto e vírgula, dois pontos),
     o seguinte começa com minúscula;
  4. maiúscula depois de ? e ! ; ponto final no lugar de vírgula/ponto e vírgula/dois pontos no fim do trecho;
  5. ajustes por contexto listados em CONTEXTO (hoje só o "por que" interrogativo).
"""
import json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fonte, selecao, ortografia

AQUI = os.path.dirname(os.path.abspath(__file__))
# Nomes que continuam com maiúscula mesmo no meio da frase, ao juntar versículos.
NOMES = ('Deus', 'Senhor', 'Jesus', 'Cristo', 'Espírito', 'Pai', 'Filho', 'Israel')
# (referência) -> lista de (trecho como ficou, trecho corrigido): convenções que dependem do contexto.
CONTEXTO = {
    'NEH 6:3': [('descer: porque cessaria', 'descer: por que cessaria')],
}

def montar(ref, avisos=None):
    partes = [ortografia.atualizar(p) for p in fonte.texto_original(ref)]
    texto = partes[0]
    for p in partes[1:]:
        if texto[-1] in ',;:' and not p.startswith(NOMES):
            if avisos is not None:
                avisos.append('%s: junção com minúscula: "...%s %s..."' % (ref, texto[-18:], p[:14]))
            p = p[0].lower() + p[1:]
        texto += ' ' + p
    def maiuscula(m):
        if avisos is not None:
            avisos.append('%s: maiúscula depois de "%s": %s' % (ref, m.group(1), m.group(2)))
        return m.group(1) + ' ' + m.group(2).upper()
    texto = re.sub(r'([?!]) ([a-zà-ÿ])', maiuscula, texto)
    for de, para in CONTEXTO.get(ref, []):
        if de not in texto:
            raise ValueError('%s: trecho de contexto não encontrado: %r' % (ref, de))
        texto = texto.replace(de, para)
        if avisos is not None:
            avisos.append('%s: contexto: %r -> %r' % (ref, de, para))
    if texto[-1] in ',;:':
        if avisos is not None:
            avisos.append('%s: ponto final no lugar de "%s"' % (ref, texto[-1]))
        texto = texto[:-1] + '.'
    elif texto[-1] not in '.?!':
        if avisos is not None:
            avisos.append('%s: ponto final acrescentado' % ref)
        texto += '.'
    return texto

def main():
    avisos, saida = [], {}
    for nome, refs in selecao.CONJUNTOS.items():
        for ref in refs:
            if ref not in saida:
                saida[ref] = {'ref': fonte.nome_ref(ref), 'texto': montar(ref, avisos)}
    with open(os.path.join(AQUI, 'versiculos.json'), 'w', encoding='utf-8') as f:
        json.dump(saida, f, ensure_ascii=False, indent=1)
        f.write('\n')
    if '--ver' in sys.argv:
        for nome, refs in selecao.CONJUNTOS.items():
            print('\n##### %s (%d)' % (nome, len(refs)))
            for ref in refs:
                print('%s — %s' % (saida[ref]['ref'], saida[ref]['texto']))
    print('\n--- ajustes mecânicos (%d):' % len(avisos))
    for a in avisos:
        print(' ', a)
    print('\nversiculos.json: %d referências' % len(saida))

if __name__ == '__main__':
    main()
