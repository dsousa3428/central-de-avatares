"""Confere o banco de origem (banco.py) e escreve o bloco de mensagens do index.html (bloco.js).

Só serve para a PRIMEIRA geração. Depois disso, quem manda é o index.html (o dono pode editar as mensagens lá):
para conferir o que está no arquivo, use ../conferir_banco.cjs.
"""
import json, os, re, sys
AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import banco

with open(os.path.join(AQUI, '..', 'versiculos', 'versiculos.json'), encoding='utf-8') as f:
    VERSICULOS = json.load(f)

TRADUCAO = 'João Ferreira de Almeida, edição Revista e Corrigida de 1911 (domínio público), com a ortografia atualizada'

CONJUNTOS = [
    # chave, lista, tem missão?, título do comentário
    ('fase1', banco.FASE1, True, 'FASE 1 — dias 1 a 7: decisão e firmeza'),
    ('fase2', banco.FASE2, True, 'FASE 2 — dias 8 a 21: resistir à tentação e criar novos hábitos'),
    ('fase3', banco.FASE3, True, 'FASE 3 — dias 22 a 40: perseverança no meio do caminho'),
    ('fase4', banco.FASE4, True, 'FASE 4 — dias 41 a 60: nova identidade e reta final'),
    ('recomeco', banco.RECOMECO, True, 'RECOMEÇO — aparece no dia seguinte a uma recaída'),
    ('recompensa', banco.RECOMPENSA, True, 'DIA DE RECOMPENSA — aparece no dia em que a vitória libera uma recompensa'),
    ('tentacao', banco.TENTACAO, False, 'HORA DA TENTAÇÃO — primeiro passo do botão "Estou sendo tentado"'),
    ('queda', banco.QUEDA, False, 'NA HORA DA RECAÍDA — aparece logo depois de marcar "Recaí hoje"'),
    ('vitoria', banco.VITORIA, False, 'TENTAÇÃO VENCIDA — aparece ao tocar em "Venci a tentação"'),
    ('final', banco.FINAL, False, 'DIA 60 — tela final'),
]

def frases(texto):
    return [p for p in re.findall(r'[^.!?]+[.!?]+[”’)]*', texto) if p.strip()]

def conferir():
    erros = []
    for chave, lista, tem_missao, _ in CONJUNTOS:
        refs, missoes = set(), set()
        for item in lista:
            ref, msg = item[0], item[1]
            if ref not in VERSICULOS:
                erros.append('%s: %s não está em versiculos.json' % (chave, ref))
            if ref in refs:
                erros.append('%s: referência repetida %s' % (chave, ref))
            refs.add(ref)
            textos = [msg] + ([item[2]] if tem_missao else [])
            for t in textos:
                if '"' in t or '\\' in t or '\n' in t or "'" in t:
                    erros.append('%s %s: aspas retas, barra ou quebra de linha no texto' % (chave, ref))
                if t != t.strip() or '  ' in t:
                    erros.append('%s %s: espaços sobrando' % (chave, ref))
            n = len(frases(msg))
            minimo = 2
            if not (minimo <= n <= 3):
                erros.append('%s %s: mensagem com %d frases' % (chave, ref, n))
            if tem_missao:
                if item[2] in missoes:
                    erros.append('%s %s: missão repetida' % (chave, ref))
                missoes.add(item[2])
    tam = {c: len(l) for c, l, _, _ in CONJUNTOS}
    if tam['fase1'] < 20 or tam['fase2'] < 20:
        erros.append('fases 1 e 2 precisam de 20 entradas ou mais')
    if tam['fase1'] + tam['fase2'] + tam['fase3'] + tam['fase4'] < 80:
        erros.append('as 4 fases precisam somar 80 ou mais')
    if tam['recomeco'] < 10 or tam['tentacao'] < 10 or tam['recompensa'] < 1:
        erros.append('conjuntos extras incompletos')
    return erros, tam

def js(texto):
    return json.dumps(texto, ensure_ascii=False)

def bloco():
    linhas = ['window.JORNADA60_BANCO = {', '', '  traducao: %s,' % js(TRADUCAO)]
    for chave, lista, tem_missao, titulo in CONJUNTOS:
        linhas += ['', '  // ' + '=' * 70, '  // %s (%d)' % (titulo, len(lista)), '  // ' + '=' * 70, '  %s: [' % chave]
        for item in lista:
            v = VERSICULOS[item[0]]
            linhas.append('    {')
            linhas.append('      ref: %s,' % js(v['ref']))
            linhas.append('      versiculo: %s,' % js(v['texto']))
            if tem_missao:
                linhas.append('      mensagem: %s,' % js(item[1]))
                linhas.append('      missao: %s' % js(item[2]))
            else:
                linhas.append('      mensagem: %s' % js(item[1]))
            linhas.append('    },')
        linhas.append('  ],')
    linhas += ['', '};']
    return '\n'.join(linhas) + '\n'

if __name__ == '__main__':
    erros, tam = conferir()
    for e in erros:
        print('ERRO:', e)
    print('tamanhos:', tam, '| 4 fases =', tam['fase1'] + tam['fase2'] + tam['fase3'] + tam['fase4'])
    if erros:
        sys.exit(1)
    with open(os.path.join(AQUI, 'bloco.js'), 'w', encoding='utf-8') as f:
        f.write(bloco())
    print('bloco.js gravado (%d linhas)' % bloco().count('\n'))
