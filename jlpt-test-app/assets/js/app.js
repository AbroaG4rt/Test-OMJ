/**
 * Main Application Logic
 * Modular implementation relying purely on Vanilla JS and localStorage.
 */

// --- STATE MANAGEMENT ---
const AppState = {
    user: JSON.parse(localStorage.getItem('jlpt_user')) || null,
    testState: JSON.parse(localStorage.getItem('jlpt_test_state')) || {
        level: null,
        answers: {}, // { questionId: selectedIndex }
        currentQuestionIndex: 0,
        timeLeft: 0,
        isSubmitted: false
    },
    saveUser(user) {
        this.user = user;
        localStorage.setItem('jlpt_user', JSON.stringify(user));
    },
    logout() {
        this.user = null;
        localStorage.removeItem('jlpt_user');
        window.location.href = 'login.html';
    },
    saveTestState() {
        localStorage.setItem('jlpt_test_state', JSON.stringify(this.testState));
    },
    clearTestState() {
        this.testState = { level: null, answers: {}, currentQuestionIndex: 0, timeLeft: 0, isSubmitted: false };
        localStorage.removeItem('jlpt_test_state');
    }
};

// --- AUTHENTICATION ---
async function initAuth() {
    const loginForm = document.getElementById('login-form');
    const errorMsg = document.getElementById('error-msg');

    if (AppState.user) {
        window.location.href = 'dashboard.html';
        return;
    }

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = loginForm.username.value;
            const password = loginForm.password.value;

            try {
                const response = await fetch('data/users.json');
                const users = await response.json();
                
                const validUser = users.find(u => u.username === username && u.password === password);
                
                if (validUser) {
                    AppState.saveUser({ username: validUser.username, isLoggedIn: true });
                    window.location.href = 'dashboard.html';
                } else {
                    errorMsg.textContent = 'Invalid username or password.';
                    errorMsg.style.color = 'red';
                }
            } catch (err) {
                console.error('Failed to load users data', err);
            }
        });
    }
}

function checkAuthGuard() {
    if (!AppState.user || !AppState.user.isLoggedIn) {
        window.location.href = 'login.html';
    }
    
    // Setup logout button if it exists
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            AppState.logout();
        });
    }
}

// --- DASHBOARD ---
function initDashboard() {
    checkAuthGuard();
    
    const levelCards = document.querySelectorAll('.level-card');
    levelCards.forEach(card => {
        card.addEventListener('click', (e) => {
            e.preventDefault();
            const level = card.dataset.level;
            // Clear previous test state when starting a new one
            if (AppState.testState.level !== level || AppState.testState.isSubmitted) {
                AppState.clearTestState();
                AppState.testState.level = level;
                AppState.saveTestState();
            }
            window.location.href = `test.html?level=${level}`;
        });
    });
}

// --- TEST ENGINE ---
let timerInterval;

async function initTestEngine() {
    checkAuthGuard();
    
    const urlParams = new URLSearchParams(window.location.search);
    const level = urlParams.get('level') || 'n5'; // default to n5
    
    // If state doesn't match URL, update it.
    if (!AppState.testState.level) {
        AppState.testState.level = level;
        AppState.saveTestState();
    }
    
    // Check if test was already submitted
    if (AppState.testState.isSubmitted && AppState.testState.level === level) {
         window.location.href = 'result.html';
         return;
    }

    try {
        const response = await fetch(`data/${level}.json`);
        if (!response.ok) throw new Error('Level not found');
        const testData = await response.json();
        
        // Initialize timer if not started
        if (!AppState.testState.timeLeft) {
            AppState.testState.timeLeft = testData.timeLimit * 60; // Convert minutes to seconds
            AppState.saveTestState();
        }
        
        startTimer();
        renderTestInterface(testData);

    } catch (err) {
        console.error(err);
        document.body.innerHTML = '<div class="container text-center mt-4"><h3>Error Loading Test Data.</h3><a href="dashboard.html">Go Back</a></div>';
    }
}

