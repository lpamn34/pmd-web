# 폼체인지·메가진화 모습을 js/data.js에 더한다 (스프라이트의 걷는 모습이 있는 것만).
# 이 모습들은 따로 나오는 포켓몬이 아니라, 원래 포켓몬이 던전에서 잠깐 바뀌는 모습이다 (species.fc 로 표시).
#   fc: 'item'(지닌 도구로) · 'mega'(메가스톤) · 'select'(마을에서 골라 둔다) · 'battle'(특성·기술로 던전에서 바뀜)
# 기술과 기술머신은 원래 포켓몬을 따른다. 능력치·타입·특성은 그 모습의 것.
# 초상화가 없는 모습은 원래 포켓몬의 초상화를 쓴다 (sprites.js).
# 번호는 tools/form_ids.json에 고정 (리전폼 뒤에 이어서).
#
# 사용법: python tools/build_altforms.py <재료 폴더>   (build_forms.py와 같은 재료 + pokemon_forms.csv, pokemon_form_names.csv)
import csv, json, os, re, sys, collections

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = sys.argv[1]
R = lambda f: list(csv.DictReader(open(os.path.join(SRC, f + '.csv'), encoding='utf8')))
I = lambda x, d=0: int(x) if str(x).lstrip('-').isdigit() else d

raw = open(os.path.join(ROOT, 'js', 'data.js'), encoding='utf8').read()
DATA = json.loads(raw[raw.index('=') + 1:].rstrip().rstrip(';'))
species = DATA['species']
ids_path = os.path.join(ROOT, 'tools', 'form_ids.json')
FORM_IDS = json.load(open(ids_path, encoding='utf8'))

# 트래커 모습 이름 → (포켓API 이름, 종류, 한국어 모습 이름(없으면 포켓API))
ALT = {
    ('castform', 'Sunny'): ('castform-sunny', 'battle', None), ('castform', 'Rainy'): ('castform-rainy', 'battle', None), ('castform', 'Snowy'): ('castform-snowy', 'battle', None),
    ('deoxys', 'Attack'): ('deoxys-attack', 'select', None), ('deoxys', 'Defense'): ('deoxys-defense', 'select', None), ('deoxys', 'Speed'): ('deoxys-speed', 'select', None),
    ('wormadam', 'Sand'): ('wormadam-sandy', 'select', None), ('wormadam', 'Trash'): ('wormadam-trash', 'select', None),
    ('rotom', 'Heat'): ('rotom-heat', 'select', None), ('rotom', 'Wash'): ('rotom-wash', 'select', None), ('rotom', 'Frost'): ('rotom-frost', 'select', None),
    ('rotom', 'Fan'): ('rotom-fan', 'select', None), ('rotom', 'Mow'): ('rotom-mow', 'select', None),
    ('giratina', 'Origin'): ('giratina-origin', 'item', None), ('dialga', 'Origin'): ('dialga-origin', 'item', '오리진폼'), ('palkia', 'Origin'): ('palkia-origin', 'item', '오리진폼'),
    ('shaymin', 'Sky'): ('shaymin-sky', 'select', None), ('darmanitan', 'Zen'): ('darmanitan-zen', 'battle', None),
    ('kyurem', 'Black'): ('kyurem-black', 'select', None), ('kyurem', 'White'): ('kyurem-white', 'select', None),
    ('meloetta', 'Pirouette'): ('meloetta-pirouette', 'battle', None), ('aegislash', 'Blade'): ('aegislash-blade', 'battle', None),
    ('zygarde', '10'): ('zygarde-10', 'select', None), ('zygarde', 'Complete'): ('zygarde-complete', 'battle', None),
    ('hoopa', 'Unbound'): ('hoopa-unbound', 'select', None), ('lycanroc', 'Midnight'): ('lycanroc-midnight', 'select', None), ('lycanroc', 'Dusk'): ('lycanroc-dusk', 'select', None),
    ('wishiwashi', 'School'): ('wishiwashi-school', 'battle', None),
    ('eiscue', 'Noice'): ('eiscue-noice', 'battle', None), ('morpeko', 'Hangry'): ('morpeko-hangry', 'battle', None),
    ('zacian', 'Crowned_Sword'): ('zacian-crowned', 'item', None), ('zamazenta', 'Crowned_Shield'): ('zamazenta-crowned', 'item', None),
    ('palafin', 'Hero'): ('palafin-hero', 'battle', '마이티폼'),
    ('ogerpon', 'Wellspring'): ('ogerpon-wellspring-mask', 'item', None), ('ogerpon', 'Hearthflame'): ('ogerpon-hearthflame-mask', 'item', None),
    ('ogerpon', 'Cornerstone'): ('ogerpon-cornerstone-mask', 'item', None),
    ('terapagos', 'Terastal'): ('terapagos-terastal', 'battle', '테라스탈폼'),
    ('kyogre', 'Primal'): ('kyogre-primal', 'item', None), ('groudon', 'Primal'): ('groudon-primal', 'item', None),
}
for c in ['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Indigo', 'Violet']:
    ALT[('minior', c)] = ('minior-' + c.lower(), 'battle', None)
