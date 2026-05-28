# PageIndex RAG Q&A 서비스 실행 가이드 (HOWTO)

본 가이드는 다른 PC 환경에서 본 프로젝트를 복제하고 실행하는 방법에 대해 설명합니다.

---

## 🚀 실행 순서

### 💡 [Windows 전용] 초간단 자동 실행기 사용 (추천)
Windows 환경에서는 저장소를 클론한 후 폴더 내의 **`run.bat`** 파일을 **더블 클릭**하기만 하면 자동으로 라이브러리가 설치되고, API 키 입력 창을 거쳐 서버까지 즉시 기동됩니다!

---

### [일반] 수동 실행 순서

### 1단계: 저장소 복제 (Clone)
새로운 PC의 터미널을 열고 저장소를 클론(내려받기)합니다.
```bash
git clone https://github.com/sungho-seo/pageindexing.git
cd pageindexing
```

### 2단계: 필수 라이브러리 설치
FastAPI 백엔드 서버 및 PageIndex 엔진 구동에 필요한 파이썬 라이브러리들을 설치합니다.
```bash
pip install litellm==1.83.7 pymupdf PyPDF2 fastapi uvicorn python-multipart python-dotenv pyyaml
```

### 3단계: 환경 설정 파일(`.env`) 생성 (중요 ★)
보안을 위해 API 키가 포함된 `.env` 파일은 GitHub에 올라가지 않습니다. 프로젝트 최상위 폴더에 직접 `.env` 파일을 생성하고 발급받은 Gemini API 키를 설정해 주세요.

- 파일명: `.env`
- 내용:
  ```env
  GEMINI_API_KEY=여기에_발급받은_Gemini_API_Key_입력
  ```

### 4단계: 백엔드 서버 실행
서버 실행용 메인 파일을 실행합니다.
```bash
python main.py
```

### 5단계: 웹 브라우저 접속
서버 구동 완료 후 웹 브라우저에서 아래 주소로 접속해 서비스를 이용합니다.
👉 **[http://localhost:8000](http://localhost:8000)**

---

## ⚠️ 트러블슈팅: Gemini API Key 차단 해결 (API_KEY_SERVICE_BLOCKED)

질문 전송 혹은 문서 색인 중 `API_KEY_SERVICE_BLOCKED` 오류가 발생하는 것은 과부하가 아닌 **API 키 권한 설정의 문제**입니다. 다음 방법 중 하나로 해결 가능합니다.

### 방법 A: Google AI Studio에서 새 키 발급하기 (추천)
1. **[Google AI Studio](https://aistudio.google.com/)**에 접속해 로그인합니다.
2. **[Get API key]** -> **[Create API key]**를 차례로 클릭해 새로운 키를 발급받습니다.
3. 발급받은 `AIzaSy...`로 시작하는 키를 `.env` 파일의 `GEMINI_API_KEY` 값에 붙여넣습니다.

### 방법 B: 구글 클라우드 콘솔 설정 변경
1. **[구글 클라우드 콘솔](https://console.cloud.google.com/)**에 접속하여 해당 API 키가 포함된 프로젝트(프로젝트 번호: `832765144160`)를 선택합니다.
2. **[API 라이브러리]**로 이동하여 **"Generative Language API"**를 검색하고 **[사용 (Enable)]** 버튼을 클릭합니다.
3. 만약 API 키에 API 제한사항이 설정되어 있다면, **[API 및 서비스 > 사용자 인증 정보]**로 이동하여 사용 중인 API 키를 클릭한 후, 하단의 API 제한사항 목록에 **Generative Language API**를 추가해 줍니다.
