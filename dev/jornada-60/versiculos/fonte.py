"""Texto original da Almeida Revista e Corrigida (Lisboa, 1911), por referência.

1) procura em originais-1911.json (já extraído e guardado aqui no repositório);
2) se não achar, baixa o capítulo do repositório público mazza/biblia-arc1911
   (transcrição do Projeto Gutenberg n.º 62383, domínio público) e extrai o versículo.

Nada do texto é alterado aqui: só saem as chamadas de nota e a marca de itálico.
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import json, os, re, subprocess, sys, tempfile, time
from livros import LIVROS

AQUI = os.path.dirname(os.path.abspath(__file__))
BASE = 'https://raw.githubusercontent.com/mazza/biblia-arc1911/main/canon'
CACHE = os.environ.get('J60_CACHE') or os.path.join(tempfile.gettempdir(), 'j60-arc1911')
ARQ_ORIGINAIS = os.path.join(AQUI, 'originais-1911.json')

_originais = None

def originais():
    global _originais
    if _originais is None:
        if os.path.exists(ARQ_ORIGINAIS):
            with open(ARQ_ORIGINAIS, encoding='utf-8') as f:
                _originais = json.load(f)
        else:
            _originais = {}
    return _originais

def analisar_ref(ref):
    m = re.fullmatch(r'([1-3]?[A-Z]{2,3}) (\d+):(\d+)(?:-(\d+))?', ref.strip())
    if not m:
        raise ValueError('referência inválida: ' + ref)
    livro, cap, v1, v2 = m.group(1), int(m.group(2)), int(m.group(3)), m.group(4)
    if livro not in LIVROS:
        raise ValueError('livro desconhecido: ' + ref)
    return livro, cap, v1, int(v2) if v2 else v1

def obter_capitulo(livro, cap):
    pasta = LIVROS[livro][0]
    arq = (('%03d' if livro == 'PSA' else '%02d') % cap) + '.md'
    os.makedirs(CACHE, exist_ok=True)
    destino = os.path.join(CACHE, pasta + '_' + arq)
    if not os.path.exists(destino) or os.path.getsize(destino) < 50:
        url = '%s/%s/%s' % (BASE, pasta, arq)
        for tentativa in range(4):
            r = subprocess.run(['curl', '-sS', '-m', '30', '-f', '-o', destino, url], capture_output=True, text=True)
            if r.returncode == 0:
                break
            time.sleep(2 * (tentativa + 1))
        else:
            raise RuntimeError('falha ao baixar ' + url + ': ' + r.stderr)
        time.sleep(0.15)
    with open(destino, encoding='utf-8') as f:
        return f.read()

def limpar(texto):
    texto = re.sub(r'\s*\[\^[^\]]+\]\s*', ' ', texto)   # chamadas de nota
    texto = texto.replace('*', '')                         # itálico (palavras supridas pelos tradutores)
    texto = re.sub(r'\s+', ' ', texto).strip()
    texto = re.sub(r' ([,;:.!?])', r'\1', texto)
    return texto

def versiculos_do_capitulo(md):
    vs = {}
    for par in re.split(r'\n\s*\n', md):
        m = re.match(r'\*\*(\d+)\*\*\s+(.*)', par.strip(), re.S)
        if m:
            vs[int(m.group(1))] = limpar(m.group(2))
    return vs

def baixar_ref(ref):
    livro, cap, v1, v2 = analisar_ref(ref)
    vs = versiculos_do_capitulo(obter_capitulo(livro, cap))
    partes = []
    for n in range(v1, v2 + 1):
        if n not in vs:
            raise KeyError('%s: versículo %d não encontrado' % (ref, n))
        partes.append(vs[n])
    return partes

def texto_original(ref):
    """Lista com o texto de 1911 de cada versículo da referência."""
    o = originais()
    if ref in o:
        return list(o[ref])
    return baixar_ref(ref)

def nome_ref(ref):
    livro, cap, v1, v2 = analisar_ref(ref)
    return '%s %d:%d' % (LIVROS[livro][1], cap, v1) + ('-%d' % v2 if v2 != v1 else '')

if __name__ == '__main__':
    for ref in sys.argv[1:]:
        print(nome_ref(ref), '=>', ' '.join(texto_original(ref)))
