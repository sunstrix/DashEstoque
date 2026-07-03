@echo off
title DashEstoque - EXECUTANDO
color 0B
cd /d "%~dp0"

REM ============================================================================
REM INICIALIZACAO DO LOG
REM ============================================================================
set LOG_FILE=%~dp0executar.log
echo ============================================================ > "%LOG_FILE%"
echo   DASHBOARD ESTOQUE CPFANI - LOG DE EXECUCAO >> "%LOG_FILE%"
echo   Data/Hora: %date% %time% >> "%LOG_FILE%"
echo ============================================================ >> "%LOG_FILE%"
echo. >> "%LOG_FILE%"
echo Script iniciado com sucesso. >> "%LOG_FILE%"

echo.
echo ============================================================
echo   DASHBOARD ESTOQUE CPFANI - EXECUCAO
echo ============================================================
echo   Log sera salvo em: %LOG_FILE%
echo ============================================================
echo.

REM ============================================================================
REM VERIFICACAO RAPIDA DO NODE.JS
REM ============================================================================
echo [1/3] Verificando Node.js...
echo [1/3] Verificando Node.js... >> "%LOG_FILE%"

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo    ERRO: Node.js nao encontrado!
    echo    Execute instalar.bat primeiro.
    echo.
    echo    ERRO: Node.js nao encontrado no PATH. >> "%LOG_FILE%"
    echo    Execute instalar.bat primeiro. >> "%LOG_FILE%"
    goto :FIM
)

for /f "tokens=*" %%i in ('node --version 2^>nul') do set NODE_VER=%%i
echo    OK! Node.js %NODE_VER% encontrado.
echo    OK! Node.js %NODE_VER% encontrado. >> "%LOG_FILE%"

REM ============================================================================
REM VERIFICACAO DO NODE_MODULES
REM ============================================================================
echo.
echo [2/3] Verificando dependencias...
echo. >> "%LOG_FILE%"
echo [2/3] Verificando dependencias... >> "%LOG_FILE%"

if not exist "node_modules\" (
    echo.
    echo    ERRO: Dependencias nao instaladas!
    echo    Execute instalar.bat primeiro.
    echo.
    echo    ERRO: Dependencias nao instaladas! >> "%LOG_FILE%"
    echo    node_modules nao encontrado. >> "%LOG_FILE%"
    echo    Execute instalar.bat primeiro. >> "%LOG_FILE%"
    goto :FIM
)
echo    OK! Dependencias encontradas.
echo    OK! Dependencias encontradas. >> "%LOG_FILE%"

REM ============================================================================
REM VERIFICACAO DO .ENV
REM ============================================================================
echo.
echo [3/3] Verificando configuracao...
echo. >> "%LOG_FILE%"
echo [3/3] Verificando configuracao... >> "%LOG_FILE%"

if not exist ".env" (
    echo.
    echo    ERRO: Arquivo .env nao encontrado!
    echo    Execute instalar.bat primeiro.
    echo.
    echo    ERRO: Arquivo .env nao encontrado! >> "%LOG_FILE%"
    echo    Execute instalar.bat primeiro. >> "%LOG_FILE%"
    goto :FIM
)
echo    OK! Arquivo .env encontrado.
echo    OK! Arquivo .env encontrado. >> "%LOG_FILE%"

REM ============================================================================
REM INICIAR SERVIDOR
REM ============================================================================
echo.
echo ============================================================
echo   INICIANDO SERVIDOR...
echo ============================================================
echo.
echo   O dashboard sera aberto automaticamente em:
echo   http://localhost:3000
echo.
echo   Para parar o servidor, pressione CTRL+C.
echo.
echo ============================================================
echo.
echo. >> "%LOG_FILE%"
echo ============================================================ >> "%LOG_FILE%"
echo   INICIANDO SERVIDOR... >> "%LOG_FILE%"
echo ============================================================ >> "%LOG_FILE%"
echo. >> "%LOG_FILE%"

REM Aguarda 2 segundos para o servidor iniciar antes de abrir o navegador
echo    Aguardando 2 segundos antes de abrir o navegador... >> "%LOG_FILE%"
start /b cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:3000"

REM Inicia o servidor (bloqueia a execucao aqui)
echo    Executando: npm start >> "%LOG_FILE%"
call npm start >> "%LOG_FILE%" 2>&1

REM Se o servidor parar, exibe mensagem
echo.
echo ============================================================
echo   SERVIDOR ENCERRADO
echo ============================================================
echo.
echo   O servidor foi parado.
echo   Execute este script novamente para reiniciar.
echo.
echo. >> "%LOG_FILE%"
echo ============================================================ >> "%LOG_FILE%"
echo   SERVIDOR ENCERRADO >> "%LOG_FILE%"
echo ============================================================ >> "%LOG_FILE%"

REM ============================================================================
REM PONTO FINAL COM PAUSE
REM ============================================================================
:FIM
echo.
echo ============================================================
echo   Log completo salvo em: %LOG_FILE%
echo ============================================================
echo.
echo Log completo salvo em: %LOG_FILE% >> "%LOG_FILE%"
echo. >> "%LOG_FILE%"
echo ============================================================ >> "%LOG_FILE%"
echo   FIM DA EXECUCAO >> "%LOG_FILE%"
echo   Data/Hora: %date% %time% >> "%LOG_FILE%"
echo ============================================================ >> "%LOG_FILE%"
pause