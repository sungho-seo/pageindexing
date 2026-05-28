import os
import json
import uuid
import asyncio
import shutil
import re
import pymupdf
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel
from typing import List, Optional

from dotenv import load_dotenv
load_dotenv()

# Set up environment variables for Gemini API via LiteLLM
API_KEY = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
if not API_KEY:
    raise ValueError("GEMINI_API_KEY가 설정되지 않았습니다. .env 파일이나 환경 변수를 구성해 주세요.")

os.environ["GEMINI_API_KEY"] = API_KEY
os.environ["GOOGLE_API_KEY"] = API_KEY
os.environ["OPENAI_API_KEY"] = API_KEY  # Fallback just in case

import litellm
from pageindex.client import PageIndexClient
from pageindex.page_index import page_index
from pageindex.utils import extract_json

app = FastAPI(title="PageIndex RAG Q&A Service")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Directories
WORKSPACE = "c:/Users/user/RAG/workspace"
UPLOADS_DIR = os.path.join(WORKSPACE, "uploads")
os.makedirs(UPLOADS_DIR, exist_ok=True)

# Initialize PageIndex client
client = PageIndexClient(
    api_key=API_KEY,
    model="gemini/gemini-flash-lite-latest",
    workspace=WORKSPACE
)

# Helper: Extract keywords from text for fulltext indexing
def build_keyword_index(file_path: str, doc_id: str):
    doc_pdf = pymupdf.open(file_path)
    inverted_index = {}
    stopwords = {
        "the", "and", "a", "of", "to", "in", "is", "that", "it", "on", "for", "as", "with", "was", "at", "by", "an", "be", "this", "are",
        "은", "는", "이", "가", "을", "를", "의", "에", "와", "과", "도", "으로", "로", "에서", "에게", "하며", "한", "합니다", "입니다", "있다", "없다", "것", "등", "및"
    }
    
    for page_idx, page in enumerate(doc_pdf, 1):
        text = page.get_text() or ""
        # Find all words (Korean and English)
        words = re.findall(r'[a-zA-Z0-9가-힣]+', text)
        for w in words:
            w = w.lower()
            if len(w) > 1 and w not in stopwords:
                if w not in inverted_index:
                    inverted_index[w] = []
                if page_idx not in inverted_index[w]:
                    inverted_index[w].append(page_idx)
                    
    keywords_path = os.path.join(WORKSPACE, f"{doc_id}_keywords.json")
    with open(keywords_path, "w", encoding="utf-8") as f:
        json.dump(inverted_index, f, ensure_ascii=False, indent=2)

# Helper: Search keywords across documents
def search_keywords_in_docs(query: str, doc_ids: List[str]) -> List[dict]:
    query_words = [w.lower() for w in re.findall(r'[a-zA-Z0-9가-힣]+', query) if len(w) > 1]
    if not query_words:
        return []
        
    results = []
    for doc_id in doc_ids:
        doc_info = client.documents.get(doc_id)
        if not doc_info:
            continue
            
        keywords_path = os.path.join(WORKSPACE, f"{doc_id}_keywords.json")
        if not os.path.exists(keywords_path):
            continue
            
        with open(keywords_path, "r", encoding="utf-8") as f:
            inverted_index = json.load(f)
            
        matching_pages = set()
        for qw in query_words:
            if qw in inverted_index:
                matching_pages.update(inverted_index[qw])
                
        if not matching_pages:
            continue
            
        client._ensure_doc_loaded(doc_id)
        pages_content = doc_info.get('pages', [])
        page_map = {p['page']: p['content'] for p in pages_content}
        
        for page_num in sorted(matching_pages):
            content = page_map.get(page_num, "")
            snippet = ""
            for qw in query_words:
                idx = content.lower().find(qw)
                if idx != -1:
                    start = max(0, idx - 100)
                    end = min(len(content), idx + 100)
                    snippet = "..." + content[start:end].replace("\n", " ").strip() + "..."
                    break
            results.append({
                "doc_id": doc_id,
                "doc_name": doc_info.get("doc_name", ""),
                "page": page_num,
                "snippet": snippet
            })
    return results

