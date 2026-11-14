"""Baixa do texto de 1911 todas as referências da seleção (e as candidatas) e grava originais-1911.json.

Uso:  python3 baixar.py        (precisa de internet só para referências que ainda não estão no arquivo)
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import json, sys
import fonte, selecao

refs = list(selecao.todas())
for linha in open('candidatos.txt', encoding='utf-8'):
    linha = linha.strip()
    if linha and not linha.startswith('#') and linha not in refs:
        refs.append(linha)
refs += [r for r in sys.argv[1:] if r not in refs]

atuais = dict(fonte.originais())
novos = 0
for ref in refs:
    if ref not in atuais:
        atuais[ref] = fonte.baixar_ref(ref)
        novos += 1
with open(fonte.ARQ_ORIGINAIS, 'w', encoding='utf-8') as f:
    json.dump(dict(sorted(atuais.items())), f, ensure_ascii=False, indent=1)
    f.write('\n')
print('%d referências no arquivo (%d novas)' % (len(atuais), novos))
