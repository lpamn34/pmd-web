# 리전폼(알로라·가라르·히스이·팔데아의 모습)을 js/data.js에 더한다.
# 기존 포켓몬·기술 데이터는 건드리지 않고, 스프라이트가 있는 리전폼만 새 번호로 추가한다.
# 번호는 tools/form_ids.json에 고정해 둔다 (세이브·구조 코드가 깨지지 않게, 새 폼은 다음 번호를 받는다).
#
# 사용법: python tools/build_forms.py <재료 폴더>
#   재료 폴더: PokeAPI CSV (pokemon, pokemon_species, pokemon_species_names, pokemon_stats, pokemon_types,
#   pokemon_abilities, pokemon_moves, pokemon_evolution, moves, move_meta, move_names, move_meta_stat_changes,
#   move_flavor_text, move_flag_map, ability_names, ability_flavor_text) + SpriteCollab tracker.json, credit_names.txt
import csv, json, os, re, sys, collections

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = sys.argv[1]
R = lambda f: list(csv.DictReader(open(os.path.join(SRC, f + '.csv'), encoding='utf8')))
I = lambda x, d=0: int(x) if str(x).lstrip('-').isdigit() else d

raw = open(os.path.join(ROOT, 'js', 'data.js'), encoding='utf8').read()
DATA = json.loads(raw[raw.index('=') + 1:].rstrip().rstrip(';'))
species, moves_out = DATA['species'], DATA['moves']
ids_path = os.path.join(ROOT, 'tools', 'form_ids.json')
FORM_IDS = json.load(open(ids_path, encoding='utf8')) if os.path.exists(ids_path) else {}
FIRST_ID = 1101   # 원래 포켓몬 번호(1~1025) 뒤, 구조 코드의 11비트(2047) 안

REGION = {'Alola': ('alola', '알로라', 'Alolan', 7), 'Galar': ('galar', '가라르', 'Galarian', 8), 'Hisui': ('hisui', '히스이', 'Hisuian', 8),
          'Paldea': ('paldea', '팔데아', 'Paldean', 9), 'Paldea_Blaze': ('paldea-blaze-breed', '팔데아', 'Paldean', 9), 'Paldea_Aqua': ('paldea-aqua-breed', '팔데아', 'Paldean', 9),
          # 리전폼은 아니지만 보스로 쓰는 특별한 모습
          'Eternamax': ('eternamax', '', 'Eternamax', 8)}
# 이름을 따로 정하는 모습 (기본은 "지방 이름 + 포켓몬")
NAME_KO = {'eternatus-eternamax': '무한다이노 (무한다이맥스)'}
NAME_EN = {'eternatus-eternamax': 'Eternatus (Eternamax)'}
SUFFIX_KO = {'paldea-blaze-breed': ' (블레이즈종)', 'paldea-aqua-breed': ' (워터종)', 'paldea-combat-breed': ' (컴뱃종)'}
# 리전폼만 진화하는 포켓몬 (원래 모습은 진화하지 않는다)
REGION_EVO = {('meowth', 'galar'): 'perrserker', ('farfetchd', 'galar'): 'sirfetchd', ('corsola', 'galar'): 'cursola', ('mr-mime', 'galar'): 'mr-rime',
              ('linoone', 'galar'): 'obstagoon', ('yamask', 'galar'): 'runerigus', ('qwilfish', 'hisui'): 'overqwil', ('sneasel', 'hisui'): 'sneasler',
              ('wooper', 'paldea'): 'clodsire'}

t = json.load(open(os.path.join(SRC, 'tracker.json'), encoding='utf8'))
names = {}
for line in open(os.path.join(SRC, 'credit_names.txt'), encoding='utf8').read().splitlines()[1:]:
    p = line.split('\t')
    if len(p) >= 2: names[p[1]] = p[0]
cname = lambda x: names.get(x, re.sub(r'[<@!>]', '', x))
EM = {'Normal': 'N', 'Happy': 'H', 'Pain': 'P', 'Determined': 'D', 'Joyous': 'J', 'Sad': 'S', 'Angry': 'A', 'Dizzy': 'Z', 'Surprised': 'U', 'Crying': 'C', 'Worried': 'W'}

