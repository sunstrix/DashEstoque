@echo off
title DashEstoque - INSTALANDO
color 0A
cd /d "%~dp0"

REM ============================================================================
REM INICIALIZACAO DO LOG
REM ============================================================================
set LOG_FILE=%~dp0instalar.log
echo ============================================================ > "%LOG_FILE%"
echo   DASHBOARD ESTOQUE CPFANI - LOG DE INSTALACAO >> "%LOG_FILE%"
echo   Data/Hora: %date% %time% >> "%LOG_FILE%"
echo ============================================================ >> "%LOG_FILE%"
echo. >> "%LOG_FILE%"
echo Script iniciado com sucesso. >> "%LOG_FILE%"

echo.
echo ============================================================
echo   DASHBOARD ESTOQUE CPFANI - INSTALACAO
echo ============================================================
echo   Log sera salvo em: %LOG_FILE%
echo ============================================================
echo.

REM ============================================================================
REM VERIFICACAO DO NODE.JS
REM ============================================================================
echo [1/4] Verificando Node.js...
echo [1/4] Verificando Node.js... >> "%LOG_FILE%"

echo    Verificando se node existe no PATH... >> "%LOG_FILE%"
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo    Node.js NAO encontrado no PATH. >> "%LOG_FILE%"
    echo    Node.js nao encontrado. Tentando instalar via winget...
    echo    Node.js nao encontrado. Tentando instalar via winget... >> "%LOG_FILE%"
    goto :INSTALL_NODE
)

echo    Node.js encontrado no PATH. Obtendo versao... >> "%LOG_FILE%"
for /f "tokens=*" %%i in ('node --version 2^>nul') do set NODE_VER=%%i
echo    OK! Node.js ja instalado (%NODE_VER%).
echo    OK! Node.js ja instalado (%NODE_VER%). >> "%LOG_FILE%"
goto :CHECK_MODULES

REM ============================================================================
REM INSTALACAO DO NODE.JS VIA WINGET
REM ============================================================================
:INSTALL_NODE
echo    Verificando se winget existe... >> "%LOG_FILE%"
where winget >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo    ERRO: winget nao disponivel.
    echo    Por favor, instale o Node.js manualmente em:
    echo    https://nodejs.org/
    echo.
    echo    ERRO: winget nao disponivel. >> "%LOG_FILE%"
    echo    Winget nao foi encontrado no sistema. >> "%LOG_FILE%"
    goto :FIM
)

echo    winget encontrado. Instalando Node.js LTS... >> "%LOG_FILE%"
echo    Instalando Node.js LTS via winget...
echo    Executando: winget install OpenJS.NodeJS.LTS -e --silent --accept-package-agreements --accept-source-agreements >> "%LOG_FILE%"
winget install OpenJS.NodeJS.LTS -e --silent --accept-package-agreements --accept-source-agreements >> "%LOG_FILE%" 2>&1
if %errorlevel% neq 0 (
    echo.
    echo    ERRO: Falha ao instalar Node.js via winget.
    echo    Por favor, instale manualmente em:
    echo    https://nodejs.org/
    echo.
    echo    ERRO: Falha ao instalar Node.js via winget. Errorlevel: %errorlevel% >> "%LOG_FILE%"
    goto :FIM
)

echo.
echo    Node.js instalado com sucesso!
echo    ATENCAO: Pode ser necessario reiniciar o terminal para o PATH ser atualizado.
echo.
echo    Node.js instalado com sucesso via winget. >> "%LOG_FILE%"
echo    ATENCAO: Pode ser necessario reiniciar o terminal para o PATH ser atualizado. >> "%LOG_FILE%"

REM Atualiza o PATH da sessao atual para incluir Node.js
set "PATH=%ProgramFiles%\nodejs;%PATH%"
echo    PATH atualizado para incluir: %ProgramFiles%\nodejs >> "%LOG_FILE%"

REM Verifica novamente se Node.js esta disponivel
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo    ATENCAO: Node.js instalado mas nao encontrado no PATH.
    echo    Por favor, feche este terminal e execute instalar.bat novamente.
    echo.
    echo    ATENCAO: Node.js instalado mas nao encontrado no PATH atual. >> "%LOG_FILE%"
    echo    Comando where node falhou com errorlevel: %errorlevel% >> "%LOG_FILE%"
    goto :FIM
)

for /f "tokens=*" %%i in ('node --version 2^>nul') do set NODE_VER=%%i
echo    OK! Node.js %NODE_VER% disponivel.
echo    OK! Node.js %NODE_VER% disponivel apos instalacao. >> "%LOG_FILE%"

REM ============================================================================
REM VERIFICACAO DO NPM E NODE_MODULES
REM ============================================================================
:CHECK_MODULES
echo.
echo [2/4] Verificando dependencias...
echo. >> "%LOG_FILE%"
echo [2/4] Verificando dependencias... >> "%LOG_FILE%"

