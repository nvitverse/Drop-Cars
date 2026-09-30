@echo off
cd /d "%~dp0"
set EXPO_NO_TELEMETRY=1
npx expo start --web --port 8104