function startTimer() {
    const timerEl = document.getElementById('timer');
    if(!timerEl) return;
    
    const updateDisplay = () => {
        const h = Math.floor(AppState.testState.timeLeft / 3600);
        const m = Math.floor((AppState.testState.timeLeft % 3600) / 60);
        const s = AppState.testState.timeLeft % 60;
        
        timerEl.textContent = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    updateDisplay();
    
    timerInterval = setInterval(() => {
        AppState.testState.timeLeft--;
        AppState.saveTestState();
        updateDisplay();
        
        if (AppState.testState.timeLeft <= 0) {
            clearInterval(timerInterval);
            finishTest();
        }
    }, 1000);
}

function renderTestInterface(testData) {
    const qTextEl = document.getElementById('question-text');
    const optionsEl = document.getElementById('options-container');
    const prevBtn = document.getElementById('btn-prev');
    const nextBtn = document.getElementById('btn-next');
    const submitBtn = document.getElementById('btn-submit');
    const pgBar = document.getElementById('progress-bar');
    const qCount = document.getElementById('question-count');

    let currentIdx = AppState.testState.currentQuestionIndex;
    const questions = testData.questions;

    const renderQuestion = (idx) => {
        const q = questions[idx];
        qTextEl.textContent = q.question;
        optionsEl.innerHTML = '';
        
        q.options.forEach((optText, optIdx) => {
            const btn = document.createElement('button');
            btn.className = 'option-btn';
            btn.textContent = optText;
            
            // Check if selected
            if (AppState.testState.answers[q.id] === optIdx) {
                btn.classList.add('selected');
            }
            
            btn.onclick = () => {
                document.querySelectorAll('.option-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                AppState.testState.answers[q.id] = optIdx;
                AppState.saveTestState();
            };
            
            optionsEl.appendChild(btn);
        });

        // Update Nav
        prevBtn.disabled = idx === 0;
        
        if (idx === questions.length - 1) {
            nextBtn.style.display = 'none';
            submitBtn.style.display = 'inline-block';
        } else {
            nextBtn.style.display = 'inline-block';
            submitBtn.style.display = 'none';
        }

        // Progress
        pgBar.style.width = `${((idx + 1) / questions.length) * 100}%`;
        qCount.textContent = `Question ${idx + 1} of ${questions.length}`;
        
        AppState.testState.currentQuestionIndex = idx;
        AppState.saveTestState();
    };

    renderQuestion(currentIdx);

    prevBtn.onclick = () => {
        if (currentIdx > 0) renderQuestion(--currentIdx);
    };

    nextBtn.onclick = () => {
        if (currentIdx < questions.length - 1) renderQuestion(++currentIdx);
    };

    submitBtn.onclick = () => {
        if(confirm("Are you sure you want to submit your answers?")) {
            finishTest();
        }
    };
}

function finishTest() {
    clearInterval(timerInterval);
    AppState.testState.isSubmitted = true;
    AppState.saveTestState();
    window.location.href = 'result.html';
}

// --- RESULTS GENERATION ---
async function initResults() {
    checkAuthGuard();
    
    if (!AppState.testState.isSubmitted || !AppState.testState.level) {
        window.location.href = 'dashboard.html';
        return;
    }

    try {
        const response = await fetch(`data/${AppState.testState.level}.json`);
        const testData = await response.json();
        const questions = testData.questions;
        const userAnswers = AppState.testState.answers;
        
        let score = 0;
        let analysisHTML = '';
        
        questions.forEach((q, i) => {
            const uAns = userAnswers[q.id];
            const isCorrect = uAns === q.correct_answer;
            if (isCorrect) score++;
            
            const uAnsText = uAns !== undefined ? q.options[uAns] : 'Not answered';
            const cAnsText = q.options[q.correct_answer];
            
            analysisHTML += `
                <div class="analysis-item">
                    <h4>Q${i + 1}: ${q.question}</h4>
                    <p><strong>Your Answer:</strong> ${uAnsText}</p>
                    <p><strong>Correct Answer:</strong> ${cAnsText}</p>
                    <div class="badge ${isCorrect ? 'badge-success' : 'badge-error'}">
                        ${isCorrect ? 'Correct' : 'Incorrect'}
                    </div>
                    <p class="mt-4" style="color: var(--text-muted); font-size: 0.9em;">
                        <strong>Explanation:</strong> ${q.explanation}
                    </p>
                </div>
            `;
        });
        
        const percentage = Math.round((score / questions.length) * 100);
        document.getElementById('final-score').textContent = `${percentage}%`;
        document.getElementById('correct-count').textContent = `${score} / ${questions.length} Correct`;
        document.getElementById('analysis-container').innerHTML = analysisHTML;
        
        const feedbackEl = document.getElementById('feedback-msg');
        if (percentage >= 80) {
            feedbackEl.className = 'feedback-box';
            feedbackEl.innerHTML = '<strong>Excellent!</strong> You have a strong grasp of this level. Keep practicing to maintain your proficiency!';
        } else if (percentage >= 50) {
            feedbackEl.className = 'feedback-box';
            feedbackEl.innerHTML = '<strong>Good effort!</strong> Review the incorrect answers and focus on your vocabulary and grammar fundamentals.';
        } else {
            feedbackEl.className = 'feedback-box needs-improvement';
            feedbackEl.innerHTML = '<strong>Needs Improvement.</strong> We highly recommend reviewing foundational grammar rules and foundational vocabulary for this level before retaking.';
        }
        
    } catch (err) {
        console.error(err);
    }
}

async function exportPDF() {
    const { jsPDF } = window.jspdf;
    
    // We capture the main results container
    const resultElement = document.getElementById('report-content');
    
    // Show loading text on button
    const btn = document.getElementById('generate-pdf');
    const originalText = btn.innerHTML;
    btn.innerHTML = 'Generating...';
    
    try {
        const canvas = await html2canvas(resultElement, { scale: 2 });
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
        
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        pdf.save(`JLPT_${AppState.testState.level.toUpperCase()}_Result_${AppState.user.username}.pdf`);
    } catch(err) {
        console.error("PDF generation failed", err);
        alert("Failed to generate PDF. Check console.");
    } finally {
        btn.innerHTML = originalText;
    }
}

// Global PDF event listener setup
document.addEventListener('DOMContentLoaded', () => {
    const pdfBtn = document.getElementById('generate-pdf');
    if (pdfBtn) {
        pdfBtn.addEventListener('click', exportPDF);
    }
});
