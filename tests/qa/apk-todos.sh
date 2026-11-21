#!/usr/bin/env bash
# © 2026 Alan Evangelista de Souza Martins (AlanSouzaDev7). Todos os direitos reservados. Autor: Alan Evangelista de Souza Martins.
# QA do APK em todos os aparelhos virtuais: liga cada emulador, instala o APK, roda tests/qa/apk.mjs e desliga.
# Uso: bash tests/qa/apk-todos.sh [perfis...]   (padrão: cz_celular cz_pequeno cz_tablet cz_dobravel cz_tv)
SDK="$LOCALAPPDATA/Android/Sdk"; ADB="$SDK/platform-tools/adb.exe"; EMU="$SDK/emulator/emulator.exe"
APK="$(cd "$(dirname "$0")/../.." && pwd)/app/android/app/build/outputs/apk/debug/app-debug.apk"
PERFIS=("${@:-cz_celular cz_pequeno cz_tablet cz_dobravel cz_tv}")
[ $# -eq 0 ] && PERFIS=(cz_celular cz_pequeno cz_tablet cz_dobravel cz_tv)
for avd in "${PERFIS[@]}"; do
  "$ADB" emu kill >/dev/null 2>&1; sleep 6
  echo "### ligando $avd"
  "$EMU" -avd "$avd" -no-snapshot -no-boot-anim -gpu swiftshader_indirect -no-audio >/dev/null 2>&1 &
  "$ADB" wait-for-device
  for i in $(seq 1 90); do [ "$("$ADB" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ] && break; sleep 4; done
  sleep 15
  "$ADB" install -r "$APK" | tail -1
  nome="${avd#cz_}"
  if [ "$avd" = "cz_tv" ]; then node "$(dirname "$0")/apk.mjs" "$nome" tv; else node "$(dirname "$0")/apk.mjs" "$nome"; fi
  if [ "$avd" = "cz_dobravel" ]; then
    # dobrar e desdobrar com o app aberto (a tela externa e a interna)
    "$ADB" shell am start -n io.github.alansouzadev7.futebol/.MainActivity >/dev/null; sleep 12
    "$ADB" emu fold >/dev/null 2>&1; sleep 6
    "$ADB" exec-out screencap -p > "$(dirname "$0")/out/apk/dobravel-fechado.png"; echo "fechado: $("$ADB" shell wm size | tail -1)"
    "$ADB" emu unfold >/dev/null 2>&1; sleep 6
    "$ADB" exec-out screencap -p > "$(dirname "$0")/out/apk/dobravel-aberto.png"; echo "aberto: $("$ADB" shell wm size | tail -1)"
    "$ADB" logcat -d -b crash | grep -c io.github.alansouzadev7.futebol | sed 's/^/crashes ao dobrar: /'
  fi
done
"$ADB" emu kill >/dev/null 2>&1
echo "### fim"
