# 불가사의 던전 웹 (비상업 팬 게임)

## 온라인으로 플레이
GitHub Pages에 올리면 설치 없이 링크로 바로 플레이할 수 있습니다: `https://<GitHub아이디>.github.io/<저장소이름>/`
(웹에서는 로컬 서버와 같아서 배경음악 루프도 정확하게 동작합니다.)

올리는 방법 (GitHub Desktop):
1. GitHub Desktop → File → Add local repository → 이 폴더 선택
2. Publish repository → "Keep this code private" 체크를 끄고 게시
3. github.com의 저장소 → Settings → Pages → Source를 "Deploy from a branch", Branch를 `main` / `(root)`로 저장
4. 1~2분 뒤 위 주소로 접속. 이후 수정은 GitHub Desktop에서 Commit → Push 하면 자동으로 반영됩니다.

## 실행
`index.html`을 브라우저(크롬, 엣지 등)로 열면 바로 실행됩니다. 설치할 것은 없지만 **인터넷 연결이 필요**합니다.
포켓몬 스프라이트를 실행 중에 PMD SpriteCollab(GitHub)에서 불러오기 때문입니다.

### 로컬 서버로 열기 (권장)
`index.html`을 더블클릭해서 열면(주소가 `file://`로 시작) 브라우저 보안 제한 때문에 몇 가지가 덜 정확합니다.
- 배경음악이 루프 구간으로 돌아갈 때 아주 짧게 끊길 수 있습니다.
- 음악 파일 안의 루프 정보(OGG `LOOPSTART` 태그, WAV 루프)를 읽지 못해서 `music/loops.js`에 적은 값만 씁니다.

로컬 서버로 열면 이 문제가 없습니다.

**Windows:** 게임 폴더의 **`start.bat`을 더블클릭**하세요. 서버가 켜지고 브라우저가 자동으로 열립니다.
게임을 하는 동안 검은 창을 닫지 마세요. 다 하면 그 창을 닫으면 됩니다.
(Python 또는 Node.js가 필요합니다. 없으면 https://www.python.org/downloads/ 에서 설치하고, 설치 화면에서 "Add python.exe to PATH"를 체크하세요.)

**직접 켜기 (Windows / Mac / Linux):** 게임 폴더에서 터미널을 열고 아래 중 하나를 실행한 뒤, 브라우저에서 `http://localhost:8765` 로 접속합니다.
```
python -m http.server 8765
```
```
npx http-server -p 8765
```

### 참고
- 세이브는 브라우저에 저장됩니다. 게임을 연 주소(파일 위치나 서버 주소)가 바뀌면 세이브도 따로 저장됩니다. 더블클릭으로 하던 세이브를 서버 쪽으로 옮기려면 정보 탭의 **세이브 내보내기 → 세이브 불러오기**를 쓰세요.
- 조작법과 규칙은 게임 안의 **정보 → 게임 가이드**에서 볼 수 있습니다.

## 개발자용
- **작업과 배포 분리:** 고치고 테스트하는 건 내 컴퓨터(`localhost`)에서 하고, GitHub에 push하는 순간이 곧 배포입니다. 다 확인한 뒤에만 push하세요.
  - 배포하면 플레이 중인 사람은 새로고침할 때 새 버전을 받습니다. 게임이 새 버전을 감지하면 마을에서 새로고침을 안내합니다 (던전 중에는 안내하지 않음).
  - 버전이 바뀌면 세이브를 자동으로 백업(최근 3개)한 뒤 변환합니다. 세이브 구조를 바꿀 때는 `js/main.js`의 `MIGRATIONS`에 변환을 추가하세요.
  - 옛 버전 화면(캐시)이 새 버전 세이브를 덮어쓰지 않도록 막혀 있습니다.
- **온라인 기능 환경:** `js/config.js`에서 `localhost`·파일로 열면 개발용, 실제 사이트면 서비스용 Firebase 프로젝트를 씁니다. 테스트 데이터가 실제 플레이어에게 섞이지 않게 두 프로젝트를 따로 만드세요 (둘 다 무료 Spark 요금제).
- 데이터 재생성: `tools_build_data.py`를 실행합니다. PokeAPI CSV, SpriteCollab `tracker.json`, `credit_names.txt`가 필요하고, 결과로 `js/data.js`가 만들어집니다.
- 코드를 고친 뒤 배포할 때는 `index.html`의 `?v=` 숫자를 올려야 브라우저 캐시가 갱신됩니다. 게임 버전(`js/defs.js`의 `GAME_VERSION`, `GAME_DATE`, `VERSION_NOTES`)도 같이 올리세요.
- 효과음과 기본 배경음은 `js/audio.js`에서 Web Audio로 직접 합성합니다. `music/`에 음악 파일이 있으면 그 파일을 재생합니다.
- 오늘의 도전은 날짜로 난수를 고정합니다 (`js/progress.js`). 던전·아이템을 추가하면 같은 날짜라도 맵이 달라지므로, 친구와는 같은 버전을 쓰세요.
- 던전 타일은 기본적으로 `js/tiles.js`에서 코드로 그립니다. `tiles/던전ID.png`(DTEF 형식)를 넣거나 정보 탭에서 불러오면 그 타일셋을 씁니다 (`tiles/README.txt` 참고).
- 배경음은 기본적으로 합성하지만, `music/이름.ogg` 등을 넣거나 정보 탭에서 불러오면 그 파일을 반복 재생합니다 (`music/README.txt` 참고). 인트로 뒤 루프 구간은 파일 안의 루프 정보나 `music/loops.js`로 정합니다.
- 배포용 zip은 `python make_release.py`로 만듭니다. 게임 파일과 `tiles/`, `music/` 폴더를 묶고, 빠진 타일셋·음악이 있으면 알려 줍니다.

## 크레딧과 라이선스
- **이 게임의 소스 코드**(`index.html`, `css/`, `js/`, 스크립트 파일. 단 `js/data.js`에 담긴 포켓몬 데이터는 제외): [GNU AGPL-3.0](LICENSE). 자유롭게 보고, 고치고, 다시 배포할 수 있지만, 고친 버전을 배포하거나 웹사이트로 서비스하면 그 소스 코드도 같은 라이선스로 공개해야 합니다.
- 아래 에셋과 데이터는 AGPL 대상이 **아니며** 각자의 권리와 라이선스를 따릅니다.
- 배포본의 `tiles/`, `music/` 폴더에 들어 있는 원작 던전 타일셋과 음악: Pokémon Mystery Dungeon 시리즈에서 가져온 것으로, 저작권은 Nintendo / Creatures Inc. / GAME FREAK inc. / Spike Chunsoft에 있습니다. 비상업적 팬 게임이며, 권리자의 요청이 있으면 내립니다.
- 포켓몬 스프라이트와 초상화: PMD Sprite Repository (SpriteCollab), CC BY-NC 4.0. 제작자별 크레딧은 게임 안에서 볼 수 있습니다.
- 포켓몬 데이터(이름, 능력치, 기술, 특성): PokeAPI.
- Pokémon © Nintendo / Creatures Inc. / GAME FREAK inc. Pokémon Mystery Dungeon © Spike Chunsoft.
  이 게임은 비상업적 팬 게임이며, 공식 제품과 관련이 없습니다.
