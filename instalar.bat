@echo off
chcp 65001 >nul 2>&1
title DashEstoque - Instalador de Dependencias
color 0A

echo ============================================================
echo   DASHBOARD ESTOQUE CPFANI - INSTALADOR
echo ============================================================
echo.

REM Verifica se o Node.js esta instalado
echo [1/4] Verificando instalacao do Node.js...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo.
    echo ============================================================
    echo   ERRO: Node.js nao encontrado!
    echo ============================================================
    echo.
    echo O Node.js e necessario para rodar este projeto.
    echo.
    echo Por favor, faca o download e instalacao em:
    echo https://nodejs.org/
    echo.
    echo Recomenda-se a versao LTS (Long Term Support).
    echo.
    echo Apos instalar o Node.js, execute este script novamente.
    echo ============================================================
    echo.
    pause
    exit /b 1
)

REM Captura a versao do Node
for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo    OK! Node.js %NODE_VERSION% encontrado.
echo.

REM Verifica se o npm esta instalado
echo [2/4] Verificando instalacao do npm...
npm --version >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo    ERRO: npm nao encontrado!
    echo    O npm geralmente vem junto com o Node.js.
    echo    Reinstale o Node.js em https://nodejs.org/
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('npm --version') do set NPM_VERSION=%%i
echo    OK! npm %NPM_VERSION% encontrado.
echo.

REM Cria o arquivo .env se nao existir
echo [3/4] Verificando arquivo de configuracao (.env)...
if not exist ".env" (
    echo    Criando arquivo .env com URLs padrao do SharePoint...
    (
        echo PORT=3000
        echo.
        echo # URLs das planilhas do SharePoint
        echo SPREADSHEET_MAIN_URL=https://didiernsf.sharepoint.com/:x:/s/NSFcosmticosepresentesLTDA/IQA-Wz0yzpnqSYa2YVVRybyWAUAs0EmwaQUPi4LDTGuAduU?e=E9TbRs
        echo SPREADSHEET_SAFETY_URL=https://didiernsf.sharepoint.com/:x:/s/NSFcosmticosepresentesLTDA/IQBrGlued5zuSbFM3MWSTXUrAZWfbWg18JffEkgyzhBgcYw?e=McCxBr
        echo SPREADSHEET_DRAFT_URL=https://didiernsf.sharepoint.com/:x:/s/NSFcosmticosepresentesLTDA/IQCujrbIbWZLT50lUu7tb2V7Aew2WFZQK1Uo2c4T583mDnU?e=5RIBrD
        echo SPREADSHEET_IGNORED_URL=https://didiernsf.sharepoint.com/:x:/s/NSFcosmticosepresentesLTDA/IQASGB3GLaJRS71jgs_72MP8AYI2PEbGup2KMRWfhdSIOfs?e=G3I27o
    ) > .env
    echo    OK! Arquivo .env criado com URLs do SharePoint.
) else (
    echo    OK! Arquivo .env ja existe.
)
echo.

REM Instala as dependencias do projeto
echo [4/4] Instalando dependencias do projeto (npm install)...
echo    Isso pode levar alguns minutos na primeira vez...
echo.
call npm install
if %errorlevel% neq 0 (
    color 0C
    echo.
    echo    ERRO: Falha ao instalar dependencias!
    echo    Verifique sua conexao com a internet e tente novamente.
    pause
    exit /b 1
)

echo.
color 0A
echo ============================================================
echo   INSTALACAO CONCLUIDA COM SUCESSO!
echo ============================================================
echo.
echo   O projeto esta pronto para ser executado.
echo   Execute o arquivo "executar.bat" para iniciar o dashboard.
echo.
echo   O dashboard sera aberto em: http://localhost:3000
echo.
echo ============================================================
echo.
pause