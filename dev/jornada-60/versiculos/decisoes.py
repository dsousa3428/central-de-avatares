"""Decisões de ortografia revisadas à mão (chave em minúsculas, apóstrofo tipográfico ’).

Só a grafia muda: a palavra é a mesma do texto de 1911, escrita como se escreve hoje no Brasil.
Usado por propor.py; o resultado conferido fica congelado em grafia.json.
"""
EXPLICITO = {
    # contrações com apóstrofo
    'd’alguma': 'de alguma', 'd’antes': 'dantes', 'd’aquelle': 'daquele', 'd’aquelles': 'daqueles',
    'd’ellas': 'delas', 'd’elle': 'dele', 'd’elles': 'deles', 'd’ella': 'dela', 'd’isto': 'disto',
    'd’um': 'de um', 'd’uma': 'de uma', 'd’ámanhã': 'de amanhã', 'd’este': 'deste', 'd’esta': 'desta',
    'n’aquelle': 'naquele', 'n’aquillo': 'naquilo', 'n’ellas': 'nelas', 'n’elle': 'nele', 'n’ella': 'nela',
    'n’elles': 'neles', 'n’isso': 'nisso', 'n’isto': 'nisto', 'n’este': 'neste', 'n’esta': 'nesta',
    'n’um': 'num', 'n’uma': 'numa', 't’o': 'to', 'd’entre': 'dentre', 'd’além': 'dalém',
    # acentuação e crase
    'á': 'à', 'ás': 'às', 'áquelle': 'àquele', 'ha': 'há', 'has': 'hás', 'ahi': 'aí',
    'abstem': 'abstém', 'sustem': 'sustém', 'retem': 'retém', 'conveem': 'convêm', 'teem': 'têm',
    'aguias': 'águias', 'tres': 'três', 'fôr': 'for', 'sêde': 'sede', 'vêde': 'vede', 'sómente': 'somente',
    'corôa': 'coroa', 'prégando': 'pregando', 'escapámos': 'escapamos', 'amen': 'amém',
    'angustia': 'angústia', 'angustias': 'angústias', 'animo': 'ânimo', 'arvore': 'árvore', 'benção': 'bênção',
    'dadiva': 'dádiva', 'duvida': 'dúvida', 'ereis': 'éreis', 'espirito': 'espírito', 'estadio': 'estádio',
    'experiencia': 'experiência', 'fieis': 'fiéis', 'gloria': 'glória', 'impios': 'ímpios', 'intima': 'íntima',
    'lagrimas': 'lágrimas', 'lampada': 'lâmpada', 'licitas': 'lícitas', 'nevoa': 'névoa', 'pacifico': 'pacífico',
    'premio': 'prêmio', 'principio': 'princípio', 'refugio': 'refúgio', 'seculos': 'séculos', 'seculo': 'século',
    'irreprehensiveis': 'irrepreensíveis',
    # letras que mudaram (ç/s, z/s, x/s, g/j, e/i, o/u, grupos de consoantes)
    'cancemos': 'cansemos', 'cançado': 'cansado', 'cançados': 'cansados', 'cançarão': 'cansarão',
    'canceis': 'canseis', 'descanço': 'descanso', 'carmezim': 'carmesim', 'atraz': 'atrás', 'traz': 'trás',
    'detraz': 'detrás', 'azas': 'asas', 'poz': 'pôs', 'puz': 'pus', 'prosigo': 'prossigo', 'magestade': 'majestade',
    'dextra': 'destra', 'creados': 'criados', 'creado': 'criado', 'creatura': 'criatura', 'creou': 'criou',
    'logar': 'lugar', 'receiarei': 'recearei', 'judeos': 'judeus',
    'assignada': 'assinada', 'auctor': 'autor', 'condemnação': 'condenação', 'condemno': 'condeno',
    'directamente': 'diretamente', 'effectuar': 'efetuar', 'escriptura': 'escritura', 'escripto': 'escrito',
    'estructura': 'estrutura', 'eunuchos': 'eunucos', 'excepto': 'exceto', 'fructo': 'fruto', 'fructos': 'frutos',
    'hymno': 'hino', 'lucta': 'luta', 'prompto': 'pronto', 'recto': 'reto', 'reflectindo': 'refletindo',
    'sancta': 'santa', 'sancto': 'santo', 'sanctificação': 'santificação', 'victoria': 'vitória',
    # palavras que se juntavam ou separavam de outro jeito
    'bemaventurado': 'bem-aventurado', 'bemdito': 'bendito', 'bemdize': 'bendize', 'comsigo': 'consigo',
    'comtigo': 'contigo', 'comtudo': 'contudo', 'comvosco': 'convosco', 'emquanto': 'enquanto',
    'sobreedificados': 'sobre-edificados', 'exhortae-vos': 'exortai-vos',
    # nomes próprios (forma brasileira)
    'jacob': 'jacó',
}
# Ficam exatamente como estão no texto de 1911 (nomes próprios que o dicionário não conhece).
MANTER = {'daniel', 'samuel', 'mispah', 'sen', 'eben-ezer'}
