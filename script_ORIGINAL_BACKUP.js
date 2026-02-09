/*
FILE PURPOSE:
Main application logic for PlayStation Cafe Manager.
Handles Authentication, Device State, Time Tracking, and Billing.

DEPENDENCIES:
- DOM Elements defined in index.html
- localStorage for persistence
- style.css classes (.busy, .available, etc.)

GLOBAL VARIABLES:
- currentUser: Object (Stores logged-in user context)
- appInterval: Number (ID of the main heartbeat timer)
*/

// ==========================================
// 1. CONFIGURATION & CONSTANTS
// ==========================================

const STORAGE = {
    USERS: 'ps_users',
    DEVICES: 'ps_devices',
    GAMES: 'ps_games',
    PRODUCTS: 'ps_products',
    SESSIONS: 'ps_sessions',
    CONFIG: 'ps_config'
};

const ROLES = {
    ADMIN: 'admin',
    CASHIER: 'cashier'
};

const DEFAULT_DATA = {
    USERS: [
        { id: 1, username: 'admin', password: '123', role: ROLES.ADMIN, fullname: 'المدير العام' },
        { id: 2, username: 'user', password: '123', role: ROLES.CASHIER, fullname: 'كاشير 1' }
    ],
    DEVICES: Array.from({ length: 12 }, (_, i) => ({
        id: i + 1,
        name: `جهاز ${i + 1}`,
        type: 'ps5',
        status: 'available', // available | busy
        currentSession: null
    })),
    GAMES: [
        { id: 1, name: 'فردي (Single)', price: 15, type: 'single' },
        { id: 2, name: 'زوجي (Multi)', price: 25, type: 'multi' },
        { id: 3, name: 'VIP Room', price: 50, type: 'vip' }
    ],
    CONFIG: { currency: 'ج.م' }
};

let currentUser = null;
let currentSelectedDevice = null; // For modals

// ==========================================
// 2. INITIALIZATION & AUTH FLOW
// ==========================================

/*
FUNCTION PURPOSE:
Entry point. Checks session, seeds data if empty, starts loop.
*/
window.addEventListener('DOMContentLoaded', () => {
    seedData();
    checkAuth();
    
    // Global Event Listeners
    setupEventListeners();
    
    // Start Heartbeat (Updates timers every second)
    setInterval(updateDashboardTimers, 1000);
});

function seedData() {
    // Initialize storage with defaults if empty
    if (!localStorage.getItem(STORAGE.USERS)) saveData(STORAGE.USERS, DEFAULT_DATA.USERS);
    if (!localStorage.getItem(STORAGE.DEVICES)) saveData(STORAGE.DEVICES, DEFAULT_DATA.DEVICES);
    if (!localStorage.getItem(STORAGE.GAMES)) saveData(STORAGE.GAMES, DEFAULT_DATA.GAMES);
    if (!localStorage.getItem(STORAGE.CONFIG)) saveData(STORAGE.CONFIG, DEFAULT_DATA.CONFIG);
}

function checkAuth() {
    const session = sessionStorage.getItem('active_session');
    if (session) {
        currentUser = JSON.parse(session);
        initAppInterface();
    } else {
        showLoginScreen();
    }
}

function login() {
    const userIn = document.getElementById('login-username').value;
    const passIn = document.getElementById('login-password').value;
    
    const users = loadData(STORAGE.USERS);
    const user = users.find(u => u.username === userIn && u.password === passIn);

    if (user) {
        currentUser = user;
        sessionStorage.setItem('active_session', JSON.stringify(user));
        initAppInterface();
    } else {
        alert('❌ بيانات الدخول غير صحيحة');
    }
}

function logout() {
    sessionStorage.removeItem('active_session');
    location.reload();
}

function initAppInterface() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('main-app').style.display = 'block';
    
    // Update Sidebar Info
    const userNameEl = document.querySelector('.user-info h4');
    if(userNameEl) userNameEl.innerText = currentUser.fullname;

    renderDevices();
    renderStats();
}

function showLoginScreen() {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('main-app').style.display = 'none';
}

// ==========================================
// 3. DASHBOARD & DEVICES LOGIC
// ==========================================

