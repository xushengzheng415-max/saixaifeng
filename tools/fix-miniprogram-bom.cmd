@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0fix-miniprogram-bom.ps1" %*
