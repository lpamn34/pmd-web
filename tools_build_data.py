import csv, json, collections, re, sys, os
R=lambda f: list(csv.DictReader(open(f+'.csv',encoding='utf8')))
t=json.load(open('tracker.json',encoding='utf8'))
# credits
names={}
for line in open('credit_names.txt',encoding='utf8').read().splitlines()[1:]:
    p=line.split('\t')
    if len(p)>=2: names[p[1]]=p[0]
def cname(x): return names.get(x, re.sub(r'[<@!>]','',x))
sprite_ids=set()
credit={}
emo={}
shiny={}
for k,v in t.items():
    if k=='0000': continue
    if 'Walk' in v.get('sprite_files',{}):
        sid=int(k); sprite_ids.add(sid)
        sc=v['sprite_credit']; pc=v.get('portrait_credit',{})
        s=[cname(sc['primary'])]+[cname(x) for x in sc.get('secondary',[])]
        p=[cname(pc['primary'])]+[cname(x) for x in pc.get('secondary',[])] if pc.get('primary') else []
        credit[sid]=[', '.join(dict.fromkeys(s)), ', '.join(dict.fromkeys(p))]
        EM={'Normal':'N','Happy':'H','Pain':'P','Determined':'D','Joyous':'J','Sad':'S','Angry':'A','Dizzy':'Z','Surprised':'U','Crying':'C','Worried':'W'}
        emo[sid]=''.join(EM[e] for e in v.get('portrait_files',{}) if e in EM)
        sh=v.get('subgroups',{}).get('0000',{}).get('subgroups',{}).get('0001')
        shiny[sid]=[1 if sh and 'Walk' in sh.get('sprite_files',{}) else 0, ''.join(EM[e] for e in (sh or {}).get('portrait_files',{}) if e in EM)]
ko_species={int(r['pokemon_species_id']):r['name'] for r in R('pokemon_species_names') if r['local_language_id']=='3'}
en_species={int(r['pokemon_species_id']):r['name'] for r in R('pokemon_species_names') if r['local_language_id']=='9'}
species_rows={int(r['id']):r for r in R('pokemon_species')}
poke={}
for r in R('pokemon'):
    if r['is_default']=='1': poke[int(r['species_id'])]=r
pid2sp={int(r['id']):s for s,r in poke.items()}
stats=collections.defaultdict(lambda:[0]*6)
for r in R('pokemon_stats'):
    p=int(r['pokemon_id'])
    if p in pid2sp: stats[pid2sp[p]][int(r['stat_id'])-1]=int(r['base_stat'])
types=collections.defaultdict(list)
for r in sorted(R('pokemon_types'),key=lambda r:int(r['slot'])):
    p=int(r['pokemon_id'])
    if p in pid2sp: types[pid2sp[p]].append(int(r['type_id']))
tname={int(r['type_id']):r['name'] for r in R('type_names') if r['local_language_id']=='3'}
chart=[[1]*18 for _ in range(18)]
for r in R('type_efficacy'):
    a,d=int(r['damage_type_id']),int(r['target_type_id'])
    if a<=18 and d<=18: chart[a-1][d-1]=int(r['damage_factor'])/100
# moves
moves={int(r['id']):r for r in R('moves')}
meta={int(r['move_id']):r for r in R('move_meta')}
mko={int(r['move_id']):r['name'] for r in R('move_names') if r['local_language_id']=='3'}
statch=collections.defaultdict(list)
for r in R('move_meta_stat_changes'): statch[int(r['move_id'])].append([int(r['stat_id']),int(r['change'])])
flav={}
for r in R('move_flavor_text'):
    if r['language_id']=='3':
        k=int(r['move_id']); vg=int(r['version_group_id'])
        if k not in flav or vg>=flav[k][0]: flav[k]=(vg,' '.join(r['flavor_text'].split()))
contact={int(r['move_id']) for r in R('move_flag_map') if r['move_flag_id']=='1'}
FLAGS={1,8,9,15,16,17,18}  # 접촉, 펀치, 소리, 가루, 물기, 파동, 탄환
mflags=collections.defaultdict(list)
for r in R('move_flag_map'):
    if int(r['move_flag_id']) in FLAGS: mflags[int(r['move_id'])].append(int(r['move_flag_id']))
def I(x,d=0):
    try: return int(x)
    except: return d
def conv_move(mid):
    r=moves.get(mid)
    if not r or mid>=10000 or not I(r['type_id']) or I(r['type_id'])>18: return None
    m=meta.get(mid,{}); cat=I(m.get('meta_category_id'))
    cls=I(r['damage_class_id']); pw=I(r['power']); tgt=I(r['target_id'])
    ail=I(m.get('meta_ailment_id'))
    if ail not in (1,2,3,4,5,6): ail=0
    heal=I(m.get('healing')); sc=statch.get(mid,[])
    if cls in (2,3):
        if pw<=0 or cat==9: return None
    else:
        ok=(cat==1 and ail) or (cat==2 and sc) or (cat==3 and heal>0)
        if not ok: return None
    if tgt in (7,4,5,13,3): rng='s'
    elif tgt in (9,11,14): rng='r'
    elif cls==1: rng='f'
    elif mid in contact: rng='f'
    else: rng='p'
    if cls==1 and cat in (2,3) and all(c>0 for s,c in sc) and tgt not in (9,11,14): rng='s'
    o={'n':mko.get(mid,r['identifier']),'t':I(r['type_id']),'p':pw,'a':I(r['accuracy']),'pp':I(r['pp'],10) or 10,'c':cls,'r':rng}
    if ail: o['ail']=ail; o['ac']=I(m.get('ailment_chance')) or (100 if cls==1 else 0)
    if sc: o['sc']=sc; o['scc']=I(m.get('stat_chance')) or 100
    if sc and cat==7: o['ss']=1  # 능력 변화가 사용자에게 적용
    if mid in flav: o['d']=flav[mid][1]
    if mflags.get(mid): o['fg']=sorted(mflags[mid])
    if heal: o['h']=heal
    if I(m.get('drain')): o['dr']=I(m.get('drain'))
    if I(m.get('max_hits'))>1: o['hits']=[I(m.get('min_hits')),I(m.get('max_hits'))]
    if I(m.get('flinch_chance')): o['fl']=I(m.get('flinch_chance'))
    if I(m.get('crit_rate')): o['cr']=I(m.get('crit_rate'))
    return o