/*
FUNCTION PURPOSE:
Renders the grid of devices based on state.
Uses documentFragment for performance.
*/
function renderDevices() {
    const grid = document.getElementById('device-grid');
    if (!grid) return;

    grid.innerHTML = '';
    const devices = loadData(STORAGE.DEVICES);
    const fragment = document.createDocumentFragment();

    devices.forEach(device => {
        const card = document.createElement('div');
        card.className = `device-card ${device.status}`;
        card.setAttribute('data-id', device.id);

        let footerContent = '';
        let timerContent = '00:00:00';
        let costContent = '0';

        if (device.status === 'available') {
            footerContent = `
                <button class="btn btn-success btn-sm btn-block" onclick="openStartModal(${device.id})">
                    ▶ بدأ جلسة
                </button>`;
        } else {
            // Busy State
            footerContent = `
                <button class="btn btn-primary btn-sm btn-block" onclick="openDetailsModal(${device.id})">
                    👁‍🗨 التفاصيل / إنهاء
                </button>
                <button class="btn btn-secondary btn-sm btn-block" style="margin-top:5px" onclick="openProductModal(${device.id})">
                    ☕ طلبات
                </button>`;
            
            // Calculate initial preview
            if (device.currentSession) {
                const calculations = calculateCost(device.currentSession);
                timerContent = formatTime(calculations.durationMs);
                costContent = calculations.totalCost;
            }
        }

        card.innerHTML = `
            <div class="device-header">
                <span class="device-name">${device.name}</span>
                <span class="status-badge ${device.status}">
                    ${device.status === 'available' ? 'متاح' : 'مشغول'}
                </span>
            </div>
            
            <div class="device-body">
                <div class="device-icon">🎮</div>
                <div class="timer-display" id="timer-${device.id}">${timerContent}</div>
                <div class="cost-preview" id="cost-${device.id}">${costContent} ${getCurrency()}</div>
            </div>

            <div class="device-footer">
                ${footerContent}
            </div>
        `;
        fragment.appendChild(card);
    });

    grid.appendChild(fragment);
    updateSummaryCounts(devices);
}

/*
FUNCTION PURPOSE:
Runs every second to update UI timers without full re-render.
*/
function updateDashboardTimers() {
    const devices = loadData(STORAGE.DEVICES);
    
    devices.forEach(device => {
        if (device.status === 'busy' && device.currentSession) {
            const calculations = calculateCost(device.currentSession);
            
            // Update Timer DOM
            const timerEl = document.getElementById(`timer-${device.id}`);
            if (timerEl) timerEl.innerText = formatTime(calculations.durationMs);

            // Update Cost DOM
            const costEl = document.getElementById(`cost-${device.id}`);
            if (costEl) costEl.innerText = `${calculations.totalCost} ${getCurrency()}`;

            // Check for Overtime (Visual Alert)
            if (calculations.isOvertime) {
                const card = document.querySelector(`.device-card[data-id="${device.id}"]`);
                if (card && !card.classList.contains('overtime-alert')) {
                    card.classList.add('overtime-alert');
                    playAlertSound();
                }
            }
        }
    });
}

function updateSummaryCounts(devices) {
    const available = devices.filter(d => d.status === 'available').length;
    const busy = devices.filter(d => d.status === 'busy').length;
    
    const availEl = document.getElementById('available-count');
    const busyEl = document.getElementById('busy-count');
    
    if(availEl) availEl.innerText = available;
    if(busyEl) busyEl.innerText = busy;
}

// ==========================================
// 4. SESSION LOGIC (START/STOP)
// ==========================================

function openStartModal(deviceId) {
    currentSelectedDevice = deviceId;
    
    // Populate Game Select
    const select = document.getElementById('game-select');
    const games = loadData(STORAGE.GAMES);
    select.innerHTML = '';
    
    games.forEach(game => {
        const option = document.createElement('option');
        option.value = game.id;
        option.innerText = `${game.name} - ${game.price} ${getCurrency()}/ساعة`;
        select.appendChild(option);
    });

    openModal('start-modal');
}