sp_rows = {int(r['id']): r for r in R('pokemon_species')}
sp_ident = {r['identifier']: int(r['id']) for r in sp_rows.values()}
ko_species = {int(r['pokemon_species_id']): r['name'] for r in R('pokemon_species_names') if r['local_language_id'] == '3'}
en_species = {int(r['pokemon_species_id']): r['name'] for r in R('pokemon_species_names') if r['local_language_id'] == '9'}
poke = {r['identifier']: r for r in R('pokemon')}
stats = collections.defaultdict(lambda: [0] * 6)
for r in R('pokemon_stats'): stats[int(r['pokemon_id'])][int(r['stat_id']) - 1] = int(r['base_stat'])
types = collections.defaultdict(list)
for r in sorted(R('pokemon_types'), key=lambda r: int(r['slot'])): types[int(r['pokemon_id'])].append(int(r['type_id']))
abil = collections.defaultdict(list)
for r in sorted(R('pokemon_abilities'), key=lambda r: int(r['slot'])): abil[int(r['pokemon_id'])].append([int(r['ability_id']), int(r['is_hidden'])])
evo_rows = collections.defaultdict(list)
for r in R('pokemon_evolution'): evo_rows[int(r['evolved_species_id'])].append(r)

# 기술 변환 (tools_build_data.py와 같은 규칙)
mv = {int(r['id']): r for r in R('moves')}
meta = {int(r['move_id']): r for r in R('move_meta')}
mko = {int(r['move_id']): r['name'] for r in R('move_names') if r['local_language_id'] == '3'}
statch = collections.defaultdict(list)
for r in R('move_meta_stat_changes'): statch[int(r['move_id'])].append([int(r['stat_id']), int(r['change'])])
flav = {}
for r in R('move_flavor_text'):
    if r['language_id'] == '3':
        k = int(r['move_id']); vg = int(r['version_group_id'])
        if k not in flav or vg >= flav[k][0]: flav[k] = (vg, ' '.join(r['flavor_text'].split()))
contact = {int(r['move_id']) for r in R('move_flag_map') if r['move_flag_id'] == '1'}
FLAGS = {1, 8, 9, 15, 16, 17, 18}
mflags = collections.defaultdict(list)
for r in R('move_flag_map'):
    if int(r['move_flag_id']) in FLAGS: mflags[int(r['move_id'])].append(int(r['move_flag_id']))

def conv_move(mid):
    r = mv.get(mid)
    if not r or mid >= 10000 or not I(r['type_id']) or I(r['type_id']) > 18: return None
    m = meta.get(mid, {}); cat = I(m.get('meta_category_id'))
    cls = I(r['damage_class_id']); pw = I(r['power']); tgt = I(r['target_id'])
    ail = I(m.get('meta_ailment_id'))
    if ail not in (1, 2, 3, 4, 5, 6): ail = 0
    heal = I(m.get('healing')); sc = statch.get(mid, [])
    if cls in (2, 3):
        if pw <= 0 or cat == 9: return None
    else:
        if not ((cat == 1 and ail) or (cat == 2 and sc) or (cat == 3 and heal > 0)): return None
    if tgt in (7, 4, 5, 13, 3): rng = 's'
    elif tgt in (9, 11, 14): rng = 'r'
    elif cls == 1: rng = 'f'
    elif mid in contact: rng = 'f'
    else: rng = 'p'
    if cls == 1 and cat in (2, 3) and all(c > 0 for s, c in sc) and tgt not in (9, 11, 14): rng = 's'
    o = {'n': mko.get(mid, r['identifier']), 't': I(r['type_id']), 'p': pw, 'a': I(r['accuracy']), 'pp': I(r['pp'], 10) or 10, 'c': cls, 'r': rng}
    if ail: o['ail'] = ail; o['ac'] = I(m.get('ailment_chance')) or (100 if cls == 1 else 0)
    if sc: o['sc'] = sc; o['scc'] = I(m.get('stat_chance')) or 100
    if sc and cat == 7: o['ss'] = 1
    if mid in flav: o['d'] = flav[mid][1]
    if mflags.get(mid): o['fg'] = sorted(mflags[mid])
    if heal: o['h'] = heal
    if I(m.get('drain')): o['dr'] = I(m.get('drain'))
    if I(m.get('max_hits')) > 1: o['hits'] = [I(m.get('min_hits')), I(m.get('max_hits'))]
    if I(m.get('flinch_chance')): o['fl'] = I(m.get('flinch_chance'))
    if I(m.get('crit_rate')): o['cr'] = I(m.get('crit_rate'))
    return o

