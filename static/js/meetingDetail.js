/* ===============================
   meetingDetail.js - 최종 수정
=================================*/

let meetingData = null; 
let currentUserName = "사용자"; 
let activeKeyword = null; 

document.addEventListener("DOMContentLoaded", async () => {
    // 사이드바
    await fetch("components/sidebar.html")
        .then(res => res.text())
        .then(html => {
            document.getElementById("sidebar-container").innerHTML = html;
            const navItems = document.querySelectorAll(".nav-menu a");
            navItems.forEach(el => el.classList.remove("active"));
            navItems.forEach(item => {
                if (item.getAttribute("href") === "meetings.html") { 
                    item.classList.add("active"); 
                }
            });
        });

    // 사용자 정보
    if(typeof loadCurrentUser === 'function') {
        try {
            const user = await loadCurrentUser(); 
            if(user && user.name) {
                currentUserName = user.name;
            }
        } catch (e) {
            console.warn("User load failed", e);
        }
    }

    // 챗봇 로드 및 이벤트 연결 (추가된 부분)
    fetch("components/chatbot.html")
        .then(res => res.text())
        .then(html => {
            const container = document.getElementById("chatbot-container");
            container.innerHTML = html;

            const closeBtn = container.querySelector(".close-chat-btn");
            const sendBtn = container.querySelector(".send-btn");
            const chatInput = container.querySelector("#chatInput");
            const floatingBtn = document.getElementById("floatingChatBtn");

            // [중요] chatbot.js 로드 시점 차이로 인한 오류 방지를 위해 화살표 함수로 감싸서 실행
            if (closeBtn) {
                closeBtn.addEventListener("click", () => {
                    if (typeof closeChat === 'function') closeChat();
                });
            }

            if (sendBtn) {
                sendBtn.addEventListener("click", () => {
                    if (typeof sendMessage === 'function') sendMessage();
                });
            }

            if (chatInput) {
                chatInput.addEventListener("keypress", (e) => {
                    if (typeof handleChatEnter === 'function') handleChatEnter(e);
                });
            }

            if (floatingBtn) {
                floatingBtn.addEventListener("click", () => {
                    if (typeof openChat === 'function') openChat();
                });
            }
        });

    const urlParams = new URLSearchParams(window.location.search);
    const meetingId = urlParams.get('id');

    if (!meetingId) {
        showErrorModal("잘못된 접근입니다.");
        setTimeout(() => window.location.href = 'meetings.html', 1500);
        return;
    }

    loadMeetingDetail(meetingId);
});

function showErrorModal(msg) {
    const modal = document.getElementById('errorModal');
    const msgEl = document.getElementById('errorModalMessage');
    if (modal && msgEl) {
        msgEl.textContent = msg;
        modal.classList.remove('hidden');
    } else {
        alert(msg);
    }
}

async function loadMeetingDetail(meetingId) {
    try {
        const [metaRes, transRes, recRes] = await Promise.all([
            fetch(`http://localhost:8080/api/meetings/${meetingId}`, { credentials: 'include' }),
            fetch(`http://localhost:8080/api/transcripts/meeting/${meetingId}`, { credentials: 'include' }),
            fetch(`http://localhost:8080/api/recordings/meeting/${meetingId}`, { credentials: 'include' })
        ]);

        if (!metaRes.ok) throw new Error("회의 정보를 찾을 수 없습니다.");
        const metaData = await metaRes.json();

        let transcripts = [];
        if (transRes.ok) {
            const tData = await transRes.json();
            transcripts = tData.filter(t => !t.isDeleted).sort((a,b) => a.sequenceOrder - b.sequenceOrder);
        }

        let realDuration = 0;
        if (recRes.ok) {
            const recData = await recRes.json();
            realDuration = recData.durationSeconds || 0;
        }

        meetingData = {
            id: metaData.meetingId,
            title: metaData.title,
            date: metaData.scheduledAt, 
            durationSeconds: realDuration, 
            participantCount: (metaData.participants || []).length,
            participants: metaData.participants || [],
            keywords: metaData.keywords || [],
            actions: metaData.actionItems || [],
            purpose: metaData.purpose,
            agenda: metaData.agenda,
            summary: metaData.summary,
            importance: metaData.importance || { level: "MEDIUM", reason: "" },
            transcripts: transcripts
        };

        renderDetailView();

    } catch (error) {
        console.error(error);
        showErrorModal("데이터 로드 실패: " + error.message);
    }
}