where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo    ERRO: npm nao encontrado. Reinstale o Node.js.
    echo    ERRO: npm nao encontrado. Errorlevel: %errorlevel% >> "%LOG_FILE%"
    goto :FIM
)

for /f "tokens=*" %%i in ('npm --version 2^>nul') do set NPM_VER=%%i
echo    npm encontrado (versao %NPM_VER%).
echo    npm encontrado (versao %NPM_VER%). >> "%LOG_FILE%"

if exist "node_modules\" (
    echo    OK! node_modules encontrado. Dependencias ja instaladas.
    echo    OK! node_modules encontrado. Dependencias ja instaladas. >> "%LOG_FILE%"
    goto :CHECK_ENV
)

echo    node_modules nao encontrado. Instalando dependencias...
echo    node_modules nao encontrado. Instalando dependencias... >> "%LOG_FILE%"
echo    Executando: npm install >> "%LOG_FILE%"
call npm install >> "%LOG_FILE%" 2>&1
if %errorlevel% neq 0 (
    echo.
    echo    ERRO: Falha ao instalar dependencias.
    echo.
    echo    ERRO: Falha ao instalar dependencias. Errorlevel: %errorlevel% >> "%LOG_FILE%"
    goto :FIM
)
echo    OK! Dependencias instaladas com sucesso.
echo    OK! Dependencias instaladas com sucesso. >> "%LOG_FILE%"

REM ============================================================================
REM VERIFICACAO DO .ENV
REM ============================================================================
:CHECK_ENV
echo.
echo [3/4] Verificando arquivo .env...
echo. >> "%LOG_FILE%"
echo [3/4] Verificando arquivo .env... >> "%LOG_FILE%"

if exist ".env" (
    echo    OK! Arquivo .env ja existe.
    echo    OK! Arquivo .env ja existe. >> "%LOG_FILE%"
    goto :FINALIZAR
)

echo    Arquivo .env nao encontrado. Criando com URLs padrao...
echo    Arquivo .env nao encontrado. Criando com URLs padrao... >> "%LOG_FILE%"

(
echo PORT=3000
echo.
echo # URLs das planilhas do SharePoint
echo SPREADSHEET_MAIN_URL=https://didiernsf.sharepoint.com/:x:/s/NSFcosmticosepresentesLTDA/IQA-Wz0yzpnqSYa2YVVRybyWAUAs0EmwaQUPi4LDTGuAduU?e=E9TbRs
echo SPREADSHEET_SAFETY_URL=https://didiernsf.sharepoint.com/:x:/s/NSFcosmticosepresentesLTDA/IQBrGlued5zuSbFM3MWSTXUrAZWfbWg18JffEkgyzhBgcYw?e=McCxBr
echo SPREADSHEET_DRAFT_URL=https://didiernsf.sharepoint.com/:x:/s/NSFcosmticosepresentesLTDA/IQCujrbIbWZLT50lUu7tb2V7Aew2WFZQK1Uo2c4T583mDnU?e=5RIBrD
echo SPREADSHEET_IGNORED_URL=https://didiernsf.sharepoint.com/:x:/s/NSFcosmticosepresentesLTDA/IQASGB3GLaJRS71jgs_72MP8AYI2PEbGup2KMRWfhdSIOfs?e=G3I27o
) > ".env"

if %errorlevel% neq 0 (
    echo    ERRO: Falha ao criar arquivo .env.
    echo    ERRO: Falha ao criar arquivo .env. Errorlevel: %errorlevel% >> "%LOG_FILE%"
    goto :FIM
)

echo    OK! Arquivo .env criado com URLs do SharePoint.
echo    OK! Arquivo .env criado com URLs do SharePoint. >> "%LOG_FILE%"

REM ============================================================================
REM FINALIZACAO
REM ============================================================================
:FINALIZAR
echo.
echo [4/4] Instalacao concluida!
echo. >> "%LOG_FILE%"
echo [4/4] Instalacao concluida! >> "%LOG_FILE%"
echo.
echo ============================================================
echo   INSTALACAO CONCLUIDA COM SUCESSO!
echo ============================================================
echo.
echo   O projeto esta pronto para ser executado.
echo.
echo   Para iniciar o dashboard, execute:
echo   executar.bat
echo.
echo   O dashboard sera aberto em: http://localhost:3000
echo.
echo ============================================================
echo. >> "%LOG_FILE%"
echo ============================================================ >> "%LOG_FILE%"
echo   INSTALACAO CONCLUIDA COM SUCESSO! >> "%LOG_FILE%"
echo ============================================================ >> "%LOG_FILE%"

REM ============================================================================
REM PONTO FINAL COM PAUSE (todos os caminhos chegam aqui)
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