def get_move(mid):
    if str(mid) in moves_out: return True
    o = conv_move(mid)
    if o: moves_out[str(mid)] = o
    return bool(o)

# 폼별 기술 (레벨업 / 기술머신)
form_pids = set()
targets = []   # (base_sp, fk, region_key, ident, pid)
for k, v in t.items():
    if k == '0000': continue
    base = int(k)
    for fk, fv in v.get('subgroups', {}).items():
        reg = REGION.get(fv.get('name'))
        if not reg or 'Walk' not in fv.get('sprite_files', {}): continue
        bid = sp_rows[base]['identifier']
        for ident in (f'{bid}-{reg[0]}', f'{bid}-{reg[0]}-standard', f'{bid}-{reg[0]}-combat-breed'):
            if ident in poke: break
        else:
            print('포켓API에 없음:', bid, fv.get('name')); continue
        pid = int(poke[ident]['id']); form_pids.add(pid)
        targets.append((base, fk, fv, reg, ident, pid))
lv = collections.defaultdict(lambda: collections.defaultdict(list))
mach = collections.defaultdict(lambda: collections.defaultdict(set))
for r in csv.DictReader(open(os.path.join(SRC, 'pokemon_moves.csv'), encoding='utf8')):
    p = int(r['pokemon_id'])
    if p not in form_pids: continue
    if r['pokemon_move_method_id'] == '4': mach[p][int(r['version_group_id'])].add(int(r['move_id'])); continue
    if r['pokemon_move_method_id'] == '1': lv[p][int(r['version_group_id'])].append((max(1, I(r['level'], 1)), int(r['move_id'])))
PREF = [25, 20, 23, 18, 17, 16, 15, 14, 11, 10, 9, 8, 7, 5, 4, 3, 1, 24, 26, 27]
def learnset(pid):
    groups = lv.get(pid, {})
    for g in PREF + sorted(groups):
        if g in groups:
            out, seen = [], set()
            for l, mid in sorted(groups[g]):
                if mid not in seen and get_move(mid): out.append([l, mid]); seen.add(mid)
            if out: return out
    return [[1, 33]]
TM_INDEX = {m: i for i, m in enumerate(DATA['tms'])}
def tm_bits(pid):
    groups = mach.get(pid, {})
    for g in PREF + sorted(groups):
        if g in groups and groups[g]:
            bits = 0
            for mid in groups[g]:
                if mid in TM_INDEX: bits |= 1 << TM_INDEX[mid]
            return format(bits, 'x')
    return '0'

ab_ko = {int(r['ability_id']): r['name'] for r in R('ability_names') if r['local_language_id'] == '3'}
ab_fl = {}
for r in R('ability_flavor_text'):
    if r['language_id'] == '3':
        k = int(r['ability_id']); vg = int(r['version_group_id'])
        if k not in ab_fl or vg >= ab_fl[k][0]: ab_fl[k] = (vg, ' '.join(r['flavor_text'].split()))

# 1차: 번호 정하기 (기존 번호 유지, 새 폼은 다음 번호)
next_id = max([FIRST_ID - 1] + list(FORM_IDS.values())) + 1
for base, fk, fv, reg, ident, pid in sorted(targets):
    if ident not in FORM_IDS: FORM_IDS[ident] = next_id; next_id += 1
form_of = {(base, reg[0].split('-')[0]): FORM_IDS[ident] for base, fk, fv, reg, ident, pid in targets}

# 원래 모습에서 리전폼 전용 진화를 뺀다 (예: 나옹 → 나이킹은 가라르 나옹만)
excl = {sp_ident[b]: sp_ident[c] for (b, _), c in REGION_EVO.items()}
for b, c in excl.items():
    if str(b) in species: species[str(b)]['v'] = [e for e in species[str(b)]['v'] if e[0] != c]

