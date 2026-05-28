@echo off
chcp 65001 >nul
echo =======================================================
echo  PageIndex RAG Q&A 서비스 - 자동 환경 구성 및 실행기
echo =======================================================

:: 1. 파이썬 설치 여부 확인
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [오류] 시스템에 Python이 설치되어 있지 않습니다.
    echo 파이썬(Python 3.10 이상)을 먼저 설치하신 후 실행해 주세요.
    pause
    exit /b
)

:: 2. 필수 라이브러리 자동 설치
echo [1/3] 필수 파이썬 패키지 라이브러리 설치 중...
pip install litellm==1.83.7 pymupdf PyPDF2 fastapi uvicorn python-multipart python-dotenv pyyaml

:: 3. API 키 설정 및 .env 자동 생성
if not exist .env (
    echo.
    echo [2/3] 환경 설정 파일(.env)이 존재하지 않습니다.
    echo 사용할 Gemini API Key를 마우스 우클릭으로 붙여넣거나 직접 입력한 뒤 Enter를 눌러주세요.
    set /p API_KEY="API Key 입력: "
    
    echo GEMINI_API_KEY=%API_KEY% > .env
    echo GOOGLE_API_KEY=%API_KEY% >> .env
    echo OPENAI_API_KEY=%API_KEY% >> .env
    echo [성공] .env 파일이 자동 생성되었습니다. (API 키 설정 완료)
) else (
    echo [2/3] 기존에 설정된 .env 환경 설정 파일을 사용합니다.
)

:: 4. 백엔드 FastAPI 서버 구동
echo.
echo [3/3] RAG 웹 서버 구동 중...
echo 웹 브라우저를 열고 아래 주소로 접속해 주세요!
echo 👉 http://localhost:8000
echo.
python main.py
pause