# Models
class ChatRequest(BaseModel):
    messages: List[dict]
    doc_ids: List[str]

# API Endpoints
@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="PDF 파일만 업로드할 수 있습니다.")
        
    doc_id = str(uuid.uuid4())
    temp_path = os.path.join(UPLOADS_DIR, f"{doc_id}_{file.filename}")
    
    with open(temp_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    async def progress_generator():
        try:
            print(f"\n[색인 시작] 문서 ID: {doc_id} | 파일명: {file.filename}")
            print(f"  [1/5] PDF 저장 완료. 임시 경로: {temp_path}")
            yield f"data: {json.dumps({'progress': 10, 'message': 'PDF 파일을 서버에 저장하고 파싱을 준비하는 중...'})}\n\n"
            await asyncio.sleep(0.5)
            
            # Extract text using PyMuPDF to show first progress
            print("  [2/5] PyMuPDF 기반 텍스트 추출 가동...")
            yield f"data: {json.dumps({'progress': 25, 'message': 'PyMuPDF를 사용하여 PDF 페이지 및 텍스트 데이터 로드 중...'})}\n\n"
            doc_pdf = pymupdf.open(temp_path)
            page_count = len(doc_pdf)
            pages = []
            for i, page in enumerate(doc_pdf, 1):
                pages.append({'page': i, 'content': page.get_text() or ''})
            print(f"  [2/5] 완료: 총 {page_count}페이지 텍스트 추출 성공")
            await asyncio.sleep(0.5)
            
            print(f"  [3/5] PageIndex 계층형 트리 및 요약 구조 구축 시작 (Gemini 모델: {client.model})...")
            yield f"data: {json.dumps({'progress': 40, 'message': f'총 {page_count}페이지의 PageIndex 계층형 트리 및 요약 구성 시작... (LLM 작동 중)'})}\n\n"
            
            # Index PDF structure in thread pool
            result = await asyncio.to_thread(
                page_index,
                doc=temp_path,
                model=client.model,
                if_add_node_summary='yes',
                if_add_node_text='yes',
                if_add_node_id='yes',
                if_add_doc_description='yes'
            )
            print("  [3/5] 완료: PageIndex 트리 빌드 성공")
            
            print("  [4/5] 역색인(Inverted Index) 키워드 맵 생성 중...")
            yield f"data: {json.dumps({'progress': 85, 'message': '텍스트 형태소 및 키워드 풀텍스트 검색 색인(Inverted Index) 생성 중...'})}\n\n"
            # Build inverted index
            await asyncio.to_thread(build_keyword_index, temp_path, doc_id)
            print("  [4/5] 완료: 역색인 파일 생성 완료")
            
            # Save client structure & meta
            print("  [5/5] 색인 데이터 워크스페이스 저장 및 메타데이터 기록 중...")
            client.documents[doc_id] = {
                'id': doc_id,
                'type': 'pdf',
                'path': temp_path,
                'doc_name': result.get('doc_name', file.filename),
                'doc_description': result.get('doc_description', ''),
                'page_count': page_count,
                'structure': result['structure'],
                'pages': pages,
            }
            client._save_doc(doc_id)
            print(f"[색인 성공] 문서 ID: {doc_id} 등록 완료!\n")
            
            yield f"data: {json.dumps({'progress': 100, 'message': '색인 처리가 완료되었습니다!', 'doc_id': doc_id})}\n\n"
        except Exception as e:
            # Clean up on failure
            if os.path.exists(temp_path):
                os.remove(temp_path)
            error_msg = str(e)
            if "API_KEY_SERVICE_BLOCKED" in error_msg:
                error_msg = "Gemini API Key가 GCP 프로젝트에서 차단되었습니다. 구글 클라우드 콘솔(https://console.cloud.google.com/)에서 'Generative Language API'를 활성화해 주세요."
            yield f"data: {json.dumps({'progress': -1, 'message': f'색인 실패: {error_msg}'})}\n\n"
            
    return StreamingResponse(progress_generator(), media_type="text/event-stream")

@app.get("/api/documents")
async def get_documents():
    docs = []
    for doc_id, doc in client.documents.items():
        docs.append({
            "id": doc_id,
            "doc_name": doc.get("doc_name", ""),
            "doc_description": doc.get("doc_description", ""),
            "page_count": doc.get("page_count", 0),
        })
    return docs

@app.delete("/api/documents/{doc_id}")
async def delete_document(doc_id: str):
    if doc_id not in client.documents:
        raise HTTPException(status_code=404, detail="문서를 찾을 수 없습니다.")
        
    doc = client.documents[doc_id]
    pdf_path = doc.get("path")
    
    # Remove files
    if pdf_path and os.path.exists(pdf_path):
        os.remove(pdf_path)
        
    json_path = os.path.join(WORKSPACE, f"{doc_id}.json")
    if os.path.exists(json_path):
        os.remove(json_path)
        
    keywords_path = os.path.join(WORKSPACE, f"{doc_id}_keywords.json")
    if os.path.exists(keywords_path):
        os.remove(keywords_path)
        
    # Remove from client metadata
    del client.documents[doc_id]
    client._save_meta(doc_id, None) # This will rebuild or remove from _meta.json
    
    # Rebuild meta to be completely clean
    meta_path = os.path.join(WORKSPACE, "_meta.json")
    if os.path.exists(meta_path):
        with open(meta_path, "r", encoding="utf-8") as f:
            meta = json.load(f)
        if doc_id in meta:
            del meta[doc_id]
            with open(meta_path, "w", encoding="utf-8") as f:
                json.dump(meta, f, ensure_ascii=False, indent=2)
                
    return {"message": "문서가 성공적으로 삭제되었습니다."}

@app.get("/api/search")
async def search_keywords(q: str, doc_ids: Optional[str] = None):
    if not q or len(q.strip()) < 2:
        return []
    
    selected_ids = []
    if doc_ids:
        selected_ids = doc_ids.split(",")
    else:
        selected_ids = list(client.documents.keys())
        
    results = search_keywords_in_docs(q, selected_ids)
    return results

@app.post("/api/chat")
async def chat(request: ChatRequest):
    # Determine which documents to query
    doc_ids = request.doc_ids
    if not doc_ids or doc_ids == ["all"]:
        doc_ids = list(client.documents.keys())
        
    if not doc_ids:
        return JSONResponse(
            status_code=400,
            content={"error": "선택되거나 등록된 문서가 없습니다. 먼저 문서를 업로드해 주세요."}
        )
        
    # Build list of document names & IDs for context
    doc_list_info = []
    for d_id in doc_ids:
        doc_info = client.documents.get(d_id)
        if doc_info:
            doc_list_info.append(f"- ID: {d_id}, 이름: {doc_info.get('doc_name')}, 설명: {doc_info.get('doc_description', '')}")
    doc_list_str = "\n".join(doc_list_info)
    
    QA_SYSTEM_PROMPT = f"""당신은 PageIndex RAG 질의 응답 에이전트입니다.
주어진 문서들의 정보와 사용자가 질문한 내용을 바탕으로 도구를 사용하여 필요한 정보를 수집하고 답변해야 합니다.
절대로 추측해서 답변하지 말고, 도구 호출을 통해 확인된 실제 페이지 내용에만 기반해 답변하세요.

사용 가능한 도구는 다음과 같습니다:
1. get_document_structure(doc_id: str) -> str
   문서의 목차/계층 구조(트리 형태)를 가져옵니다. 텍스트 본문은 포함되지 않으며 요약과 페이지 번호만 제공됩니다.
2. search_keywords(query: str) -> list
   전체 문서 또는 특정 문서의 키워드를 풀텍스트 검색하여 키워드가 포함된 문서 ID, 페이지 번호, 텍스트 스니펫을 가져옵니다.
3. get_page_content(doc_id: str, pages: str) -> list
   특정 문서의 특정 페이지 범위를 가져옵니다. (예: pages="3-5", "12"). 필요한 부분만 좁게 가져오세요.

도구 호출 시 다음 JSON 형식으로만 답변해야 합니다:
{{
    "thought": "어떤 행동을 할 것이며 왜 그 행동을 하는지에 대한 상세한 생각 과정 (한국어로 작성)",
    "tool": "도구 이름 (get_document_structure, search_keywords, get_page_content 중 하나)",
    "arguments": {{ "doc_id": "...", "pages": "..." }} 또는 {{ "query": "..." }}
}}

최종 답변을 작성할 준비가 완료되었다면 다음 JSON 형식으로 답변하세요. 반드시 페이지 번호 등 출처를 표기하세요:
{{
    "thought": "답변을 작성한 최종 생각 과정",
    "answer": "최종 답변 내용 (마크다운 포맷, 한국어로 작성)"
}}

현재 워크스페이스에 등록된 문서 목록:
{doc_list_str}
"""
    
    # Initialize message list for the agent
    agent_messages = [{"role": "system", "content": QA_SYSTEM_PROMPT}]
    # Add user's question
    user_question = request.messages[-1]["content"]
    agent_messages.append({"role": "user", "content": user_question})
    
    print(f"\n[질의응답 시작] 질문: '{user_question}'")
    print(f"  대상 문서 목록:\n  " + "\n  ".join(doc_list_info))
    
    steps = []
    max_turns = 4
    
    for turn in range(max_turns):
        try:
            print(f"  [에이전트 추론 루프] {turn + 1}/{max_turns} 단계 실행...")
            # Call LLM via LiteLLM
            response = litellm.completion(
                model=client.model,
                messages=agent_messages,
                temperature=0.0
            )
            raw_content = response.choices[0].message.content
            
            try:
                action = extract_json(raw_content)
            except:
                action = {"answer": raw_content, "thought": "응답을 JSON으로 파싱할 수 없어 즉시 최종 응답으로 반환합니다."}
                
            thought = action.get("thought", "")
            tool = action.get("tool")
            arguments = action.get("arguments", {})
            answer = action.get("answer")
            
            print(f"    ├─ 생각(Thought): {thought}")
            
            if tool:
                print(f"    ├─ 도구 호출: {tool}({json.dumps(arguments, ensure_ascii=False)})")
                # Execute tool
                result_str = ""
                if tool == "get_document_structure":
                    d_id = arguments.get("doc_id")
                    result_str = client.get_document_structure(d_id)
                elif tool == "search_keywords":
                    q = arguments.get("query")
                    search_res = search_keywords_in_docs(q, doc_ids)
                    result_str = json.dumps(search_res, ensure_ascii=False)
                elif tool == "get_page_content":
                    d_id = arguments.get("doc_id")
                    p_str = arguments.get("pages")
                    result_str = client.get_page_content(d_id, p_str)
                else:
                    result_str = f"알 수 없는 도구: {tool}"
                    
                print(f"    └─ 도구 실행 결과 (일부): {result_str[:150]}...")
                
                # Record step
                steps.append({
                    "thought": thought,
                    "tool": tool,
                    "arguments": arguments,
                    "result": result_str
                })
                
                # Append to history
                agent_messages.append({"role": "assistant", "content": json.dumps(action, ensure_ascii=False)})
                agent_messages.append({"role": "user", "content": f"도구 실행 결과: {result_str}"})
            else:
                # We have the final answer
                print(f"    └─ 최종 답변 생성 완료")
                print(f"[질의응답 성공] 답변 도출 완료!\n")
                steps.append({
                    "thought": thought,
                    "answer": answer
                })
                return {"answer": answer, "steps": steps}
                
        except Exception as e:
            error_msg = str(e)
            if "API_KEY_SERVICE_BLOCKED" in error_msg:
                return JSONResponse(
                    status_code=403,
                    content={
                        "error": "Gemini API Key가 GCP 프로젝트에서 차단되었습니다. 구글 클라우드 콘솔(https://console.cloud.google.com/)에서 'Generative Language API'가 활성화되어 있는지 확인해 주세요."
                    }
                )
            return JSONResponse(
                status_code=500,
                content={"error": f"에이전트 작동 중 오류가 발생했습니다: {error_msg}"}
            )
            
    # If max turns reached
    return {"answer": "죄송합니다. 최대 추론 단계 내에 답변을 생성하지 못했습니다.", "steps": steps}

# Serve Frontend static files
STATIC_DIR = "c:/Users/user/RAG/static"
os.makedirs(STATIC_DIR, exist_ok=True)
app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