function renderDetailView() {
    if (!meetingData) return;

    // 1. 헤더 정보
    document.getElementById('meetingTitle').textContent = meetingData.title;
    if(meetingData.date) {
        const dateObj = new Date(meetingData.date);
        const dateStr = `${dateObj.getFullYear()}.${String(dateObj.getMonth()+1).padStart(2,'0')}.${String(dateObj.getDate()).padStart(2,'0')} ${String(dateObj.getHours()).padStart(2,'0')}:${String(dateObj.getMinutes()).padStart(2,'0')}`;
        document.getElementById('meetingDate').textContent = dateStr;
    }
    document.getElementById('meetingDuration').textContent = formatDuration(meetingData.durationSeconds);
    document.getElementById('participantCount').textContent = `${meetingData.participantCount}명 참석`;

    // 2. 대화 내용
    displayTranscripts();

    // 3. AI 요약
    const summaryTexts = document.querySelectorAll('.summary-text');
    if(summaryTexts.length >= 3) {
        summaryTexts[0].textContent = meetingData.purpose || "-";
        
        let agendaText = meetingData.agenda || "-";
        summaryTexts[1].textContent = agendaText.replace(/^-\s*/, ""); 

        let cleanSummary = (meetingData.summary || "")
            .replace(/^(요약|Summary)[:\s]*/i, "")
            .split("(중요도")[0]
            .split("중요도 평가")[0]
            .trim();
        summaryTexts[2].textContent = cleanSummary || "요약 없음";
    }
    
    // 4. 중요도
    const impEl = document.querySelector('.importance-text');
    if (impEl) {
        let level = "MEDIUM";
        let reason = "";
        if (meetingData.importance) {
            if (typeof meetingData.importance === 'object') {
                level = meetingData.importance.level || "MEDIUM";
                reason = meetingData.importance.reason || "";
            } else {
                level = meetingData.importance;
            }
        }
        
        const upperLevel = String(level).toUpperCase(); 
        let badgeClass = "medium";
        let korLabel = "보통";

        if(upperLevel === 'HIGH' || upperLevel === '높음') { badgeClass = 'high'; korLabel = '높음'; }
        else if(upperLevel === 'LOW' || upperLevel === '낮음') { badgeClass = 'low'; korLabel = '낮음'; }

        if (reason.includes("중요도 평가")) {
            reason = reason.split("중요도 평가")[0].trim();
        }

        impEl.innerHTML = `
            <div class="importance-container">
                <span class="importance-badge ${badgeClass}">${upperLevel}</span>
                <div class="importance-text-content">
                    <p class="importance-title">중요도 평가 : ${korLabel}</p>
                    <p class="importance-desc">${reason || "평가 내용 없음"}</p>
                </div>
            </div>
        `;
    }

    // 5. 키워드
    renderKeywords();

    // 6. 액션 아이템
    const actionList = document.getElementById('actionList');
    if (actionList && meetingData.actions) {
        actionList.innerHTML = meetingData.actions.map(a => {
            const source = (a.source ? a.source.toUpperCase() : 'USER');
            const sourceText = (source === 'AI') ? 'AI' : '사용자';
            const badgeClass = (source === 'AI') ? 'ai' : 'user';
            const sourceBadge = `<span class="action-source-badge ${badgeClass}">${sourceText}</span>`;
            
            const assignee = a.assignee ? `담당: ${a.assignee}` : '담당: 미지정';
            const date = a.dueDate ? `기한: ${a.dueDate.split('T')[0]}` : '기한: -';

            return `
            <div class="action-item">
                <div class="action-header">
                    <div class="action-title">
                        ${a.task} ${sourceBadge}
                    </div>
                </div>
                <div class="action-meta">
                    <div>${date}</div>
                    <div style="color: #d1d5db;">|</div>
                    <div>${assignee}</div>
                </div>
            </div>
        `;
        }).join('');
    }
}

