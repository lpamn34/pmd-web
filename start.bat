@echo off
chcp 65001 >nul
rem 불가사의 던전 웹: 로컬 서버로 실행 (배경음악 루프가 정확해지고, 파일 안의 루프 정보도 읽힙니다)
cd /d "%~dp0"
set PORT=8765
set URL=http://localhost:%PORT%/index.html

where python >nul 2>nul && set PY=python
if not defined PY where py >nul 2>nul && set PY=py
if defined PY (
  echo 게임 서버를 켭니다: %URL%
  echo 게임을 하는 동안 이 창을 닫지 마세요. 끝내려면 이 창을 닫으면 됩니다.
  start "" cmd /c "timeout /t 1 >nul & start %URL%"
  %PY% -m http.server %PORT%
  goto :eof
)

where npx >nul 2>nul
if %errorlevel%==0 (
  echo 게임 서버를 켭니다: %URL%
  echo 게임을 하는 동안 이 창을 닫지 마세요.
  start "" cmd /c "timeout /t 3 >nul & start %URL%"
  npx --yes http-server -p %PORT% -c-1
  goto :eof
)

echo Python이나 Node.js가 없어서 서버를 켤 수 없습니다.
echo index.html을 더블클릭해서 열어도 게임은 됩니다 (배경음악 루프 연결부가 아주 살짝 끊길 수 있음).
echo Python 설치: https://www.python.org/downloads/  (설치할 때 "Add python.exe to PATH" 체크)
pause
