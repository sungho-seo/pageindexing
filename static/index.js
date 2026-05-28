// Frontend state
let documents = [];
let activeTab = 'chat';
let chatHistory = [];
let selectedDocs = new Set();
let isSelectAllDocs = true;
let isChatting = false;

// DOM Elements
const docCheckboxList = document.getElementById('doc-checkbox-list');
const selectAllDocsCheckbox = document.getElementById('select-all-docs');
const keywordSearchInput = document.getElementById('keyword-search-input');
const keywordSearchBtn = document.getElementById('keyword-search-btn');
const searchResultsList = document.getElementById('search-results-list');
const chatHistoryContainer = document.getElementById('chat-history-container');
const chatTextarea = document.getElementById('chat-textarea');
const sendChatBtn = document.getElementById('send-chat-btn');
const welcomeMessage = document.getElementById('welcome-message');
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const progressContainer = document.getElementById('progress-container');
const progressStatusText = document.getElementById('progress-status-text');
const progressPercentText = document.getElementById('progress-percent-text');
const progressBarFillEl = document.getElementById('progress-bar-fill-el');
const progressDetailText = document.getElementById('progress-detail-text');
const documentsTableBody = document.getElementById('documents-table-body');

// Initialize
window.addEventListener('DOMContentLoaded', () => {
    fetchDocuments();
    setupEventListeners();
});

// Setup Event Listeners
function setupEventListeners() {
    // Tab switching is handled by inline onclick, but we expose global function
    window.switchTab = switchTab;

    // Checkbox: Select All Docs
    selectAllDocsCheckbox.addEventListener('change', (e) => {
        isSelectAllDocs = e.target.checked;
        toggleIndividualCheckboxes(!isSelectAllDocs);
        renderDocuments();
    });

    // Keyword Search
    keywordSearchBtn.addEventListener('click', performKeywordSearch);
    keywordSearchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            performKeywordSearch();
        }
    });

    // Drag and Drop Upload
    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFileUpload(e.target.files[0]);
        }
    });

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            handleFileUpload(e.dataTransfer.files[0]);
        }
    });

    // Chat textarea auto-resize
    chatTextarea.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight - 20) + 'px';
    });

    // Chat send button & Enter key
    sendChatBtn.addEventListener('click', sendChatMessage);
    chatTextarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendChatMessage();
        }
    });
}

// Switch between Chat and Docs tab
function switchTab(tab) {
    activeTab = tab;
    
    // Toggle active state in headers
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`tab-${tab}`).classList.add('active');

    // Toggle active panels
    document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));
    document.getElementById(`panel-${tab}`).classList.add('active');
}

// Fetch Document list from server
async function fetchDocuments() {
    try {
        const response = await fetch('/api/documents');
        if (response.ok) {
            documents = await response.ok ? await response.json() : [];
            renderDocuments();
        }
    } catch (err) {
        console.error('Error fetching documents:', err);
    }
}

// Render document list in both table and sidebar checkboxes
function renderDocuments() {
    // 1. Sidebar Checkboxes
    if (documents.length === 0) {
        docCheckboxList.innerHTML = '<div class="no-docs-message">업로드된 문서가 없습니다.</div>';
    } else {
        docCheckboxList.innerHTML = '';
        documents.forEach(doc => {
            const container = document.createElement('label');
            container.className = 'custom-checkbox-container';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = doc.id;
            checkbox.disabled = isSelectAllDocs;
            checkbox.checked = isSelectAllDocs || selectedDocs.has(doc.id);
            
            checkbox.addEventListener('change', (e) => {
                if (e.target.checked) {
                    selectedDocs.add(doc.id);
                } else {
                    selectedDocs.delete(doc.id);
                }
            });

            const checkmark = document.createElement('span');
            checkmark.className = 'checkmark';

            const labelText = document.createElement('span');
            labelText.className = 'label-text';
            labelText.innerHTML = `${doc.doc_name} <span class="doc-subtext">${doc.page_count}페이지</span>`;

            container.appendChild(checkbox);
            container.appendChild(checkmark);
            container.appendChild(labelText);
            docCheckboxList.appendChild(container);
        });
    }

    // 2. Documents Tab Table
    if (documents.length === 0) {
        documentsTableBody.innerHTML = `
            <tr>
                <td colspan="4" class="empty-table-message">등록된 문서가 없습니다. 새로운 문서를 업로드해 주세요.</td>
            </tr>
        `;
    } else {
        documentsTableBody.innerHTML = '';
        documents.forEach(doc => {
            const tr = document.createElement('tr');
            
            tr.innerHTML = `
                <td class="doc-title-cell">
                    <i class="fa-solid fa-file-pdf pdf-icon-small"></i>
                    <span>${doc.doc_name}</span>
                </td>
                <td class="doc-desc-cell" title="${doc.doc_description || '설명 없음'}">
                    ${doc.doc_description || '설명 없음'}
                </td>
                <td>${doc.page_count} 페이지</td>
                <td>
                    <button class="delete-doc-btn" onclick="deleteDocument('${doc.id}')" title="삭제">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </td>
            `;
            documentsTableBody.appendChild(tr);
        });
    }
}

