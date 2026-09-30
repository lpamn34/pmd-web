# 배포용 zip 만들기: 게임 파일 + tiles/ + music/ 폴더를 묶는다
# 사용법: python make_release.py   →  pmd-web-v<버전>.zip
# 어떤 던전의 타일셋·음악이 들어 있고 빠졌는지도 알려 준다.
import os
import re
import zipfile

ROOT = os.path.dirname(os.path.abspath(__file__))
INCLUDE = ['index.html', 'README.md', 'LICENSE', 'start.bat', 'css', 'js', 'tiles', 'music']
MUSIC_EXT = ('.ogg', '.mp3', '.m4a', '.wav')


def read(p):
    with open(os.path.join(ROOT, p), encoding='utf-8') as f:
        return f.read()


def main():
    defs = read('js/defs.js')
    ver = re.search(r"GAME_VERSION = '([^']+)'", defs).group(1)
    dungeons = re.findall(r"\{ id: '(\w+)',\s+n: '([^']+)'", defs)

    # 들어 있는 파일 확인
    tiles = set(os.listdir(os.path.join(ROOT, 'tiles'))) if os.path.isdir(os.path.join(ROOT, 'tiles')) else set()
    music = set(os.listdir(os.path.join(ROOT, 'music'))) if os.path.isdir(os.path.join(ROOT, 'music')) else set()
    has_music = lambda k: any(k + e in music for e in MUSIC_EXT)
    print(f'불가사의 던전 웹 v{ver} 배포 준비\n')
    print('타일셋:', '공통(default.png) 있음' if 'default.png' in tiles else '공통 없음')
    miss_t = [n for i, n in dungeons if i + '.png' not in tiles]
    print(f'  던전별 {len(dungeons) - len(miss_t)}/{len(dungeons)}' + (f'  (없음: {", ".join(miss_t)})' if miss_t else ''))
    print('음악:', ', '.join(f'{k} {"O" if has_music(k) else "X"}' for k in ['town', 'boss', 'dungeon']))
    miss_m = [n for i, n in dungeons if not has_music(i)]
    print(f'  던전별 {len(dungeons) - len(miss_m)}/{len(dungeons)}' + (f'  (없음: {", ".join(miss_m)} → dungeon 공통 곡이나 합성 배경음)' if miss_m else ''))

    out = os.path.join(ROOT, f'pmd-web-v{ver}.zip')
    n = 0
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        for item in INCLUDE:
            p = os.path.join(ROOT, item)
            if os.path.isfile(p):
                z.write(p, item); n += 1
            elif os.path.isdir(p):
                for dp, _, files in os.walk(p):
                    for f in files:
                        full = os.path.join(dp, f)
                        z.write(full, os.path.relpath(full, ROOT)); n += 1
    print(f'\n만들었습니다: {os.path.basename(out)} ({n}개 파일, {os.path.getsize(out) / 1024 / 1024:.1f}MB)')


if __name__ == '__main__':
    main()
