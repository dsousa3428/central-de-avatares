"""Propõe a atualização da ortografia de cada palavra dos versículos escolhidos e mostra o que precisa de decisão.

Ferramenta de apoio (opcional): precisa do dicionário atual, que não fica no repositório:
    pip install spylls ; npm install dictionary-pt ; copie index.aff/index.dic como pt.aff/pt.dic
    J60_DIC=/pasta/com/pt.aff python3 propor.py            -> relatório
    J60_DIC=/pasta/com/pt.aff python3 propor.py --gravar   -> grava grafia.json (depois de revisar!)
A montagem final (ortografia.py) usa só o grafia.json já conferido — não precisa de dicionário.
"""
import json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fonte, selecao
from decisoes import EXPLICITO, MANTER
from spylls.hunspell import Dictionary

DIC = Dictionary.from_files(os.path.join(os.environ.get('J60_DIC', '.'), 'pt'))
LETRAS = "A-Za-zÀ-ÖØ-öø-ÿ"
RE_PALAVRA = re.compile(r"[%s’'\-]+" % LETRAS)
VAR = {'a': 'áâãà', 'e': 'éê', 'i': 'í', 'o': 'óôõ', 'u': 'ú', 'c': 'ç'}
REGRAS = [
    (r'^christ', 'crist'), (r'ph', 'f'), (r'th', 't'), (r'rh', 'r'), (r'y', 'i'), (r'cç', 'ç'),
    (r'll', 'l'), (r'tt', 't'), (r'pp', 'p'), (r'ff', 'f'), (r'mm', 'm'), (r'nn', 'n'), (r'cc', 'c'),
    (r'bb', 'b'), (r'dd', 'd'), (r'gg', 'g'), (r'aes$', 'ais'), (r'ae$', 'ai'),
]
MESOCLISE = {'hei': 'ei', 'has': 'ás', 'ha': 'á', 'hemos': 'emos', 'heis': 'eis', 'hão': 'ão'}

def ok(w):
    try:
        return DIC.lookup(w)
    except Exception:
        return False

def valida(w):
    if ok(w) or ok(w.lower()):
        return True
    partes = [p for p in w.split('-') if p]
    return len(partes) > 1 and all(ok(p) or ok(p.lower()) for p in partes)

def variantes(w):
    out = []
    for i, ch in enumerate(w):
        for x in VAR.get(ch, ''):
            c = w[:i] + x + w[i + 1:]
            if ok(c) and c not in out:
                out.append(c)
    return out

def parte(w):
    if w in EXPLICITO:
        return EXPLICITO[w], 'explicito'
    if w in MANTER:
        return w, 'manter'
    r = w
    for pad, sub in REGRAS:
        r = re.sub(pad, sub, r)
    v, vs = valida(r), variantes(r)
    if v and not vs:
        return r, ('igual' if r == w else 'regra')
    if v and vs:
        return r, ('regra+ambigua' if r != w else 'ambigua') + '(' + ','.join(vs) + ')'
    if not v and len(vs) == 1:
        return vs[0], 'acento'
    return r, 'INVALIDA' + ('(' + ','.join(vs) + ')' if vs else '')

def palavra(tok):
    chave = tok.lower().replace("'", '’')
    if chave in EXPLICITO:
        return EXPLICITO[chave], 'explicito'
    if chave in MANTER:
        return chave, 'manter'
    if '’' in chave:
        return chave, 'INVALIDA(apostrofo)'
    if '-' in chave:
        ps = chave.split('-')
        novas, sits = [], []
        for i, p in enumerate(ps):
            if i == len(ps) - 1 and i >= 2 and p in MESOCLISE:
                novas.append(MESOCLISE[p]); sits.append('regra'); continue
            n, s = parte(p)
            novas.append(n); sits.append(s)
        novo = '-'.join(novas)
        pior = next((s for s in sits if s.startswith('INVALIDA')), None) or \
            ('regra' if novo != chave else next((s for s in sits if 'ambigua' in s), 'igual'))
        return novo, pior
    return parte(chave)

def main():
    tabela = {}
    for ref in selecao.todas():
        for texto in fonte.texto_original(ref):
            for tok in RE_PALAVRA.findall(texto):
                chave = tok.lower().replace("'", '’')
                if chave not in tabela:
                    tabela[chave] = palavra(tok) + ([],)
                if ref not in tabela[chave][2]:
                    tabela[chave][2].append(ref)
    if '--gravar' in sys.argv:
        pendentes = [k for k, (n, s, _) in tabela.items() if s.startswith('INVALIDA')]
        if pendentes:
            sys.exit('Ainda há palavras sem decisão: ' + ', '.join(sorted(pendentes)))
        trocas = {k: n for k, (n, s, _) in sorted(tabela.items()) if n != k}
        iguais = sorted(k for k, (n, s, _) in tabela.items() if n == k)
        with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'grafia.json'), 'w', encoding='utf-8') as f:
            json.dump({'trocas': trocas, 'iguais': iguais}, f, ensure_ascii=False, indent=1)
            f.write('\n')
        print('grafia.json: %d trocas, %d palavras iguais' % (len(trocas), len(iguais)))
        return
    grupos = {}
    for k, (n, s, refs) in tabela.items():
        grupos.setdefault(s.split('(')[0], []).append((k, n, s, refs))
    for g in ['INVALIDA', 'regra+ambigua', 'ambigua', 'acento', 'regra', 'explicito', 'manter', 'igual']:
        itens = sorted(grupos.get(g, []))
        print('\n=== %s (%d)' % (g, len(itens)))
        if g in ('igual', 'ambigua'):
            print(' '.join(k if g == 'igual' else '%s%s' % (k, s[len(g):]) for k, n, s, r in itens))
        else:
            for k, n, s, r in itens:
                print('%-22s -> %-22s %s  [%s]' % (k, n, s if g != 'explicito' else '', ', '.join(r[:3])))

if __name__ == '__main__':
    main()
