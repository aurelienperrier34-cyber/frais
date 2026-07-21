@echo off
cd /d "%~dp0"
start "Frais" http://localhost:8000
py -m http.server 8000
