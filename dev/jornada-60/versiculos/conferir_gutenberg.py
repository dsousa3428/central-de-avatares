"""Conferência independente: cada versículo extraído tem de aparecer, igual, no arquivo bruto do Projeto Gutenberg.

Uso:  python3 conferir_gutenberg.py /caminho/pg62383.txt
(o arquivo, de 5 MB, não fica no repositório: https://www.gutenberg.org/cache/epub/62383/pg62383.txt)
"""
import os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fonte

def normalizar(t):
    t = re.sub(r'\[[0-9A-Za-z]{1,4}\]', ' ', t)   # chamadas de nota: [13], [A], [AEX]
    t = t.replace('_', '')                          # itálico
    t = re.sub(r'\s+', ' ', t)
    t = re.sub(r' ([,;:.!?])', r'\1', t)
    return t.strip()

bruto = normalizar(open(sys.argv[1], encoding='utf-8').read())
ok = falhas = 0
for ref, versos in sorted(fonte.originais().items()):
    livro, cap, v1, v2 = fonte.analisar_ref(ref)
    for n, texto in zip(range(v1, v2 + 1), versos):
        limpo = normalizar(texto)
        # no arquivo bruto, o primeiro versículo de cada capítulo vem com o número do CAPÍTULO na frente
        alvos = ['%d %s' % (n, limpo)] + (['%d %s' % (cap, limpo)] if n == 1 else [])
        if any(a in bruto for a in alvos):
            ok += 1
        else:
            falhas += 1
            print('NÃO ACHEI  %s v.%d: %s' % (ref, n, texto[:90]))
print('%d versículos conferidos no arquivo do Gutenberg; %d não encontrados' % (ok, falhas))