# learnsets
lv=collections.defaultdict(lambda:collections.defaultdict(list))
mach=collections.defaultdict(lambda:collections.defaultdict(set))
for r in csv.DictReader(open('pokemon_moves.csv',encoding='utf8')):
    p=int(r['pokemon_id'])
    if p not in pid2sp: continue
    if r['pokemon_move_method_id']=='4':
        mach[pid2sp[p]][int(r['version_group_id'])].add(int(r['move_id'])); continue
    if r['pokemon_move_method_id']!='1': continue
    lv[pid2sp[p]][int(r['version_group_id'])].append((max(1,I(r['level'],1)),int(r['move_id'])))
pref=[25,20,23,18,17,16,15,14,11,10,9,8,7,5,4,3,1,24,26,27]
used={}
def learnset(s):
    groups=lv.get(s,{})
    for g in pref+sorted(groups):
        if g in groups:
            out=[];seen=set()
            for l,mid in sorted(groups[g]):
                if mid in seen: continue
                mo=used.get(mid) or conv_move(mid)
                if mo: used[mid]=mo; out.append([l,mid]); seen.add(mid)
            if out: return out
    used[33]=conv_move(33); return [[1,33]]
def machine_moves(s):
    groups=mach.get(s,{})
    for g in pref+sorted(groups):
        if g in groups and groups[g]:
            out=set()
            for mid in groups[g]:
                mo=used.get(mid) or conv_move(mid)
                if mo: used[mid]=mo; out.add(mid)
            return out
    return set()
sp_tm={}
evo_rows=collections.defaultdict(list)
for r in R('pokemon_evolution'): evo_rows[int(r['evolved_species_id'])].append(r)
ab_ko={int(r['ability_id']):r['name'] for r in R('ability_names') if r['local_language_id']=='3'}
ab_fl={}
for r in R('ability_flavor_text'):
    if r['language_id']=='3':
        k=int(r['ability_id']); vg=int(r['version_group_id'])
        if k not in ab_fl or vg>=ab_fl[k][0]: ab_fl[k]=(vg,' '.join(r['flavor_text'].split()))
sp_ab=collections.defaultdict(list)
for r in sorted(R('pokemon_abilities'),key=lambda r:int(r['slot'])):
    p=int(r['pokemon_id'])
    if p in pid2sp: sp_ab[pid2sp[p]].append([int(r['ability_id']),int(r['is_hidden'])])
used_ab={}
sp={}
for s in sorted(sprite_ids):
    if s not in poke: print('skip',s); continue
    evos=[]
    for c,row in species_rows.items():
        if I(row['evolves_from_species_id'])==s and c in sprite_ids:
            rs=evo_rows.get(c,[]); e=rs[0] if rs else {}
            trig=I(e.get('evolution_trigger_id')); ml=I(e.get('minimum_level'))
            if trig==1 and ml: evos.append([c,ml,0])
            elif trig==3: evos.append([c,0,1])
            elif trig==2: evos.append([c,0,2])
            else: evos.append([c,25,0])
    sp_tm[s]=machine_moves(s)
    sp[s]={'n':ko_species.get(s,en_species.get(s)),'e':en_species.get(s),'t':types[s],'b':stats[s],'x':I(poke[s]['base_experience'],60) or 60,
           'l':learnset(s),'v':evos,'g':I(species_rows[s]['generation_id']),'cr':credit.get(s),
           'ab':sp_ab.get(s,[]),'em':emo.get(s,'N'),'sh':shiny.get(s,[0,''])[0],'sem':shiny.get(s,[0,''])[1],
           'lg':1 if species_rows[s]['is_legendary']=='1' or species_rows[s]['is_mythical']=='1' else 0}
tm_list=sorted(set().union(*sp_tm.values()))
tm_index={m:i for i,m in enumerate(tm_list)}
for s_id,st in sp_tm.items():
    bits=0
    for m in st: bits|=1<<tm_index[m]
    sp[s_id]['tm']=format(bits,'x')
for s_ in sp.values():
    for a,h in s_['ab']: used_ab[a]={'n':ab_ko.get(a,'?'),'d':ab_fl.get(a,(0,''))[1]}
data={'tms':tm_list,'abilities':used_ab,'types':[tname[i] for i in range(1,19)],'chart':chart,'species':sp,'moves':used}
os.makedirs(sys.argv[1],exist_ok=True)
open(os.path.join(sys.argv[1],'data.js'),'w',encoding='utf8').write('window.DATA='+json.dumps(data,ensure_ascii=False,separators=(',',':'))+';')
print(len(sp),'species',len(used),'moves')
