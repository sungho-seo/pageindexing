#!/bin/bash

echo "======================================================="
echo " PageIndex RAG Q&A 서비스 - 우분투 venv 자동 실행기"
echo "======================================================="

# 1. 파이썬 설치 여부 확인 및 venv 패키지 검사
if ! command -v python3 &> /dev/null; then
    echo "[오류] 시스템에 python3가 설치되어 있지 않습니다."
    echo "설치 명령: sudo apt update && sudo apt install -y python3 python3-pip python3-venv git"
    exit 1
fi

# 2. 가상환경 생성 (없는 경우)
if [ ! -d ".venv" ]; then
    echo "[1/4] 파이썬 가상환경(.venv) 생성 중..."
    python3 -m venv .venv
    if [ $? -ne 0 ]; then
        echo "[오류] 가상환경 생성 실패. python3-venv 패키지가 누락되었을 수 있습니다."
        echo "해결 명령어: sudo apt install -y python3-venv"
        exit 1
    fi
fi

# 3. 가상환경 활성화 및 필수 패키지 설치
echo "[2/4] 가상환경 활성화 및 라이브러리 설치..."
source .venv/bin/activate
pip install --upgrade pip
pip install litellm==1.83.7 pymupdf PyPDF2 fastapi uvicorn python-multipart python-dotenv pyyaml

# 4. API Key 설정 및 .env 생성
if [ ! -f ".env" ]; then
    echo ""
    echo "[3/4] 환경 설정 파일(.env)이 존재하지 않습니다."
    read -p "사용할 Gemini API Key를 입력해 주세요: " api_key
    
    echo "GEMINI_API_KEY=$api_key" > .env
    echo "GOOGLE_API_KEY=$api_key" >> .env
    echo "OPENAI_API_KEY=$api_key" >> .env
    echo "[성공] .env 파일이 생성되었습니다."
else
    echo "[3/4] 기존의 .env 환경 설정 파일을 사용합니다."
fi

# 5. FastAPI 서버 구동
echo ""
echo "[4/4] FastAPI 웹 서버 실행 중..."
echo "👉 웹 브라우저에서 http://localhost:8000 에 접속하세요."
echo ""
python main.py