function displayTranscripts() {
    const list = document.getElementById('transcriptList');
    list.innerHTML = '';
    
    const speakerColorMap = {}; 
    let hueIndex = 0;

    meetingData.transcripts.forEach(t => {
        const name = t.speakerName || t.speakerId || "Unknown";
        
        if (!speakerColorMap[t.speakerId]) {
            speakerColorMap[t.speakerId] = getSpeakerColor(hueIndex++);
        }
        const color = speakerColorMap[t.speakerId];
        
        const isSelf = (name.trim() === currentUserName.trim());
        const timeStr = t.startTime !== undefined ? formatTimeFromMs(t.startTime) : (t.timeLabel || "00:00:00");
        
        let contentHtml = t.text;
        if (activeKeyword) {
            try {
                const regex = new RegExp(`(${activeKeyword})`, 'gi');
                contentHtml = t.text.replace(regex, '<span class="highlight">$1</span>');
            } catch(e) {}
        }

        const div = document.createElement("div");
        div.className = `transcript-item ${isSelf ? 'is-self' : ''}`;
        
        // [수정] 헤더 내용 (이름 . 시간)
        // CSS에서 flex-direction: row; justify-content: flex-end; 이므로
        // HTML 순서대로 [이름] [시간]이 오른쪽에 붙어서 나옵니다.
        let headerContent = '';
        if (isSelf) {
            headerContent = `
                <span class="speaker-name" style="color:${color}; margin-right:8px;">${name}</span>
                <span class="time-stamp">${timeStr}</span>
            `;
        } else {
            headerContent = `
                <span class="speaker-name" style="color:${color}">${name}</span>
                <span class="time-stamp" style="margin-left:8px;">${timeStr}</span>
            `;
        }
        
        div.innerHTML = `
            <div class="speaker-avatar-wrapper">
                <div class="speaker-avatar" style="background:${color}">${name.charAt(0)}</div>
            </div>
            <div class="transcript-content">
                <div class="transcript-header">
                    ${headerContent}
                </div>
                <div class="transcript-text">${contentHtml}</div>
            </div>
        `;
        list.appendChild(div);
    });

    if (activeKeyword) {
        const first = document.querySelector('.highlight');
        if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

function renderKeywords() {
    const kwContainer = document.querySelector('.keywords');
    if (!kwContainer || !meetingData.keywords) return;

    kwContainer.innerHTML = meetingData.keywords.map(k => {
        const text = k.text || k;
        const source = (k.source ? k.source.toUpperCase() : 'USER');
        const cssClass = (source === 'AI') ? 'keyword-ai' : 'keyword-user';
        const isActive = (activeKeyword === text) ? 'active' : '';
        
        return `<div class="keyword ${cssClass} ${isActive}" onclick="toggleHighlight('${text}')">${text}</div>`;
    }).join('');
}

function toggleHighlight(keyword) {
    if (activeKeyword === keyword) {
        activeKeyword = null; 
    } else {
        activeKeyword = keyword; 
    }
    renderKeywords(); 
    displayTranscripts(); 
}

/* Export & Helper Functions (기존 유지) */
async function exportPDF() {
    if (!meetingData) return;
    if (typeof jspdf === 'undefined') {
        showErrorModal("PDF 라이브러리 오류");
        return;
    }
    const btn = document.querySelector('.action-btn.primary');
    btn.innerHTML = `생성 중...`;
    btn.disabled = true;
    try {
        const fontPath = '/static/fonts/NotoSansKR-Regular.ttf';
        const fontResponse = await fetch(fontPath);
        if (!fontResponse.ok) throw new Error("폰트 로드 실패");
        const fontBuffer = await fontResponse.arrayBuffer();
        const fontData = btoa(new Uint8Array(fontBuffer).reduce((data, byte) => data + String.fromCharCode(byte), ''));
        const { jsPDF } = jspdf;
        const doc = new jsPDF();
        doc.addFileToVFS('NotoSansKR-Regular.ttf', fontData);
        doc.addFont('NotoSansKR-Regular.ttf', 'NotoSansKR', 'normal');
        doc.setFont('NotoSansKR', 'normal');
        
        const data = {
            title: meetingData.title,
            date: document.getElementById('meetingDate').textContent,
            duration: document.getElementById('meetingDuration').textContent,
            participantCount: meetingData.participantCount,
            participants: meetingData.participants,
            purpose: meetingData.purpose,
            agenda: meetingData.agenda,
            summary: meetingData.summary,
            importance: meetingData.importance,
            keywords: meetingData.keywords,
            actions: meetingData.actions,
            transcripts: meetingData.transcripts.map(t => ({
                name: t.speakerName || t.speakerId,
                time: t.startTime !== undefined ? formatTimeFromMs(t.startTime) : (t.timeLabel || "00:00:00"), 
                text: t.text
            }))
        };
        drawPDF(doc, data);
        doc.save(`${data.title}.pdf`);
    } catch (e) {
        console.error(e);
        showErrorModal("PDF 생성 실패");
    } finally {
        btn.innerHTML = `PDF 다운로드`;
        btn.disabled = false;
    }
}

function drawPDF(doc, data) {
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    const contentWidth = pageWidth - (margin * 2);
    let currentY = 20;
    
    // 1. 헤더 (제목, 일시, 시간, 참석자)
    doc.setFontSize(22); doc.setTextColor(44, 62, 80);
    const titleLines = doc.splitTextToSize(data.title, contentWidth);
    doc.text(titleLines, margin, currentY);
    currentY += (titleLines.length * 10) + 10;
    
    doc.setFontSize(10); doc.setTextColor(100, 100, 100);
    // [추가] 소요 시간 표시
    doc.text(`일시: ${data.date}  |  소요 시간: ${data.duration}`, margin, currentY);
    currentY += 6;
    
    doc.text(`참석자(${data.participantCount}명): ${data.participants.join(', ')}`, margin, currentY);
    currentY += 15;
    
    doc.setDrawColor(200, 200, 200); doc.line(margin, currentY, pageWidth - margin, currentY);
    currentY += 15;

    // 2. AI 요약 섹션
    doc.setFontSize(14); doc.setTextColor(0,0,0);
    doc.text("1. AI 요약", margin, currentY);
    currentY += 10;
    doc.setFontSize(11);
    
    // 중요도 표시 (색상 로직 통일: 높음-빨강, 낮음-노랑, 보통-주황)
    const impLevel = (typeof data.importance === 'object') ? data.importance.level : data.importance;
    const reasonText = (typeof data.importance === 'object') ? data.importance.reason : "";
    
    let impColor = [0,0,0];
    const upperImp = String(impLevel).toUpperCase();
    
    if (upperImp === 'HIGH' || upperImp === '높음') impColor = [239, 68, 68];       // Red
    else if (upperImp === 'LOW' || upperImp === '낮음') impColor = [234, 179, 8];   // Yellow
    else impColor = [249, 115, 22];                                                 // Orange (Medium)
    
    doc.setTextColor(...impColor);
    doc.text(`[중요도: ${impLevel}]`, margin, currentY);
    doc.setTextColor(80, 80, 80);
    
    const reasonLines = doc.splitTextToSize(`- 사유: ${reasonText}`, contentWidth);
    doc.text(reasonLines, margin, currentY + 6);
    currentY += (reasonLines.length * 6) + 10;
    
    // 목적, 안건, 요약 내용
    const items = [{l:"회의 목적", t: data.purpose}, {l:"주요 안건", t: data.agenda}, {l:"전체 요약", t: data.summary}];
    items.forEach(i => {
        doc.setTextColor(0,0,0); doc.text(`[${i.l}]`, margin, currentY);
        doc.setTextColor(80,80,80);
        const lines = doc.splitTextToSize(i.t || "", contentWidth-5);
        doc.text(lines, margin+5, currentY+6);
        currentY += (lines.length*6) + 10;
        
        // 페이지 넘김 체크
        if (currentY > pageHeight - margin) { doc.addPage(); currentY = 20; }
    });

    // [추가] 하이라이트 키워드 섹션
    doc.setTextColor(0, 0, 0);
    doc.text(`[하이라이트 키워드]`, margin, currentY);
    currentY += 6;
    
    if (data.keywords && data.keywords.length > 0) {
        // 키워드 배열이 문자열인지 객체인지 확인하여 처리
        const keywordStr = data.keywords.map(k => {
            const text = k.text || k;
            // source가 있으면 표시, 없으면 생략
            const source = k.source ? (String(k.source).toUpperCase() === 'AI' ? '(AI)' : '(User)') : '';
            return `${text} ${source}`;
        }).join(',  ');
        
        const kwLines = doc.splitTextToSize(keywordStr, contentWidth - 5);
        doc.setTextColor(41, 128, 185); // 파란색
        doc.text(kwLines, margin + 5, currentY);
        currentY += (kwLines.length * 6) + 10;
    } else {
        doc.setTextColor(150, 150, 150);
        doc.text("키워드 없음", margin + 5, currentY);
        currentY += 10;
    }

    if (currentY > pageHeight - 40) { doc.addPage(); currentY=20; }

    // [추가] 액션 아이템 섹션
    doc.setFontSize(14); doc.setTextColor(0,0,0);
    doc.text("2. 액션 아이템", margin, currentY);
    currentY += 8;
    
    if (data.actions && data.actions.length > 0) {
        doc.setFontSize(10);
        data.actions.forEach(a => {
            const sourceTag = (a.source && String(a.source).toUpperCase() === 'AI') ? '[AI]' : '[User]';
            const assignee = a.assignee || "미지정";
            const date = a.dueDate ? a.dueDate.split('T')[0] : "-";
            
            const actionText = `• ${sourceTag} ${a.task} (담당: ${assignee}, 기한: ${date})`;
            const actionLines = doc.splitTextToSize(actionText, contentWidth);
            
            // 액션 아이템 페이지 넘김 체크
            if (currentY + (actionLines.length * 6) > pageHeight - margin) {
                doc.addPage();
                currentY = 20;
            }
            
            doc.text(actionLines, margin, currentY);
            currentY += (actionLines.length * 6) + 2;
        });
    } else {
        doc.setFontSize(10); doc.setTextColor(150, 150, 150);
        doc.text("등록된 액션 아이템이 없습니다.", margin, currentY);
    }
    currentY += 15;

    // 3. 상세 대화 내용 (번호 수정: 2 -> 3)
    if (currentY > pageHeight - 40) { doc.addPage(); currentY=20; }
    doc.setFontSize(14); doc.setTextColor(0,0,0);
    doc.text("3. 상세 대화 내용", margin, currentY);
    currentY += 10;
    doc.setFontSize(10);
    
    // [수정] 랜덤 색상 생성 로직
    const speakerColors = {};
    function getRandomColor() {
        const r = Math.floor(Math.random() * 200); 
        const g = Math.floor(Math.random() * 200);
        const b = Math.floor(Math.random() * 200);
        return [r, g, b];
    }
    
    data.transcripts.forEach(t => {
        const name = t.speakerName || t.name || t.speakerId || "Unknown";
        const time = t.time || (t.startTime ? formatTimeFromMs(t.startTime) : "00:00:00");
        const text = t.text || "";

        if(!speakerColors[name]) { 
            speakerColors[name] = getRandomColor(); 
        }
        const thisColor = speakerColors[name];
        
        // 1. 텍스트 줄 수 미리 계산
        const textLines = doc.splitTextToSize(text, contentWidth);
        
        // 2. 필요한 전체 높이 계산 (헤더 높이 5 + 텍스트 높이 + 여백 8)
        const blockHeight = 5 + (textLines.length * 5) + 8;
        
        // 3. 공간 부족 시 통째로 다음 페이지로 이동
        if (currentY + blockHeight > pageHeight - margin) {
            doc.addPage();
            currentY = 20; // 새 페이지 상단 여백
        }
        
        // 4. 헤더 출력 (이름 + 시간)
        const header = `${name} [${time}]`;
        doc.setTextColor(...thisColor); 
        doc.text(header, margin, currentY); 
        currentY += 5;
        
        // 5. 본문 출력
        doc.setTextColor(0,0,0);
        doc.text(textLines, margin, currentY); 
        
        // 다음 블록을 위한 Y축 이동
        currentY += (textLines.length * 5) + 8;
    });
}

function goToEdit() {
    const urlParams = new URLSearchParams(window.location.search);
    window.location.href = `recordFinish.html?meetingId=${urlParams.get('id')}`;
}

async function deleteMeeting() {
    if (!meetingData || !meetingData.id) return;
    if (!confirm("정말 삭제하시겠습니까?")) return;
    try {
        const response = await fetch(`http://localhost:8080/api/meetings/${meetingData.id}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        if (response.ok) {
            alert("삭제되었습니다.");
            window.location.href = 'meetings.html'; 
        } else {
            throw new Error("삭제 실패");
        }
    } catch (error) {
        console.error(error);
        showErrorModal("오류 발생");
    }
}

function formatDuration(sec) {
    if(!sec) return "00:00:00";
    const h = Math.floor(sec/3600);
    const m = Math.floor((sec%3600)/60);
    const s = Math.floor(sec%60);
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function formatTimeFromMs(ms) {
    if (!ms && ms !== 0) return "00:00:00";
    const totalSeconds = Math.floor(ms / 1000);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function getSpeakerColor(index) {
    const hue = (index * 137.5) % 360;
    return `hsl(${hue}, 65%, 40%)`;
}