function confirmStartSession() {
    const devices = loadData(STORAGE.DEVICES);
    const gameId = document.getElementById('game-select').value;
    const games = loadData(STORAGE.GAMES);
    const selectedGame = games.find(g => g.id == gameId);
    
    // Time Logic
    const isTimed = document.querySelector('.type-btn[data-type="timed"]').classList.contains('active');
    let limitMinutes = 0;
    
    if (isTimed) {
        const h = parseInt(document.getElementById('session-hours').value) || 0;
        const m = parseInt(document.getElementById('session-minutes').value) || 0;
        limitMinutes = (h * 60) + m;
        
        if (limitMinutes <= 0) {
            alert('يرجى تحديد وقت للجلسة!');
            return;
        }
    }

    // Update Device State
    const deviceIndex = devices.findIndex(d => d.id === currentSelectedDevice);
    if (deviceIndex > -1) {
        devices[deviceIndex].status = 'busy';
        devices[deviceIndex].currentSession = {
            id: Date.now(),
            startTime: new Date().toISOString(),
            gameId: selectedGame.id,
            gameName: selectedGame.name,
            hourlyRate: selectedGame.price,
            isTimed: isTimed,
            timeLimitMinutes: limitMinutes,
            orders: [] // {name, qty, price, total}
        };
        
        saveData(STORAGE.DEVICES, devices);
        closeModal('start-modal');
        renderDevices();
    }
}

// ==========================================
// 5. CHECKOUT & BILLING LOGIC
// ==========================================

function openDetailsModal(deviceId) {
    const devices = loadData(STORAGE.DEVICES);
    const device = devices.find(d => d.id === deviceId);
    currentSelectedDevice = deviceId;

    if (!device || !device.currentSession) return;

    document.getElementById('dd-device-name').innerText = device.name;
    document.getElementById('device-details-modal').style.display = 'flex';
    
    // Immediate Update
    updateDetailsModalUI(device);
    
    // Start local interval for this modal
    if (window.detailsTimer) clearInterval(window.detailsTimer);
    window.detailsTimer = setInterval(() => {
        // Reload fresh data in case orders changed
        const freshDevices = loadData(STORAGE.DEVICES);
        const freshDevice = freshDevices.find(d => d.id === deviceId);
        updateDetailsModalUI(freshDevice);
    }, 1000);
}

function updateDetailsModalUI(device) {
    if (!device.currentSession) return;
    
    const session = device.currentSession;
    const calc = calculateCost(session);

    // Update Text Elements
    setText('dd-start-time', new Date(session.startTime).toLocaleTimeString('ar-EG'));
    setText('dd-game', session.gameName);
    setText('dd-price-min', `${session.hourlyRate} / ساعة`);
    
    setText('dd-booked-time', session.isTimed ? `${session.timeLimitMinutes} دقيقة` : 'مفتوح');
    setText('dd-base-time', `${Math.floor(calc.durationMs / 60000)} دقيقة`);
    
    setText('dd-base-cost', `${calc.baseCost.toFixed(2)}`);
    setText('dd-overtime', `${calc.overtimeMinutes} دقيقة`);
    setText('dd-overtime-cost', `${calc.overtimeCost.toFixed(2)}`);
    
    // Orders Calculation
    const ordersTotal = session.orders.reduce((sum, o) => sum + o.total, 0);
    const finalTotal = calc.totalCost + ordersTotal;
    
    setText('dd-total-cost', `${finalTotal.toFixed(2)} ${getCurrency()}`);
    
    // Render Invoice Preview HTML
    renderInvoiceRows(calc, session.orders, finalTotal);
}

/*
FUNCTION PURPOSE:
The Core Financial Logic.
*/
function calculateCost(session) {
    const now = new Date();
    const start = new Date(session.startTime);
    const durationMs = now - start;
    const durationMinutes = Math.ceil(durationMs / (1000 * 60)); // Round up partial minutes
    
    const pricePerMinute = session.hourlyRate / 60;
    
    let baseCost = 0;
    let overtimeCost = 0;
    let overtimeMinutes = 0;
    let isOvertime = false;

    if (session.isTimed) {
        // Timed Logic
        baseCost = (session.timeLimitMinutes * pricePerMinute); // Fixed prepaid amount
        
        if (durationMinutes > session.timeLimitMinutes) {
            isOvertime = true;
            overtimeMinutes = durationMinutes - session.timeLimitMinutes;
            overtimeCost = overtimeMinutes * pricePerMinute;
        }
    } else {
        // Open Logic
        baseCost = durationMinutes * pricePerMinute;
    }

    return {
        durationMs,
        durationMinutes,
        baseCost,
        overtimeCost,
        overtimeMinutes,
        isOvertime,
        totalCost: Math.ceil(baseCost + overtimeCost) // Round up final currency
    };
}