# 원시회귀는 도구(쪽빛구슬·주홍구슬), 메가진화는 이름으로 자동 처리 (Mega, Mega_X, Mega_Y)

t = json.load(open(os.path.join(SRC, 'tracker.json'), encoding='utf8'))
names = {}
for line in open(os.path.join(SRC, 'credit_names.txt'), encoding='utf8').read().splitlines()[1:]:
    p = line.split('\t')
    if len(p) >= 2: names[p[1]] = p[0]
cname = lambda x: names.get(x, re.sub(r'[<@!>]', '', x))
EM = {'Normal': 'N', 'Happy': 'H', 'Pain': 'P', 'Determined': 'D', 'Joyous': 'J', 'Sad': 'S', 'Angry': 'A', 'Dizzy': 'Z', 'Surprised': 'U', 'Crying': 'C', 'Worried': 'W'}

sp_rows = {int(r['id']): r for r in R('pokemon_species')}
ko_species = {int(r['pokemon_species_id']): r['name'] for r in R('pokemon_species_names') if r['local_language_id'] == '3'}
en_species = {int(r['pokemon_species_id']): r['name'] for r in R('pokemon_species_names') if r['local_language_id'] == '9'}
poke = {r['identifier']: r for r in R('pokemon')}
pforms = {r['identifier']: r for r in R('pokemon_forms')}
form_ko = {r['pokemon_form_id']: r['form_name'] for r in R('pokemon_form_names') if r['local_language_id'] == '3'}
form_en = {r['pokemon_form_id']: r['form_name'] for r in R('pokemon_form_names') if r['local_language_id'] == '9'}
stats = collections.defaultdict(lambda: [0] * 6)
for r in R('pokemon_stats'): stats[int(r['pokemon_id'])][int(r['stat_id']) - 1] = int(r['base_stat'])
types = collections.defaultdict(list)
for r in sorted(R('pokemon_types'), key=lambda r: int(r['slot'])): types[int(r['pokemon_id'])].append(int(r['type_id']))
abil = collections.defaultdict(list)
for r in sorted(R('pokemon_abilities'), key=lambda r: int(r['slot'])): abil[int(r['pokemon_id'])].append([int(r['ability_id']), int(r['is_hidden'])])
ab_ko = {int(r['ability_id']): r['name'] for r in R('ability_names') if r['local_language_id'] == '9'}   # 한국어 이름이 없는 새 특성은 영어
ab_ko.update({int(r['ability_id']): r['name'] for r in R('ability_names') if r['local_language_id'] == '3'})
ab_fl = {}
for r in R('ability_flavor_text'):
    if r['language_id'] == '3':
        k = int(r['ability_id']); vg = int(r['version_group_id'])
        if k not in ab_fl or vg >= ab_fl[k][0]: ab_fl[k] = (vg, ' '.join(r['flavor_text'].split()))

