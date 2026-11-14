"""Escreve o texto de 1911 com a ortografia de hoje, palavra por palavra, pela tabela conferida (grafia.json).

Nenhuma palavra é trocada por outra: só muda a forma de escrever (n’aquelle -> naquele, peccado -> pecado).
Palavra que não está na tabela (nem na lista das que ficam iguais) interrompe a montagem: precisa de decisão.
"""
import json, os, re

AQUI = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(AQUI, 'grafia.json'), encoding='utf-8') as f:
    _g = json.load(f)
TROCAS, IGUAIS = _g['trocas'], set(_g['iguais'])
LETRAS = "A-Za-zÀ-ÖØ-öø-ÿ"
RE_TOKEN = re.compile(r"[%s’'\-]+|[^%s’'\-]+" % (LETRAS, LETRAS))

def com_caixa(original, novo):
    if len(original) > 1 and original.isupper():
        return novo.upper()
    if original[0].isupper():
        return novo[0].upper() + novo[1:]
    return novo

def palavra(tok):
    chave = tok.lower().replace("'", '’')
    if chave in TROCAS:
        return com_caixa(tok, TROCAS[chave])
    if chave in IGUAIS:
        return tok
    raise KeyError('palavra sem decisão de grafia: %r (rode propor.py)' % tok)

def atualizar(texto):
    return ''.join(palavra(t) if re.match(r"[%s’']" % LETRAS, t) else t for t in RE_TOKEN.findall(texto))
