# Referências escolhidas para cada conjunto (código USFM).
FASE1 = ['JOS 1:9', 'DEU 30:19', 'PSA 37:5', 'MAT 6:34', 'ISA 43:18-19', 'PRO 3:5-6', '1CO 16:13', 'EPH 6:10',
         'PSA 27:1', 'ECC 4:9-10', 'LUK 9:62', 'ROM 13:12', 'PSA 119:105', 'ISA 40:29', 'DAN 1:8', 'PSA 16:8',
         'MAT 5:37', 'DEU 31:8', 'ISA 41:10', 'PHP 4:13', 'PSA 51:10', '2TI 1:7', 'PSA 143:8', 'JAS 1:22']
FASE2 = ['1CO 10:13', 'JAS 4:7', 'MAT 26:41', 'ROM 12:2', 'GAL 5:1', 'PRO 25:28', 'PSA 119:11', '1CO 9:25-27',
         'PRO 16:32', 'ROM 6:14', 'PRO 4:23', 'PSA 90:12', 'LUK 16:10', 'PRO 13:20', 'EPH 5:15-16', '1CO 6:12',
         'DAN 6:10', 'PHP 4:8', 'PRO 22:3', '1CO 10:12', 'PRO 4:25-27', 'HEB 3:13', 'MRK 1:35', '2TI 2:22']
FASE3 = ['GAL 6:9', 'HEB 12:11', 'ISA 40:31', 'ROM 8:37', 'PHP 1:6', 'PSA 40:1-2', '2CO 12:9', 'ROM 5:3-4',
         'HEB 10:35-36', '1CO 15:58', '2CO 4:16', 'PSA 27:14', 'PSA 126:5-6', 'ISA 43:2', 'MAT 11:28-30', 'ECC 7:8',
         'NEH 6:3', '1SA 7:12', 'HEB 12:1', 'JHN 15:5', 'PSA 73:26', '2CO 4:8-9']
FASE4 = ['2CO 5:17', 'JHN 8:36', 'PHP 3:13-14', 'EPH 2:10', '1PE 2:9', '1CO 9:24', 'EZK 36:26', 'ISA 43:1',
         'ROM 6:22', 'GAL 5:22-23', 'COL 2:6-7', 'JHN 8:31-32', '1JN 5:4', 'JER 29:11', 'PSA 40:3', 'EPH 5:8',
         'GAL 4:7', 'GAL 5:13', 'REV 3:11', 'HEB 12:2', '2CO 3:18', 'LUK 22:32']
RECOMECO = ['PRO 24:16', 'LAM 3:22-23', '1JN 1:9', 'MIC 7:8', 'PSA 37:23-24', 'PSA 103:13-14', 'ISA 44:22',
            'ROM 8:1', 'PSA 30:5', 'JER 8:4', 'HEB 4:16', 'LUK 15:20']
QUEDA = ['PSA 145:14', 'ISA 42:3', 'PSA 34:18', '2TI 2:13']
TENTACAO = ['1CO 10:13', 'JAS 4:7', 'HEB 2:18', 'PSA 46:1', 'PRO 18:10', 'PSA 50:15', '1JN 4:4', 'PSA 61:2-3',
            'HEB 4:15', 'PSA 94:18-19', '2TH 3:3', 'EPH 6:13']
VITORIA_TENTACAO = ['PSA 124:7']
RECOMPENSA = ['2CH 15:7', 'PSA 128:2', 'PRO 13:12', 'ECC 2:24', 'PSA 126:3', 'JAS 1:17', 'PSA 118:24', 'MAT 25:21',
              'PSA 103:2', 'PHP 4:4']
FINAL = ['2TI 4:7']
# Reservas: já conferidas e prontas para uso, mas fora do app por enquanto.
RESERVA = ['PSA 23:4', 'ROM 8:31', 'MAT 24:13', 'PSA 55:22', 'PRO 4:18', 'JHN 16:33', 'PRO 24:10', 'ROM 6:11',
           'PHP 3:12', 'JUD 1:24-25', 'PSA 18:32-33', '1CO 15:57', 'REV 21:5', 'JER 17:7-8', 'PSA 30:11', 'PSA 138:8',
           'PSA 138:3', 'GAL 5:16', 'PSA 25:15', 'NAM 1:7', 'JAS 5:16', 'ECC 4:12', 'PRO 27:17', 'PSA 5:3',
           'JAS 1:12', '1PE 5:8-9', 'PRO 4:14-15', 'COL 3:2', 'PSA 28:7', 'HEB 10:23', 'PSA 31:24', 'PHP 2:13',
           '1TH 5:24', 'MAT 5:16', '1TH 5:18', '1CO 3:8', 'PSA 37:4', 'PSA 121:1-2', 'ISA 26:3', '1PE 5:7',
           'PSA 86:5', '1JN 2:1', 'ISA 43:25', 'JHN 8:11', 'PSA 103:12', 'PSA 34:17', 'MAT 6:13', 'PSA 1:3',
           'PSA 1:1-2', 'EPH 4:1', 'ROM 6:18', 'DEU 8:2', 'PSA 27:14']
CONJUNTOS = {'fase1': FASE1, 'fase2': FASE2, 'fase3': FASE3, 'fase4': FASE4, 'recomeco': RECOMECO, 'queda': QUEDA,
             'tentacao': TENTACAO, 'vitoria': VITORIA_TENTACAO, 'recompensa': RECOMPENSA, 'final': FINAL,
             'reserva': RESERVA}
def todas():
    vistas, out = set(), []
    for refs in CONJUNTOS.values():
        for r in refs:
            if r not in vistas:
                vistas.add(r); out.append(r)
    return out