def evo_cond(c):
    rs = evo_rows.get(c, []); e = rs[0] if rs else {}
    trig = I(e.get('evolution_trigger_id')); ml = I(e.get('minimum_level'))
    return [ml, 0] if trig == 1 and ml else [0, 1] if trig == 3 else [0, 2] if trig == 2 else [25, 0]

added = 0
for base, fk, fv, reg, ident, pid in sorted(targets):
    fid = FORM_IDS[ident]; region = reg[0].split('-')[0]
    bid = sp_rows[base]['identifier']
    # 진화: 원래 모습의 진화 대상 → 같은 지방 모습이 있으면 그 모습, 전용 진화가 있으면 그 포켓몬
    evos = []
    if (bid, region) in REGION_EVO:
        c = sp_ident[REGION_EVO[(bid, region)]]
        if str(c) in species: evos.append([c] + evo_cond(c))
    else:
        for e in species.get(str(base), {}).get('v', []):
            if (e[0], region) in form_of: evos.append([form_of[(e[0], region)], e[1], e[2]])
    sh = fv.get('subgroups', {}).get('0001')
    sc, pc = fv.get('sprite_credit', {}), fv.get('portrait_credit', {})
    cr = [', '.join(dict.fromkeys([cname(sc['primary'])] + [cname(x) for x in sc.get('secondary', [])])) if sc.get('primary') else '?',
          ', '.join(dict.fromkeys([cname(pc['primary'])] + [cname(x) for x in pc.get('secondary', [])])) if pc.get('primary') else '']
    srow = sp_rows[base]
    ab = abil.get(pid, [])
    for a, h in ab:
        if str(a) not in DATA['abilities']: DATA['abilities'][str(a)] = {'n': ab_ko.get(a, '?'), 'd': ab_fl.get(a, (0, ''))[1]}
    suffix = next((s for k2, s in SUFFIX_KO.items() if ident.endswith(k2)), '')
    lset = learnset(pid)
    if lset == [[1, 33]] and str(base) in species: lset = species[str(base)]['l']   # 기술 정보가 없는 모습은 원래 모습의 기술
    species[str(fid)] = {
        'n': NAME_KO.get(ident) or f'{reg[1]} {ko_species.get(base, en_species.get(base))}{suffix}', 'e': NAME_EN.get(ident) or f'{reg[2]} {en_species.get(base)}' + (' (' + ident.split('paldea-')[1].replace('-breed', '').title() + ')' if 'breed' in ident else ''),
        't': types[pid], 'b': stats[pid], 'x': I(poke[ident]['base_experience'], 60) or 60,
        'l': lset, 'v': evos, 'g': reg[3], 'cr': cr, 'ab': ab,
        'em': ''.join(EM[e] for e in fv.get('portrait_files', {}) if e in EM) or 'N',
        'sh': 1 if sh and 'Walk' in sh.get('sprite_files', {}) else 0,
        'sem': ''.join(EM[e] for e in (sh or {}).get('portrait_files', {}) if e in EM),
        'lg': 1 if srow['is_legendary'] == '1' or srow['is_mythical'] == '1' else 0,
        'tm': tm_bits(pid), 'f': [base, fk],
    }
    added += 1
# 성장 그룹(원작의 경험치 곡선): 1 느림, 2 보통, 3 빠름, 4 보통-느림, 5 불규칙, 6 변동. 리전폼은 원래 포켓몬을 따른다
for k, v in species.items():
    base = v['f'][0] if v.get('f') else int(k)
    gr = I(sp_rows.get(base, {}).get('growth_rate_id'), 2)
    if gr != 2: v['gr'] = gr
    else: v.pop('gr', None)

json.dump(FORM_IDS, open(ids_path, 'w', encoding='utf8'), ensure_ascii=False, indent=1)
open(os.path.join(ROOT, 'js', 'data.js'), 'w', encoding='utf8').write('window.DATA=' + json.dumps(DATA, ensure_ascii=False, separators=(',', ':')) + ';')
print(f'리전폼 {added}종 추가, 기술 {len(moves_out)}개, 원래 모습에서 뺀 전용 진화 {len(excl)}개')
