@echo off
timeout /t 10 /nobreak
C:\Users\Luis\AppData\Roaming\npm\pm2.cmd resurrect
PowerShell -Command "Start-Process -FilePath cloudflared -ArgumentList 'tunnel --config C:\Users\Luis\.cloudflared\config.yml run' -WindowStyle Hidden"