targets = []   # (base, fk, fv, ident, kind, form_name_ko)
for k, v in t.items():
    if k == '0000' or int(k) not in sp_rows: continue
    base = int(k); bid = sp_rows[base]['identifier']
    if str(base) not in species: continue
    for fk, fv in v.get('subgroups', {}).items():
        nm = fv.get('name', '')
        if 'Walk' not in fv.get('sprite_files', {}): continue
        if nm in ('Mega', 'Mega_X', 'Mega_Y'):
            ident = bid + '-' + nm.lower().replace('_', '-'); kind, fko = 'mega', None
        elif (bid, nm) in ALT:
            ident, kind, fko = ALT[(bid, nm)]
        else: continue
        if ident not in poke: print('포켓API에 없음:', ident); continue
        targets.append((base, fk, fv, ident, kind, fko))

next_id = max(FORM_IDS.values()) + 1
for tg in sorted(targets):
    if tg[3] not in FORM_IDS: FORM_IDS[tg[3]] = next_id; next_id += 1

count = collections.Counter()
for base, fk, fv, ident, kind, fko in sorted(targets):
    fid = FORM_IDS[ident]; pid = int(poke[ident]['id']); b = species[str(base)]
    frow = pforms.get(ident)
    fname = fko or (form_ko.get(frow['id']) if frow else '') or ''
    ko, en = ko_species.get(base, b['n']), en_species.get(base, b['e'])
    if kind == 'mega': n = fname or f'메가{ko}'
    elif ident.endswith('-primal'): n = f'원시{ko}'
    else: n = f'{ko} ({fname})' if fname else ko
    fen = (form_en.get(frow['id']) if frow else '') or ident.split('-', 1)[1].replace('-', ' ').title()
    e = f'Primal {en}' if ident.endswith('-primal') else fen if kind == 'mega' else f'{en} ({fen})'
    ab = abil.get(pid) or b['ab']
    for a, h in ab:
        if str(a) not in DATA['abilities'] or DATA['abilities'][str(a)]['n'] == '?': DATA['abilities'][str(a)] = {'n': ab_ko.get(a, '?'), 'd': ab_fl.get(a, (0, ''))[1]}
    sh = fv.get('subgroups', {}).get('0001')
    sc, pc = fv.get('sprite_credit', {}), fv.get('portrait_credit', {})
    cr = [', '.join(dict.fromkeys([cname(sc['primary'])] + [cname(x) for x in sc.get('secondary', [])])) if sc.get('primary') else '?',
          ', '.join(dict.fromkeys([cname(pc['primary'])] + [cname(x) for x in pc.get('secondary', [])])) if pc.get('primary') else '']
    o = {
        'n': n, 'e': e, 't': types[pid] or b['t'], 'b': stats[pid] if any(stats[pid]) else b['b'], 'x': b['x'],
        'l': b['l'], 'v': [], 'g': b['g'], 'cr': cr, 'ab': ab,
        'em': ''.join(EM[x] for x in fv.get('portrait_files', {}) if x in EM),
        'sh': 1 if sh and 'Walk' in sh.get('sprite_files', {}) else 0,
        'sem': ''.join(EM[x] for x in (sh or {}).get('portrait_files', {}) if x in EM),
        'lg': b.get('lg', 0), 'tm': b.get('tm', '0'), 'f': [base, fk], 'fc': kind, 'fi': ident,
    }
    if b.get('gr'): o['gr'] = b['gr']
    species[str(fid)] = o
    count[kind] += 1

json.dump(FORM_IDS, open(ids_path, 'w', encoding='utf8'), ensure_ascii=False, indent=1)
open(os.path.join(ROOT, 'js', 'data.js'), 'w', encoding='utf8').write('window.DATA=' + json.dumps(DATA, ensure_ascii=False, separators=(',', ':')) + ';')
print('추가한 모습:', dict(count), '합계', sum(count.values()))