function renderInvoiceRows(calc, orders, total) {
    const container = document.getElementById('dd-invoice-content');
    if (!container) return;

    let html = `
        <div class="dd-invoice-row">
            <span>الوقت المستهلك (${calc.durationMinutes} د)</span>
            <span>${Math.ceil(calc.baseCost)}</span>
        </div>
    `;

    if (calc.isOvertime) {
        html += `
            <div class="dd-invoice-row overtime-row">
                <span>وقت إضافي (${calc.overtimeMinutes} د)</span>
                <span>${Math.ceil(calc.overtimeCost)}</span>
            </div>
        `;
    }

    if (orders && orders.length > 0) {
        html += `<div style="margin:10px 0; font-weight:bold; font-size:12px; color:#666">الطلبات:</div>`;
        orders.forEach(ord => {
            html += `
                <div class="dd-invoice-row">
                    <span>${ord.name} (x${ord.qty})</span>
                    <span>${ord.total}</span>
                </div>
            `;
        });
    }

    html += `
        <div class="dd-invoice-row total">
            <span>الإجمالي النهائي</span>
            <span>${Math.ceil(total)} ${getCurrency()}</span>
        </div>
    `;

    container.innerHTML = html;
}

function applyAndClose() {
    // Save to History
    const devices = loadData(STORAGE.DEVICES);
    const device = devices.find(d => d.id === currentSelectedDevice);
    const calc = calculateCost(device.currentSession);
    const ordersTotal = device.currentSession.orders.reduce((sum, o) => sum + o.total, 0);

    const archiveRecord = {
        ...device.currentSession,
        endTime: new Date().toISOString(),
        finalDurationMinutes: calc.durationMinutes,
        gameCost: calc.totalCost,
        ordersCost: ordersTotal,
        grandTotal: calc.totalCost + ordersTotal,
        deviceId: device.id,
        deviceName: device.name,
        cashier: currentUser.username
    };

    // Push to sessions
    const history = loadData(STORAGE.SESSIONS) || [];
    history.push(archiveRecord);
    saveData(STORAGE.SESSIONS, history);

    // Reset Device
    device.status = 'available';
    device.currentSession = null;
    
    // Save and Render
    saveData(STORAGE.DEVICES, devices);
    
    closeDeviceDetails();
    renderDevices();
    renderStats();
    
    // Optional: Trigger Print here
    // window.print();
}

// ==========================================
// 6. HELPER FUNCTIONS
// ==========================================

function saveData(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
}

function loadData(key) {
    const str = localStorage.getItem(key);
    return str ? JSON.parse(str) : [];
}

function getCurrency() {
    const config = loadData(STORAGE.CONFIG);
    return config.currency || 'LE';
}

function formatTime(ms) {
    const s = Math.floor((ms / 1000) % 60).toString().padStart(2, '0');
    const m = Math.floor((ms / (1000 * 60)) % 60).toString().padStart(2, '0');
    const h = Math.floor((ms / (1000 * 60 * 60))).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
}

function setText(id, text) {
    const el = document.getElementById(id);
    if(el) el.innerText = text;
}

function openModal(id) {
    document.getElementById(id).style.display = 'flex';
}

function closeDeviceDetails() {
    document.getElementById('device-details-modal').style.display = 'none';
    if (window.detailsTimer) clearInterval(window.detailsTimer);
    currentSelectedDevice = null;
}

function closeModal(id) {
    document.getElementById(id).style.display = 'none';
}

function playAlertSound() {
    const audio = document.getElementById('timer-alert');
    if (audio) {
        // Prevent spamming sound
        if(audio.paused) audio.play().catch(e => console.log('Audio Blocked'));
    }
}

// Dummy stats renderer (Extend this later)
function renderStats() {
    // Implement dashboard cards logic here
}

function setupEventListeners() {
    document.getElementById('login-btn').addEventListener('click', login);
    
    // Mode Switching in Start Modal
    document.querySelectorAll('.type-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            
            const isTimed = e.target.getAttribute('data-type') === 'timed';
            document.getElementById('timed-input').style.display = isTimed ? 'block' : 'none';
        });
    });

    document.getElementById('confirm-start-btn').addEventListener('click', confirmStartSession);
                            }