// Toggle individual checkboxes status
function toggleIndividualCheckboxes(enabled) {
    const checkboxes = docCheckboxList.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(cb => {
        cb.disabled = !enabled;
        if (!enabled) {
            cb.checked = true;
        } else {
            cb.checked = selectedDocs.has(cb.value);
        }
    });
}

// Delete a document
async function deleteDocument(docId) {
    if (!confirm('정말로 이 문서를 삭제하시겠습니까? 관련 색인 정보가 모두 제거됩니다.')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/documents/${docId}`, {
            method: 'DELETE'
        });
        if (response.ok) {
            selectedDocs.delete(docId);
            await fetchDocuments();
        } else {
            alert('문서 삭제에 실패했습니다.');
        }
    } catch (err) {
        console.error('Error deleting document:', err);
    }
}

// Handle PDF file upload via SSE Stream
async function handleFileUpload(file) {
    const formData = new FormData();
    formData.append('file', file);

    progressContainer.style.display = 'block';
    updateUploadProgress(10, 'PDF 파일을 서버에 저장하고 파싱을 준비하는 중...');

    try {
        const response = await fetch('/api/upload', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.detail || '업로드 중 오류가 발생했습니다.');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n\n');
            buffer = lines.pop(); // Last partial line

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = JSON.parse(line.slice(6));
                    
                    if (data.progress === -1) {
                        // Error
                        updateUploadProgress(-1, data.message);
                        alert(`색인 실패: ${data.message}`);
                        return;
                    }

                    updateUploadProgress(data.progress, data.message);

                    if (data.progress === 100) {
                        // Done
                        setTimeout(() => {
                            progressContainer.style.display = 'none';
                            fileInput.value = '';
                            fetchDocuments();
                        }, 1000);
                        return;
                    }
                }
            }
        }
    } catch (err) {
        console.error('Error uploading file:', err);
        updateUploadProgress(-1, `오류 발생: ${err.message}`);
    }
}

// Update progress bar
function updateUploadProgress(percent, message) {
    if (percent === -1) {
        progressStatusText.innerText = '인덱싱 실패';
        progressPercentText.innerText = '오류';
        progressBarFillEl.style.width = '100%';
        progressBarFillEl.style.backgroundColor = 'var(--error)';
        progressDetailText.innerText = message;
        progressDetailText.style.color = 'var(--error)';
        return;
    }

    progressBarFillEl.style.backgroundColor = ''; // Restore default gradient
    progressDetailText.style.color = '';
    progressStatusText.innerText = percent === 100 ? '인덱싱 완료' : '인덱싱 진행 중...';
    progressPercentText.innerText = `${percent}%`;
    progressBarFillEl.style.width = `${percent}%`;
    progressDetailText.innerText = message;
}

// Perform keyword fulltext search
async function performKeywordSearch() {
    const query = keywordSearchInput.value.trim();
    if (!query) {
        searchResultsList.innerHTML = '';
        return;
    }

    if (query.length < 2) {
        searchResultsList.innerHTML = '<div class="no-docs-message">검색어는 2글자 이상 입력해 주세요.</div>';
        return;
    }

    let url = `/api/search?q=${encodeURIComponent(query)}`;
    if (!isSelectAllDocs && selectedDocs.size > 0) {
        const docIdList = Array.from(selectedDocs).join(',');
        url += `&doc_ids=${docIdList}`;
    }

    try {
        searchResultsList.innerHTML = '<div class="no-docs-message"><i class="fa-solid fa-spinner fa-spin"></i> 검색 중...</div>';
        const response = await fetch(url);
        if (response.ok) {
            const results = await response.json();
            renderSearchResults(results, query);
        } else {
            searchResultsList.innerHTML = '<div class="no-docs-message">검색 실패</div>';
        }
    } catch (err) {
        console.error('Error during keyword search:', err);
        searchResultsList.innerHTML = '<div class="no-docs-message">검색 실패</div>';
    }
}

// Render search results
function renderSearchResults(results, query) {
    if (results.length === 0) {
        searchResultsList.innerHTML = '<div class="no-docs-message">매칭되는 키워드가 없습니다.</div>';
        return;
    }

    searchResultsList.innerHTML = '';
    results.forEach(res => {
        const item = document.createElement('div');
        item.className = 'search-result-item';
        
        // Highlight keyword in snippet
        let highlightedSnippet = res.snippet;
        const escapedQuery = query.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regex = new RegExp(`(${escapedQuery})`, 'gi');
        highlightedSnippet = highlightedSnippet.replace(regex, '<strong style="color: var(--accent-primary); background: rgba(138,43,226,0.1); padding: 0 2px; border-radius: 2px;">$1</strong>');

        item.innerHTML = `
            <div class="result-doc-name">${res.doc_name}</div>
            <div class="result-snippet">${highlightedSnippet}</div>
            <div class="result-page">${res.page} 페이지</div>
        `;
        
        // Click to view snippet/ask chat automatically
        item.addEventListener('click', () => {
            switchTab('chat');
            chatTextarea.value = `"${res.doc_name}" 문서의 ${res.page}페이지에서 다음 내용에 대해 자세히 설명해줘: "${query}"`;
            chatTextarea.style.height = 'auto';
            chatTextarea.style.height = (chatTextarea.scrollHeight - 20) + 'px';
            chatTextarea.focus();
        });

        searchResultsList.appendChild(item);
    });
}

// Send chat message
async function sendChatMessage() {
    const question = chatTextarea.value.trim();
    if (!question || isChatting) return;

    if (documents.length === 0) {
        alert('질문할 문서가 없습니다. 먼저 [문서 관리] 탭에서 PDF 문서를 업로드해 주세요.');
        return;
    }

    // Prepare message structure
    isChatting = true;
    chatTextarea.value = '';
    chatTextarea.style.height = 'auto';
    sendChatBtn.disabled = true;

    // Remove welcome message on first question
    if (welcomeMessage) {
        welcomeMessage.remove();
    }

    // Render user message bubble
    appendMessage('user', '나', question);

    // Render loading assistant message bubble
    const loadingMessageId = appendMessage('assistant', 'PageIndex Agent', '<div class="no-docs-message" style="text-align: left; padding: 0;"><i class="fa-solid fa-spinner fa-spin"></i> 에이전트가 생각 중이며 필요한 문서 페이지를 조회하고 있습니다...</div>');

    // Get selected documents
    const docIds = isSelectAllDocs ? ["all"] : Array.from(selectedDocs);

    // Call chat API
    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: [{ role: 'user', content: question }],
                doc_ids: docIds
            })
        });

        const loadingBubble = document.getElementById(loadingMessageId);
        if (loadingBubble) {
            loadingBubble.remove();
        }

        if (response.ok) {
            const data = await response.json();
            appendMessage('assistant', 'PageIndex Agent', data.answer, data.steps);
        } else {
            const errData = await response.json();
            const errMsg = errData.error || '답변을 받아오는데 실패했습니다.';
            appendMessage('assistant', 'PageIndex Agent', `<span style="color: var(--error);"><i class="fa-solid fa-triangle-exclamation"></i> 오류 발생: ${errMsg}</span>`);
        }
    } catch (err) {
        console.error('Error sending chat message:', err);
        const loadingBubble = document.getElementById(loadingMessageId);
        if (loadingBubble) loadingBubble.remove();
        appendMessage('assistant', 'PageIndex Agent', `<span style="color: var(--error);"><i class="fa-solid fa-triangle-exclamation"></i> 서버 통신 오류가 발생했습니다.</span>`);
    } finally {
        isChatting = false;
        sendChatBtn.disabled = false;
    }
}

// Append a message to the chat history container
function appendMessage(sender, senderName, text, steps = []) {
    const messageId = `msg-${Date.now()}`;
    const card = document.createElement('div');
    card.className = `message-card ${sender}`;
    card.id = messageId;

    const iconClass = sender === 'user' ? 'fa-user' : 'fa-brain';
    const renderedText = sender === 'user' ? escapeHtml(text).replace(/\n/g, '<br>') : renderMarkdown(text);

    // Generate steps accordion if available
    let stepsHtml = '';
    if (steps && steps.length > 0) {
        stepsHtml = `
            <div class="thought-accordion">
                <div class="thought-header" onclick="toggleThought(this)">
                    <span><i class="fa-solid fa-lightbulb" style="color: var(--warning);"></i> 에이전트 생각 과정 (PageIndex 추론 단계)</span>
                    <i class="fa-solid fa-chevron-down"></i>
                </div>
                <div class="thought-body" style="display: none;">
        `;
        steps.forEach((step, idx) => {
            if (step.tool) {
                let argsPretty = JSON.stringify(step.arguments);
                let resultSnippet = step.result || '결과 없음';
                stepsHtml += `
                    <div class="thought-step">
                        <div class="step-title">${idx + 1}단계: 도구 실행 [${step.tool}]</div>
                        <div class="step-details"><strong>생각:</strong> ${escapeHtml(step.thought)}</div>
                        <div class="step-details"><strong>매개변수:</strong> <code>${escapeHtml(argsPretty)}</code></div>
                        <pre class="step-result">${escapeHtml(resultSnippet)}</pre>
                    </div>
                `;
            } else {
                stepsHtml += `
                    <div class="thought-step">
                        <div class="step-title">${idx + 1}단계: 최종 답변 수립</div>
                        <div class="step-details"><strong>생각:</strong> ${escapeHtml(step.thought)}</div>
                    </div>
                `;
            }
        });
        stepsHtml += `
                </div>
            </div>
        `;
    }

    card.innerHTML = `
        <div class="avatar-wrapper">
            <i class="fa-solid ${iconClass}"></i>
        </div>
        <div class="message-content-wrapper">
            <span class="sender-name">${senderName}</span>
            <div class="message-bubble">
                ${renderedText}
                ${stepsHtml}
            </div>
        </div>
    `;

    chatHistoryContainer.appendChild(card);
    chatHistoryContainer.scrollTop = chatHistoryContainer.scrollHeight;
    return messageId;
}

// Setup thought toggle
window.toggleThought = function(header) {
    const body = header.nextElementSibling;
    const chevron = header.querySelector(".fa-chevron-down");
    if (body.style.display === "none") {
        body.style.display = "block";
        chevron.style.transform = "rotate(180deg)";
    } else {
        body.style.display = "none";
        chevron.style.transform = "rotate(0deg)";
    }
    chatHistoryContainer.scrollTop = chatHistoryContainer.scrollHeight;
};

// Micro Markdown rendering helper
function renderMarkdown(text) {
    if (!text) return "";
    let html = text;
    // Escape HTML tags to prevent XSS
    html = html.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    
    // Bold
    html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    
    // Code blocks
    html = html.replace(/```(.*?)\n([\s\S]*?)```/g, "<pre><code>$2</code></pre>");
    
    // Inline code
    html = html.replace(/`(.*?)`/g, "<code>$1</code>");
    
    // Blockquotes
    html = html.replace(/^\s*&gt;\s+(.*)$/gm, "<blockquote>$1</blockquote>");
    
    // Headers
    html = html.replace(/^### (.*)$/gm, "<h3>$1</h3>");
    html = html.replace(/^## (.*)$/gm, "<h2>$1</h2>");
    html = html.replace(/^# (.*)$/gm, "<h1>$1</h1>");
    
    // Lists (ensure wrapping ul/ol)
    html = html.replace(/^\s*[-*]\s+(.*)$/gm, "<li>$1</li>");
    
    // Linebreaks (preserve spacing)
    html = html.replace(/\n/g, "<br>");
    return html;
}

// Escape HTML entities to prevent XSS
function escapeHtml(text) {
    if (!text) return "";
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
