// ====================================
// PLAYSTATION CAFE MANAGER - FULL SYSTEM
// ====================================

// --- Constants ---
const STORAGE_VERSION = 1;
const STORAGE_KEYS = {
    version: 'ps_cafe_version',
    users: 'users',
    devices: 'ps_cafe_devices',
    sessions: 'ps_cafe_sessions',
    invoices: 'ps_cafe_invoices',
    games: 'ps_cafe_games',
    products: 'ps_cafe_products',
    settings: 'ps_cafe_settings',
    transfers: 'ps_cafe_transfers',
    currentUser: 'ps_cafe_current_user'
};

const ROLES = { ADMIN: 'admin', CASHIER: 'cashier', VIEWER: 'viewer' };
const PERMISSIONS_BY_ROLE = {
    [ROLES.ADMIN]: ['devices', 'games', 'products', 'inventory', 'reports', 'settings'],
    [ROLES.CASHIER]: ['devices', 'products', 'inventory', 'reports'],
    [ROLES.VIEWER]: ['reports']
};

// --- Data layer: global stores (in memory, persisted to LocalStorage) ---
const stores = {
    users: [],
    devices: [],
    sessions: [],
    invoices: [],
    games: [],
    products: [],
    products: [],
    transfers: [],
    settings: { currencySymbol: 'ج.م', taxRate: 0 }
};

// UI state only (not persisted)
let state = {
    currentUser: null,
    currentDevice: null,
    currentGameId: null,
    currentProductId: null,
    selectedGameMode: null
};

// Global timer interval ID
let timerIntervalId = null;

// ====================================
// DATA LAYER
// ====================================

function loadStores() {
    const version = parseInt(localStorage.getItem(STORAGE_KEYS.version) || '0', 10);
    if (version < STORAGE_VERSION) {
        migrateOrInitStores(version);
        return;
    }
    ['users', 'devices', 'sessions', 'invoices', 'games', 'products', 'transfers', 'settings'].forEach(key => {
        const raw = localStorage.getItem(STORAGE_KEYS[key]);
        if (raw) {
            try {
                const data = JSON.parse(raw);
                if (Array.isArray(data)) stores[key] = data;
                else if (data && typeof data === 'object') stores[key] = data;
            } catch (e) { console.warn('loadStores parse error', key, e); }
        }
    });
    console.log('[Auth] Users loaded from storage:', stores.users);
    restoreDateFields();
}

function saveStores() {
    localStorage.setItem(STORAGE_KEYS.version, String(STORAGE_VERSION));
    localStorage.setItem(STORAGE_KEYS.users, JSON.stringify(stores.users));
    localStorage.setItem(STORAGE_KEYS.devices, JSON.stringify(stores.devices));
    localStorage.setItem(STORAGE_KEYS.sessions, JSON.stringify(stores.sessions));
    localStorage.setItem(STORAGE_KEYS.invoices, JSON.stringify(stores.invoices));
    localStorage.setItem(STORAGE_KEYS.games, JSON.stringify(stores.games));
    localStorage.setItem(STORAGE_KEYS.products, JSON.stringify(stores.products));
    localStorage.setItem(STORAGE_KEYS.transfers, JSON.stringify(stores.transfers));
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(stores.settings));
}

function restoreDateFields() {
    stores.sessions.forEach(s => {
        if (s.startTime) s.startTime = new Date(s.startTime);
        if (s.endTime) s.endTime = new Date(s.endTime);
        if (s.pausedAt) s.pausedAt = new Date(s.pausedAt);
    });
    stores.devices.forEach(d => {
        if (d.startTime) d.startTime = new Date(d.startTime);
        if (d.session) {
            if (d.session.startTime) d.session.startTime = new Date(d.session.startTime);
            if (d.session.pausedAt) d.session.pausedAt = new Date(d.session.pausedAt);
        }
    });
}

function migrateOrInitStores(previousVersion) {
    const oldState = localStorage.getItem('playstation_cafe_state');
    if (oldState) {
        try {
            const old = JSON.parse(oldState);
            if (old.devices && old.devices.length) stores.devices = old.devices;
            if (old.games && old.games.length) stores.games = old.games;
            if (old.products && old.products.length) stores.products = old.products;
            if (old.sessions && old.sessions.length) stores.sessions = old.sessions;
            if (old.settings) stores.settings = { ...stores.settings, ...old.settings };
        } catch (e) { console.warn('migrate parse error', e); }
    }
    ensureDefaultData();
    restoreDateFields();
    saveStores();
}

function ensureDefaultData() {
    const usersInvalid = !stores.users || !Array.isArray(stores.users) || stores.users.length === 0;
    if (usersInvalid) {
        stores.users = [{
            id: 1,
            username: 'admin',
            password: '1234',
            role: 'admin',
            permissions: ['*']
        }];
        console.log('[Auth] No/invalid users in storage; created default admin.');
    }
    if (stores.devices.length === 0) {
        for (let i = 1; i <= 20; i++) {
            stores.devices.push({ id: i, name: `PS${i}`, status: 'available' });
        }
    }
    if (stores.games.length === 0) {
        stores.games = [
            { id: 1, name: 'مالتي', price: 30, icon: '👥', type: 'multi', isDefault: true },
            { id: 2, name: 'فردي', price: 20, icon: '🎮', type: 'single', isDefault: true },
            { id: 3, name: 'بينج بونج', price: 15, icon: '🏓', type: 'other' },
            { id: 4, name: 'بلياردو', price: 25, icon: '🎱', type: 'other' }
        ];
    }
}

// ====================================
// USER & ROLE SYSTEM
// ====================================

function getPermissionsForRole(role) {
    return PERMISSIONS_BY_ROLE[role] || [];
}

function hasPermission(perm) {
    if (!state.currentUser) return false;
    if (state.currentUser.role === ROLES.ADMIN || state.currentUser.role === 'admin') return true;
    const perms = state.currentUser.permissions || [];
    if (perms.includes('*')) return true;
    return perms.includes(perm);
}

function checkLogin() {
    const raw = localStorage.getItem(STORAGE_KEYS.currentUser);
    if (raw) {
        try {
            const user = JSON.parse(raw);
            const users = Array.isArray(stores.users) ? stores.users : [];
            const stored = users.find(function (u) {
                return u && (u.id === user.id || u.username === user.username) && String(u.username || '') === String(user.username || '');
            });
            if (stored) {
                state.currentUser = stored;
                showMainApp();
                return;
            }
        } catch (e) { /* ignore */ }
    }
    showLoginScreen();
}

function showLoginScreen() {
    document.getElementById('login-screen').classList.remove('hidden');
    const main = document.getElementById('main-app');
    if (main) main.style.display = 'none';
}

function showMainApp() {
    document.getElementById('login-screen').classList.add('hidden');
    const main = document.getElementById('main-app');
    if (main) main.style.display = 'block';
    initializeDefaultGames();
    renderDevices();
    renderGames();
    renderProducts();
    renderInventory();
    renderUsers();

    // تم إزالة setupEventListeners من هنا لتجنب التكرار ولحل مشكلة تسجيل الدخول

    updateStats();
    updateReport();
    updateUserInfo();
    applyPermissions();
    startTimerEngine();
    updateSettings();
    initReports(); // Initialize report listeners
}

function updateUserInfo() {
    const nameEl = document.getElementById('current-user-name');
    const roleEl = document.getElementById('current-user-role');
    if (!state.currentUser) return;
    if (nameEl) nameEl.textContent = state.currentUser.username || '';
    if (roleEl) {
        const labels = { [ROLES.ADMIN]: 'مدير', 'admin': 'مدير', [ROLES.CASHIER]: 'كاشير', [ROLES.VIEWER]: 'مشاهد' };
        roleEl.textContent = labels[state.currentUser.role] || state.currentUser.role || '';
    }
}

function applyPermissions() {
    const perms = state.currentUser ? (state.currentUser.permissions || []) : [];
    const navMap = { devices: 'devices', games: 'games', products: 'products', inventory: 'inventory', report: 'reports', users: 'settings', settings: 'settings' };
    Object.keys(navMap).forEach(page => {
        const perm = navMap[page];
        const item = document.querySelector(`.nav-item[data-page="${page}"]`);
        if (item) {
            const isAdmin = state.currentUser && (state.currentUser.role === ROLES.ADMIN || state.currentUser.role === 'admin');
            const allowed = state.currentUser && (isAdmin || perms.includes('*') || perms.includes(perm));
            if (allowed) item.classList.remove('hidden');
            else item.classList.add('hidden');
        }
    });
    const hideIfNoPerm = (id, perm) => {
        const el = document.getElementById(id);
        if (el) el.style.display = hasPermission(perm) ? '' : 'none';
    };
    hideIfNoPerm('add-game-btn', 'games');
    hideIfNoPerm('add-product-btn', 'products');
    hideIfNoPerm('add-user-btn', 'settings');
    hideIfNoPerm('save-settings-btn', 'settings');
    const resetBtn = document.getElementById('reset-data-btn');
    if (resetBtn) resetBtn.style.display = hasPermission('settings') ? '' : 'none';
}

// ====================================
// INITIALIZATION
// ====================================

function init() {
    loadStores();
    ensureDefaultData();
    saveStores();

    // !!! تم النقل هنا لتفعيل الأزرار قبل تسجيل الدخول !!!
    setupEventListeners();

    checkLogin();

    // Restore timers for any active sessions
    restoreTimers();
}

function restoreTimers() {
    const activeDevices = stores.devices.filter(d =>
        (d.status === 'busy' || d.status === 'paused') && d.session
    );

    if (activeDevices.length > 0) {
        console.log(`🔄 Restoring ${activeDevices.length} active session(s)`);
        activeDevices.forEach(d => {
            console.log(`  - ${d.name}: started at ${d.session.startTime}`);
        });
        startGlobalTimer();
    } else {
        console.log('ℹ️ No active sessions to restore');
    }
}

// ====================================
// TIMER SYSTEM
// ====================================

function startGlobalTimer() {
    // Prevent multiple intervals
    if (timerIntervalId) {
        clearInterval(timerIntervalId);
    }

    console.log('🕐 Global timer started');

    timerIntervalId = setInterval(() => {
        updateAllTimers();
    }, 1000);
}

function updateAllTimers() {
    const activeDevices = stores.devices.filter(d => d.status === 'busy' || d.status === 'paused' || d.status === 'overtime');

    activeDevices.forEach(device => {
        if (!device.session) return;

        const session = device.session;
        const now = new Date();
        const startTime = new Date(session.startTime);

        // Calculate elapsed time
        let elapsed = now - startTime;

        // Subtract paused time
        if (session.pausedTime) {
            elapsed -= session.pausedTime;
        }

        // If currently paused, don't count current pause duration
        if (session.isPaused && session.pausedAt) {
            const currentPauseDuration = now - new Date(session.pausedAt);
            elapsed -= currentPauseDuration;
        }

        const elapsedSeconds = Math.floor(elapsed / 1000);

        // For timed sessions, calculate remaining time or overtime
        if (session.type === 'timed' && session.bookedTime != null) {
            const bookedSeconds = session.bookedTime * 60;
            const remaining = bookedSeconds - elapsedSeconds;

            // OVERTIME LOGIC
            if (remaining <= 0) {
                const overtimeSeconds = Math.abs(remaining);

                // First time entering overtime
                if (!session.overtimeStarted) {
                    session.overtimeStarted = true;
                    session.isOvertime = true;
                    device.status = 'overtime';
                    console.log(`⏰ Booked time finished for ${device.name} - OVERTIME started`);
                    playOvertimeBeep();
                    saveStores();
                    renderDevices(); // Re-render to show overtime status
                    showToast(`⏰ ${device.name} - انتهى الوقت المحجوز! بدأ الوقت الإضافي`, 'warning');
                }

                // Calculate overtime billing
                const overtimeMinutes = Math.floor(overtimeSeconds / 60);
                const overtimeHours = overtimeSeconds / 3600;
                session.overtimeMinutes = overtimeMinutes;
                session.overtimeCost = overtimeHours * session.gamePrice;

                // Update display to show overtime (+MM:SS)
                updateTimerDisplay(device.id, overtimeSeconds, false, true);

                console.log(`💰 Overtime billing for ${device.name}: ${overtimeMinutes} min = ${session.overtimeCost.toFixed(2)}`);
            } else {
                // Still within booked time - show countdown
                updateTimerDisplay(device.id, remaining, true, false);

                // Warnings
                if (remaining === 30 && !session.warned30) {
                    session.warned30 = true;
                    saveStores();
                    showToast(`⚠️ ${device.name} - باقي 30 ثانية!`, 'warning');
                }
                if (remaining === 10 && !session.warned10) {
                    session.warned10 = true;
                    saveStores();
                    showToast(`⚠️ ${device.name} - باقي 10 ثواني!`, 'error');
                }
            }
        } else {
            // Open session - show elapsed
            updateTimerDisplay(device.id, elapsedSeconds, false, false);
        }

        // Update revenue
        updateRevenueDisplay(device.id, elapsed, session);
    });
}

function updateTimerDisplay(deviceId, seconds, isCountdown, isOvertime) {
    const timerEl = document.getElementById(`timer-${deviceId}`);
    if (!timerEl) return;

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    let timeString = hours > 0
        ? `${pad(hours)}:${pad(minutes)}:${pad(secs)}`
        : `${pad(minutes)}:${pad(secs)}`;

    // Add + prefix for overtime
    if (isOvertime) {
        timeString = `+${timeString}`;
    }

    timerEl.textContent = timeString;

    // Visual styling
    if (isOvertime) {
        timerEl.style.color = '#ff9800'; // Orange for overtime
        timerEl.style.fontWeight = 'bold';
    } else if (isCountdown && seconds < 60) {
        timerEl.style.color = '#ff4444'; // Red for last minute
        timerEl.style.fontWeight = 'bold';
    } else {
        timerEl.style.color = '';
        timerEl.style.fontWeight = '';
    }
}

function updateRevenueDisplay(deviceId, elapsedMs, session) {
    const revenueEl = document.getElementById(`revenue-${deviceId}`);
    if (!revenueEl) return;

    const hours = elapsedMs / (1000 * 60 * 60);
    const sessionCost = hours * session.gamePrice;
    const productsCost = session.products.reduce((sum, p) => sum + p.price, 0);
    const total = sessionCost + productsCost;

    revenueEl.textContent = `${total.toFixed(2)} ${stores.settings.currencySymbol}`;
}

function pad(num) {
    return String(num).padStart(2, '0');
}

function playOvertimeBeep() {
    try {
        // Create audio context for beep sound
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        // Configure beep (800Hz, 0.3 seconds)
        oscillator.frequency.value = 800;
        oscillator.type = 'sine';
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.3);

        console.log('🔊 Overtime beep played');
    } catch (e) {
        console.warn('Audio beep failed:', e);
    }
}

function initializeDefaultGames() {
    if (stores.games.length === 0) {
        stores.games = [
            { id: 1, name: 'مالتي', price: 30, icon: '👥', type: 'multi', isDefault: true },
            { id: 2, name: 'فردي', price: 20, icon: '🎮', type: 'single', isDefault: true },
            { id: 3, name: 'بينج بونج', price: 15, icon: '🏓', type: 'other' },
            { id: 4, name: 'بلياردو', price: 25, icon: '🎱', type: 'other' }
        ];
        saveStores();
    }
}

// ====================================
// EVENT LISTENERS
// ====================================

function setupEventListeners() {
    const loginBtn = document.getElementById('login-btn');
    if (loginBtn) loginBtn.addEventListener('click', handleLogin);
    const loginPass = document.getElementById('login-password');
    if (loginPass) loginPass.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleLogin(); });
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);

    document.querySelectorAll('.nav-item').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const page = link.dataset.page;
            switchPage(page);
        });
    });

    // Settings
    const saveSettingsBtn = document.getElementById('save-settings-btn');
    if (saveSettingsBtn) saveSettingsBtn.addEventListener('click', saveSettings);

    const resetDataBtn = document.getElementById('reset-data-btn');
    if (resetDataBtn) resetDataBtn.addEventListener('click', resetAllData);

    // Products
    const addProductBtn = document.getElementById('add-product-btn');
    if (addProductBtn) addProductBtn.addEventListener('click', () => {
        document.getElementById('product-name').value = '';
        document.getElementById('product-price').value = '';
        document.getElementById('product-cost').value = '';
        document.getElementById('product-quantity').value = '0';
        openModal('add-product-modal');
    });

    const saveProductBtn = document.getElementById('save-product-btn');
    if (saveProductBtn) saveProductBtn.addEventListener('click', saveProduct);

    const updateProductBtn = document.getElementById('update-product-btn');
    if (updateProductBtn) updateProductBtn.addEventListener('click', updateProduct);

    const confirmRestockBtn = document.getElementById('confirm-restock-btn');
    if (confirmRestockBtn) confirmRestockBtn.addEventListener('click', confirmRestock);

    // Games
    const addGameBtn = document.getElementById('add-game-btn');
    if (addGameBtn) addGameBtn.addEventListener('click', () => {
        document.getElementById('game-name').value = '';
        document.getElementById('game-price').value = '';
        document.getElementById('game-icon').value = '🎮';
        openModal('add-game-modal');
    });

    const saveGameBtn = document.getElementById('save-game-btn');
    if (saveGameBtn) saveGameBtn.addEventListener('click', saveGame);

    const updateGameBtn = document.getElementById('update-game-btn');
    if (updateGameBtn) updateGameBtn.addEventListener('click', updateGame);

    // Users
    const addUserBtn = document.getElementById('add-user-btn');
    if (addUserBtn) {
        addUserBtn.addEventListener('click', () => {
            document.getElementById('new-username').value = '';
            document.getElementById('new-password').value = '';
            document.getElementById('new-fullname').value = '';
            document.getElementById('new-user-role').value = 'cashier';
            openModal('add-user-modal');
        });
    }
    const saveUserBtn = document.getElementById('save-user-btn');
    if (saveUserBtn) saveUserBtn.addEventListener('click', saveUser);
    const updateUserBtn = document.getElementById('update-user-btn');
    if (updateUserBtn) updateUserBtn.addEventListener('click', updateUser);

    // Session type selector
    document.querySelectorAll('.type-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');

            const timedInput = document.getElementById('timed-input');
            if (this.dataset.type === 'timed') {
                timedInput.classList.remove('hidden');
            } else {
                timedInput.classList.add('hidden');
            }
        });
    });

    // Game mode selector
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            state.selectedGameMode = this.dataset.mode;
        });
    });

    // Start session confirmation
    const confirmStartBtn = document.getElementById('confirm-start-btn');
    if (confirmStartBtn) confirmStartBtn.addEventListener('click', confirmStartSession);

    updateSettings();
}

function handleLogin() {
    const usernameInput = document.getElementById('login-username');
    const passwordInput = document.getElementById('login-password');
    const username = (usernameInput && usernameInput.value != null ? usernameInput.value : '').toString().trim();
    const password = (passwordInput && passwordInput.value != null ? passwordInput.value : '').toString();
    console.log('[Auth] Login attempt:', { username: username || '(empty)', passwordLength: password ? password.length : 0 });

    let users = stores.users;
    if (!Array.isArray(users)) {
        try {
            const raw = localStorage.getItem(STORAGE_KEYS.users) || localStorage.getItem('users');
            users = raw ? JSON.parse(raw) : [];
            if (Array.isArray(users)) stores.users = users;
            else users = [];
        } catch (e) {
            console.warn('[Auth] Failed to read users from storage', e);
            users = [];
        }
    }
    const user = users.find(function (u) {
        const uName = (u && u.username != null) ? String(u.username).trim() : '';
        const uPass = (u && u.password != null) ? String(u.password) : '';
        return uName === username && uPass === password;
    });
    console.log('[Auth] Match result:', user ? 'success' : 'fail', user ? { id: user.id, username: user.username } : null);

    if (user) {
        state.currentUser = user;
        localStorage.setItem(STORAGE_KEYS.currentUser, JSON.stringify(user));
        showMainApp();
        showToast('مرحباً ' + (user.username || ''));
    } else {
        showToast('اسم المستخدم أو كلمة المرور غير صحيحة', 'error');
    }
}

function handleLogout() {
    if (confirm('هل تريد تسجيل الخروج؟')) {
        state.currentUser = null;
        localStorage.removeItem(STORAGE_KEYS.currentUser);
        showLoginScreen();
    }
}

// ====================================
// LOCAL STORAGE (delegate to data layer)
// ====================================

function resetAllData() {
    if (!hasPermission('settings')) {
        showToast('ليس لديك صلاحية', 'error');
        return;
    }
    if (confirm('⚠️ هذا سيحذف جميع البيانات. هل أنت متأكد؟')) {
        localStorage.clear();
        state.currentUser = null;
        stores.users = [];
        stores.devices = [];
        stores.sessions = [];
        stores.invoices = [];
        stores.games = [];
        stores.products = [];
        stores.settings = { currencySymbol: 'ج.م', taxRate: 0 };
        ensureDefaultData();
        saveStores();
        location.reload();
    }
}

// ====================================
// NAVIGATION
// ====================================

function switchPage(pageName) {
    const requiredPerm = { devices: 'devices', games: 'games', products: 'products', inventory: 'inventory', report: 'reports', users: 'settings', settings: 'settings' };
    if (requiredPerm[pageName] && !hasPermission(requiredPerm[pageName])) {
        showToast('ليس لديك صلاحية لهذه الصفحة', 'error');
        return;
    }
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    const activeItem = document.querySelector(`[data-page="${pageName}"]`);
    if (activeItem) activeItem.classList.add('active');
    document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
    const pageEl = document.getElementById(`${pageName}-page`);
    if (pageEl) pageEl.classList.add('active');
    if (pageName === 'report') updateReport();
    else if (pageName === 'games') renderGames();
    else if (pageName === 'inventory') renderInventory();
    else if (pageName === 'users') renderUsers();
}

// ====================================
// DEVICES
// ====================================

function renderDevices() {
    const grid = document.getElementById('device-grid');
    if (!grid) return;
    grid.innerHTML = '';

    stores.devices.forEach(device => {
        const card = createDeviceCard(device);

        // Add double-click event listener for device details
        card.addEventListener('dblclick', () => {
            openDeviceDetails(device.id);
        });

        grid.appendChild(card);
    });

    updateStats();
}

function createDeviceCard(device) {
    const div = document.createElement('div');
    const session = device.session;
    const status = session && session.isPaused ? 'paused' : device.status;
    div.className = `device-card ${status}`;

    const isAvailable = device.status === 'available';

    let timerHTML = '';
    let revenueHTML = '';
    let gameHTML = '';
    let actionsHTML = '';

    if (isAvailable) {
        actionsHTML = `
            <button class="btn btn-success btn-block" onclick="openStartModal(${device.id})">
                ▶️ بدء
            </button>
        `;
    } else {
        const game = stores.games.find(g => g.id === session.gameId);
        const gameName = game ? game.name : 'غير معروف';

        // Determine status text based on overtime
        let statusText = '🔴 مشغول';
        let overtimeLabel = '';

        if (session.isPaused) {
            statusText = '⏸️ متوقف مؤقتاً';
        } else if (session.isOvertime) {
            statusText = '⏰ انتهى الوقت المحجوز';
            overtimeLabel = '<div class="overtime-badge">🔥 وقت إضافي</div>';
        }

        timerHTML = `<div class="device-timer" id="timer-${device.id}">00:00</div>`;
        revenueHTML = `<div class="device-revenue" id="revenue-${device.id}">0 ${stores.settings.currencySymbol}</div>`;
        gameHTML = `<div class="device-game">${gameName}</div>`;

        const pauseResumeBtn = session.isPaused ?
            `<button class="btn btn-success btn-block" onclick="resumeSession(${device.id})">▶️ استئناف</button>` :
            `<button class="btn btn-warning btn-block" onclick="pauseSession(${device.id})">⏸️ إيقاف مؤقت</button>`;

        actionsHTML = `
            <button class="btn btn-danger btn-block" onclick="stopSession(${device.id})">
                ⏹️ إيقاف نهائي
            </button>
            ${pauseResumeBtn}
            <div class="device-actions-row">
                <button class="btn btn-warning btn-sm" onclick="addTime(${device.id})">
                    +5 دقائق
                </button>
                <button class="btn btn-secondary btn-sm" onclick="openSellProductModal(${device.id})">
                    🛒 بيع
                </button>
            </div>
            <button class="btn btn-secondary btn-block" onclick="openTransferModal(${device.id})">
                🔄 نقل
            </button>
        `;

        // Add overtime label after timer
        timerHTML += overtimeLabel;
    }

    div.innerHTML = `
        <div class="device-name">${device.name}</div>
        <div class="device-status ${status}">
            ${isAvailable ? '✅ متاح' : (session.isPaused ? '⏸️ متوقف مؤقتاً' : (session.isOvertime ? '⏰ انتهى الوقت المحجوز' : '🔴 مشغول'))}
        </div>
        ${gameHTML}
        ${timerHTML}
        ${revenueHTML}
        <div class="device-actions">
            ${actionsHTML}
        </div>
    `;

    return div;
}

function updateStats() {
    const available = stores.devices.filter(d => d.status === 'available').length;
    const busy = stores.devices.filter(d => d.status === 'busy' || d.status === 'paused' || d.status === 'overtime').length;
    const availableEl = document.getElementById('available-count');
    const busyEl = document.getElementById('busy-count');
    if (availableEl) availableEl.textContent = available;
    if (busyEl) busyEl.textContent = busy;
}

// ====================================
// SESSION MANAGEMENT
// ====================================

function openStartModal(deviceId) {
    if (!hasPermission('devices')) {
        showToast('ليس لديك صلاحية', 'error');
        return;
    }

    state.currentDevice = deviceId;
    state.selectedGameMode = null;

    // Reset mode buttons
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));

    // Populate other games
    const select = document.getElementById('game-select');
    select.innerHTML = '<option value="">اختر لعبة أخرى...</option>';

    const otherGames = stores.games.filter(g => g.type === 'other');
    otherGames.forEach(game => {
        const option = document.createElement('option');
        option.value = game.id;
        option.textContent = `${game.icon} ${game.name} - ${game.price} ${stores.settings.currencySymbol}/ساعة`;
        select.appendChild(option);
    });

    document.getElementById('session-hours').value = 1;
    document.getElementById('session-minutes').value = 0;
    document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('[data-type="timed"]').classList.add('active');
    document.getElementById('timed-input').classList.remove('hidden');

    openModal('start-modal');
}

function confirmStartSession() {
    const deviceId = state.currentDevice;
    const device = stores.devices.find(d => d.id === deviceId);

    let gameId = null;

    // Check if mode button selected
    if (state.selectedGameMode) {
        const game = stores.games.find(g => g.type === state.selectedGameMode);
        if (game) gameId = game.id;
    } else {
        // Check select dropdown
        gameId = parseInt(document.getElementById('game-select').value);
    }

    if (!gameId) {
        showToast('الرجاء اختيار لعبة', 'error');
        return;
    }

    const game = stores.games.find(g => g.id === gameId);
    if (!game) return;

    const sessionType = document.querySelector('.type-btn.active').dataset.type;

    let totalMinutes = null;
    if (sessionType === 'timed') {
        const hours = parseInt(document.getElementById('session-hours').value) || 0;
        const minutes = parseInt(document.getElementById('session-minutes').value) || 0;
        totalMinutes = (hours * 60) + minutes;

        if (totalMinutes < 1) {
            showToast('الرجاء إدخال وقت صحيح', 'error');
            return;
        }
    }

    const totalSeconds = sessionType === 'timed' && totalMinutes != null ? totalMinutes * 60 : null;
    const session = {
        type: sessionType,
        startTime: new Date(),
        duration: totalMinutes,
        bookedTime: totalMinutes, // Store booked time for overtime calculation
        remainingSeconds: totalSeconds,
        revenue: 0,
        gameId: gameId,
        gameName: game.name,
        gamePrice: game.price,
        products: [],
        cashier: state.currentUser ? state.currentUser.username : 'unknown', // Track cashier
        isPaused: false,
        pausedTime: 0,
        pausedAt: null,
        warned30: false,
        warned10: false,
        isOvertime: false,
        overtimeStarted: false,
        overtimeMinutes: 0,
        overtimeCost: 0
    };
    device.status = 'busy';
    device.session = session;

    saveStores();
    renderDevices();
    closeModal('start-modal');
    showToast(`تم بدء ${device.name}`);
    console.log(`✅ Session started for ${device.name}`, session);
    startGlobalTimer(); // Ensure timer is running
}

function pauseSession(deviceId) {
    const device = stores.devices.find(d => d.id === deviceId);
    if (!device || !device.session || device.session.isPaused) return;
    device.status = 'paused';
    device.session.isPaused = true;
    device.session.pausedAt = new Date();
    saveStores();
    renderDevices();
    showToast(`تم إيقاف ${device.name} مؤقتاً`);
}

function resumeSession(deviceId) {
    const device = stores.devices.find(d => d.id === deviceId);
    if (!device || !device.session || !device.session.isPaused) return;
    const pauseDuration = new Date() - new Date(device.session.pausedAt);
    device.session.pausedTime = (device.session.pausedTime || 0) + pauseDuration;
    device.session.isPaused = false;
    device.session.pausedAt = null;
    device.status = 'busy';
    saveStores();
    renderDevices();
    showToast(`تم استئناف ${device.name}`);
    console.log(`▶️ Session resumed for ${device.name}`);
    startGlobalTimer();
}

function stopSession(deviceId) {
    const device = stores.devices.find(d => d.id === deviceId);
    if (!device || !device.session) return;

    const session = device.session;
    const endTime = new Date();

    // Calculate actual working time (excluding paused time)
    let actualDuration = endTime - new Date(session.startTime);
    if (session.pausedTime) {
        actualDuration -= session.pausedTime;
    }
    if (session.isPaused && session.pausedAt) {
        actualDuration -= (endTime - new Date(session.pausedAt));
    }

    const durationHours = actualDuration / (1000 * 60 * 60);
    const sessionCost = durationHours * session.gamePrice;
    const productsCost = session.products.reduce((sum, p) => sum + p.price, 0);
    const productsProfitCost = session.products.reduce((sum, p) => sum + (p.price - p.cost), 0);
    const totalCost = sessionCost + productsCost;

    const completedSession = {
        deviceId: device.id,
        deviceName: device.name,
        gameName: session.gameName,
        startTime: session.startTime,
        endTime: endTime,
        duration: Math.round(actualDuration / 1000 / 60),
        bookedTime: session.bookedTime || session.duration,
        sessionCost: sessionCost,
        products: session.products || [],
        productsCost: productsCost,
        productsProfit: productsProfitCost,
        total: totalCost,
        overtimeMinutes: session.overtimeMinutes || 0,
        overtimeCost: session.overtimeCost || 0,
        isOvertime: session.isOvertime || false,
        date: getTodayDate()
    };
    stores.sessions.push(completedSession);

    // Clear device
    device.status = 'available';
    device.session = null;

    saveStores();
    renderDevices();
    showInvoice(completedSession);
    showToast(`${device.name} تم الإيقاف - ${totalCost.toFixed(2)} ${stores.settings.currencySymbol}`);
    console.log(`⏹️ Session stopped for ${device.name}`, completedSession);
}

function addTime(deviceId) {
    const device = stores.devices.find(d => d.id === deviceId);
    if (!device || !device.session || device.session.type !== 'timed') return;

    device.session.duration += 5;
    saveStores();
    showToast(`تمت إضافة 5 دقائق لـ ${device.name}`);
}

function openTransferModal(deviceId) {
    state.currentDevice = deviceId;
    const container = document.getElementById('transfer-device-list');
    container.innerHTML = '';

    const availableDevices = stores.devices.filter(d => d.status === 'available');

    if (availableDevices.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-text">لا توجد أجهزة متاحة</div></div>';
    } else {
        availableDevices.forEach(device => {
            const btn = document.createElement('button');
            btn.className = 'device-select-btn';
            btn.textContent = device.name;
            btn.onclick = () => transferSession(deviceId, device.id);
            container.appendChild(btn);
        });
    }

    openModal('transfer-modal');
}

function transferSession(fromId, toId) {
    const fromDevice = stores.devices.find(d => d.id === fromId);
    const toDevice = stores.devices.find(d => d.id === toId);

    if (!fromDevice || !toDevice || !fromDevice.session) return;

    // Create transfer record
    const transferRecord = {
        id: Date.now(),
        fromDeviceName: fromDevice.name,
        toDeviceName: toDevice.name,
        sessionStartTime: fromDevice.session.startTime,
        transferTime: new Date(),
        cashier: state.currentUser ? state.currentUser.username : 'unknown'
    };

    // Store transfer log
    if (!stores.transfers) stores.transfers = [];
    stores.transfers.push(transferRecord);

    // Move session
    toDevice.session = JSON.parse(JSON.stringify(fromDevice.session)); // Deep copy to avoid reference issues

    // Restore Date objects lost during JSON stringify/parse
    if (toDevice.session.startTime) toDevice.session.startTime = new Date(toDevice.session.startTime);
    if (toDevice.session.pausedAt) toDevice.session.pausedAt = new Date(toDevice.session.pausedAt);

    toDevice.status = fromDevice.status; // Preserve status (busy/paused/overtime)

    fromDevice.session = null;
    fromDevice.status = 'available';

    saveStores();
    renderDevices();
    closeModal('transfer-modal');
    // If device details modal is open for the old device, close it or switch it
    if (currentDetailsDevice && currentDetailsDevice.id === fromId) {
        closeDeviceDetails();
    }
    showToast(`تم النقل من ${fromDevice.name} إلى ${toDevice.name}`);
}

// ====================================
// DEVICE TIMER ENGINE
// ====================================
// Global tick every second: countdown, auto-stop at zero, save every tick, update .device-timer & .device-revenue

let timerEngineIntervalId = null;

function startTimerEngine() {
    if (timerEngineIntervalId) clearInterval(timerEngineIntervalId);
    timerEngineIntervalId = setInterval(() => {
        tickTimerEngine();
    }, 1000);
}

function tickTimerEngine() {
    const now = new Date();
    let didSave = false;
    stores.devices.forEach(device => {
        if (device.status !== 'busy' && device.status !== 'paused') return;
        const session = device.session;
        if (!session) return;
        if (session.isPaused) {
            updateDeviceTimerDisplay(device, session, now);
            return;
        }
        let elapsed = now - new Date(session.startTime);
        if (session.pausedTime) elapsed -= session.pausedTime;
        const elapsedSeconds = Math.floor(elapsed / 1000);
        if (session.type === 'timed') {
            const totalSeconds = (session.duration || 0) * 60;
            const remaining = totalSeconds - elapsedSeconds;
            session.remainingSeconds = Math.max(0, remaining);
            if (session.remainingSeconds <= 0) {
                playTimerAlert();
                showToast(`⏰ ${device.name} - انتهى الوقت!`, 'error');
                stopSession(device.id);
                didSave = true;
                return;
            }
            if (remaining === 30 && !session.warned30) { session.warned30 = true; playTimerAlert(); showToast(`⚠️ ${device.name} - باقي 30 ثانية!`, 'warning'); }
            if (remaining === 10 && !session.warned10) { session.warned10 = true; playTimerAlert(); showToast(`⚠️ ${device.name} - باقي 10 ثواني!`, 'error'); }
        } else {
            session.remainingSeconds = elapsedSeconds;
        }
        const hours = elapsed / (1000 * 60 * 60);
        const sessionCost = hours * (session.gamePrice || 0);
        const productsCost = (session.products || []).reduce((sum, p) => sum + p.price, 0);
        session.revenue = sessionCost + productsCost;
        updateDeviceTimerDisplay(device, session, now);
    });
    if (didSave) return;
    const anyBusy = stores.devices.some(d => (d.status === 'busy' || d.status === 'paused') && d.session);
    if (anyBusy) saveStores();
}

function updateDeviceTimerDisplay(device, session, now) {
    const timerEl = document.getElementById(`timer-${device.id}`);
    const revenueEl = document.getElementById(`revenue-${device.id}`);
    const sym = stores.settings.currencySymbol || 'ج.م';
    if (session.type === 'timed' && session.remainingSeconds != null) {
        const r = Math.max(0, session.remainingSeconds);
        const h = Math.floor(r / 3600), m = Math.floor((r % 3600) / 60), s = r % 60;
        if (timerEl) {
            timerEl.textContent = h > 0 ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
            timerEl.style.color = r < 60 ? '#ff4444' : '';
            timerEl.style.fontWeight = r < 60 ? 'bold' : '';
        }
    } else {
        let elapsed = now - new Date(session.startTime);
        if (session.pausedTime) elapsed -= session.pausedTime;
        const sec = Math.floor(elapsed / 1000);
        const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
        if (timerEl) timerEl.textContent = h > 0 ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    const rev = (session.revenue != null) ? session.revenue : 0;
    if (revenueEl) revenueEl.textContent = `${rev.toFixed(2)} ${sym}`;
}

// ====================================
// GAMES MANAGEMENT
// ====================================

function renderGames() {
    if (!hasPermission('games')) return;

    const list = document.getElementById('game-list');
    list.innerHTML = '';

    const otherGames = stores.games.filter(g => g.type === 'other');

    if (otherGames.length === 0) {
        list.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🎮</div>
                <div class="empty-state-text">لا توجد ألعاب إضافية</div>
            </div>
        `;
        return;
    }

    otherGames.forEach(game => {
        const item = document.createElement('div');
        item.className = 'game-item';
        item.innerHTML = `
            <div class="game-icon-display">${game.icon}</div>
            <div class="game-info">
                <div class="game-name">${game.name}</div>
                <div class="game-price">${game.price} ${stores.settings.currencySymbol} / ساعة</div>
            </div>
            <div class="game-actions">
                <button class="btn btn-warning btn-sm" onclick="editGame(${game.id})">✏️</button>
                <button class="btn btn-danger btn-sm" onclick="deleteGame(${game.id})">🗑️</button>
            </div>
        `;
        list.appendChild(item);
    });
}

function saveGame() {
    if (!hasPermission('games')) {
        showToast('ليس لديك صلاحية', 'error');
        return;
    }

    const name = document.getElementById('game-name').value.trim();
    const price = parseFloat(document.getElementById('game-price').value);
    const icon = document.getElementById('game-icon').value.trim() || '🎮';

    if (!name || isNaN(price) || price < 0) {
        showToast('الرجاء إدخال بيانات صحيحة', 'error');
        return;
    }

    const game = {
        id: Date.now(),
        name: name,
        price: price,
        icon: icon,
        type: 'other'
    };

    stores.games.push(game);
    saveStores();
    renderGames();
    closeModal('add-game-modal');
    showToast('تم إضافة اللعبة');
}

function editGame(gameId) {
    if (!hasPermission('games')) {
        showToast('ليس لديك صلاحية', 'error');
        return;
    }

    const game = stores.games.find(g => g.id === gameId);
    if (!game) return;

    state.currentGameId = gameId;
    document.getElementById('edit-game-name').value = game.name;
    document.getElementById('edit-game-price').value = game.price;
    document.getElementById('edit-game-icon').value = game.icon;

    openModal('edit-game-modal');
}

function updateGame() {
    const game = stores.games.find(g => g.id === state.currentGameId);
    if (!game) return;

    const name = document.getElementById('edit-game-name').value.trim();
    const price = parseFloat(document.getElementById('edit-game-price').value);
    const icon = document.getElementById('edit-game-icon').value.trim() || '🎮';

    if (!name || isNaN(price) || price < 0) {
        showToast('الرجاء إدخال بيانات صحيحة', 'error');
        return;
    }

    game.name = name;
    game.price = price;
    game.icon = icon;

    saveStores();
    renderGames();
    renderDevices();
    closeModal('edit-game-modal');
    showToast('تم تحديث اللعبة');
}

function deleteGame(gameId) {
    if (!hasPermission('games')) {
        showToast('ليس لديك صلاحية', 'error');
        return;
    }

    const inUse = stores.devices.some(d => d.session && d.session.gameId === gameId);

    if (inUse) {
        showToast('لا يمكن حذف لعبة قيد الاستخدام', 'error');
        return;
    }

    if (confirm('حذف هذه اللعبة؟')) {
        stores.games = stores.games.filter(g => g.id !== gameId);
        saveStores();
        renderGames();
        showToast('تم حذف اللعبة');
    }
}

function setGameIcon(icon) {
    document.getElementById('game-icon').value = icon;
}

function setEditGameIcon(icon) {
    document.getElementById('edit-game-icon').value = icon;
}

// ====================================
// PRODUCTS & INVENTORY
// ====================================

function renderProducts() {
    if (!hasPermission('products')) return;

    const list = document.getElementById('product-list');
    list.innerHTML = '';

    if (stores.products.length === 0) {
        list.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📦</div>
                <div class="empty-state-text">لا توجد منتجات مضافة</div>
            </div>
        `;
        return;
    }

    stores.products.forEach(product => {
        const stockClass = product.quantity <= 5 ? 'low-stock' : '';
        const item = document.createElement('div');
        item.className = 'product-item';
        item.innerHTML = `
            <div class="product-info">
                <div class="product-name">${product.name}</div>
                <div class="product-price">${product.price} ${stores.settings.currencySymbol}</div>
                <div class="product-stock ${stockClass}">المخزون: ${product.quantity}</div>
            </div>
            <div class="product-actions">
                <button class="btn btn-warning btn-sm" onclick="editProduct(${product.id})">✏️</button>
                <button class="btn btn-danger btn-sm" onclick="deleteProduct(${product.id})">🗑️</button>
            </div>
        `;
        list.appendChild(item);
    });
}

function renderInventory() {
    if (!hasPermission('inventory')) return;

    const totalProducts = stores.products.length;
    const totalStock = stores.products.reduce((sum, p) => sum + p.quantity, 0);
    const totalValue = stores.products.reduce((sum, p) => sum + (p.cost * p.quantity), 0);

    document.getElementById('total-products-count').textContent = totalProducts;
    document.getElementById('total-stock-count').textContent = totalStock;
    document.getElementById('total-stock-value').textContent = `${totalValue.toFixed(2)} ${stores.settings.currencySymbol}`;

    const list = document.getElementById('inventory-list');
    list.innerHTML = '';

    if (stores.products.length === 0) {
        list.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📦</div>
                <div class="empty-state-text">لا توجد منتجات في المخزون</div>
            </div>
        `;
        return;
    }

    stores.products.forEach(product => {
        const profit = product.price - product.cost;
        const profitMargin = ((profit / product.price) * 100).toFixed(1);
        const stockValue = product.cost * product.quantity;
        const stockClass = product.quantity <= 5 ? 'low-stock' : '';

        const item = document.createElement('div');
        item.className = 'inventory-item';
        item.innerHTML = `
            <div class="inventory-header">
                <div class="inventory-item-name">${product.name}</div>
                <button class="btn btn-success btn-sm" onclick="openRestockModal(${product.id})">+ إعادة تخزين</button>
            </div>
            <div class="inventory-details">
                <div class="inventory-detail">
                    <span>الكمية:</span>
                    <span class="${stockClass}">${product.quantity}</span>
                </div>
                <div class="inventory-detail">
                    <span>سعر البيع:</span>
                    <span>${product.price} ${stores.settings.currencySymbol}</span>
                </div>
                <div class="inventory-detail">
                    <span>سعر الشراء:</span>
                    <span>${product.cost} ${stores.settings.currencySymbol}</span>
                </div>
                <div class="inventory-detail">
                    <span>هامش الربح:</span>
                    <span>${profitMargin}%</span>
                </div>
                <div class="inventory-detail">
                    <span>قيمة المخزون:</span>
                    <span>${stockValue.toFixed(2)} ${stores.settings.currencySymbol}</span>
                </div>
            </div>
        `;
        list.appendChild(item);
    });
}

function saveProduct() {
    if (!hasPermission('products')) {
        showToast('ليس لديك صلاحية', 'error');
        return;
    }

    const name = document.getElementById('product-name').value.trim();
    const price = parseFloat(document.getElementById('product-price').value);
    const cost = parseFloat(document.getElementById('product-cost').value);
    const quantity = parseInt(document.getElementById('product-quantity').value) || 0;

    if (!name || isNaN(price) || price < 0 || isNaN(cost) || cost < 0) {
        showToast('الرجاء إدخال بيانات صحيحة', 'error');
        return;
    }

    const product = {
        id: Date.now(),
        name: name,
        price: price,
        cost: cost,
        quantity: quantity
    };

    stores.products.push(product);
    saveStores();
    renderProducts();
    renderInventory();
    closeModal('add-product-modal');

    document.getElementById('product-name').value = '';
    document.getElementById('product-price').value = '';
    document.getElementById('product-cost').value = '';
    document.getElementById('product-quantity').value = '';

    showToast('تم إضافة المنتج');
}

function editProduct(productId) {
    if (!hasPermission('products')) {
        showToast('ليس لديك صلاحية', 'error');
        return;
    }

    const product = stores.products.find(p => p.id === productId);
    if (!product) return;

    state.currentProductId = productId;
    document.getElementById('edit-product-name').value = product.name;
    document.getElementById('edit-product-price').value = product.price;
    document.getElementById('edit-product-cost').value = product.cost;

    openModal('edit-product-modal');
}

function updateProduct() {
    const product = stores.products.find(p => p.id === state.currentProductId);
    if (!product) return;

    const name = document.getElementById('edit-product-name').value.trim();
    const price = parseFloat(document.getElementById('edit-product-price').value);
    const cost = parseFloat(document.getElementById('edit-product-cost').value);

    if (!name || isNaN(price) || price < 0 || isNaN(cost) || cost < 0) {
        showToast('الرجاء إدخال بيانات صحيحة', 'error');
        return;
    }

    product.name = name;
    product.price = price;
    product.cost = cost;

    saveStores();
    renderProducts();
    renderInventory();
    closeModal('edit-product-modal');
    showToast('تم تحديث المنتج');
}

function deleteProduct(productId) {
    if (!hasPermission('products')) {
        showToast('ليس لديك صلاحية', 'error');
        return;
    }

    if (confirm('حذف هذا المنتج؟')) {
        stores.products = stores.products.filter(p => p.id !== productId);
        saveStores();
        renderProducts();
        renderInventory();
        showToast('تم حذف المنتج');
    }
}

function openRestockModal(productId) {
    if (!hasPermission('inventory')) {
        showToast('ليس لديك صلاحية', 'error');
        return;
    }

    const product = stores.products.find(p => p.id === productId);
    if (!product) return;

    state.currentProductId = productId;
    document.getElementById('restock-product-name').textContent = product.name;
    document.getElementById('restock-current-qty').textContent = product.quantity;
    document.getElementById('restock-quantity').value = '';

    openModal('restock-modal');
}

function confirmRestock() {
    const product = stores.products.find(p => p.id === state.currentProductId);
    if (!product) return;

    const addQty = parseInt(document.getElementById('restock-quantity').value);

    if (isNaN(addQty) || addQty < 1) {
        showToast('الرجاء إدخال كمية صحيحة', 'error');
        return;
    }

    product.quantity += addQty;

    saveStores();
    renderInventory();
    renderProducts();
    closeModal('restock-modal');
    showToast(`تمت إضافة ${addQty} من ${product.name}`);
}

function openSellProductModal(deviceId) {
    if (!hasPermission('devices')) {
        showToast('ليس لديك صلاحية', 'error');
        return;
    }

    state.currentDevice = deviceId;
    const container = document.getElementById('product-selection');
    container.innerHTML = '';

    const availableProducts = stores.products.filter(p => p.quantity > 0);

    if (availableProducts.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-text">لا توجد منتجات متاحة في المخزون</div>
            </div>
        `;
    } else {
        availableProducts.forEach(product => {
            const item = document.createElement('div');
            item.className = 'product-select-item';
            item.innerHTML = `
                <div class="product-select-info">
                    <div class="product-select-name">${product.name}</div>
                    <div class="product-select-price">${product.price} ${stores.settings.currencySymbol}</div>
                    <div class="product-select-stock">متوفر: ${product.quantity}</div>
                </div>
                <button class="btn btn-success btn-sm" onclick="sellProduct(${product.id})">بيع</button>
            `;
            container.appendChild(item);
        });
    }

    openModal('sell-product-modal');
}

function sellProduct(productId) {
    const device = stores.devices.find(d => d.id === state.currentDevice);
    const product = stores.products.find(p => p.id === productId);

    if (!device || !device.session || !product) return;

    if (product.quantity <= 0) {
        showToast('المنتج غير متوفر في المخزون', 'error');
        return;
    }

    device.session.products.push({
        id: product.id,
        name: product.name,
        price: product.price,
        cost: product.cost
    });

    product.quantity--;

    saveStores();
    renderProducts();
    renderInventory();
    closeModal('sell-product-modal');
    showToast(`تمت إضافة ${product.name} إلى ${device.name}`);
}

// ====================================
// INVOICE ENGINE
// ====================================

function buildInvoiceFromSession(completedSession) {
    const timeUsed = completedSession.duration || 0;
    const games = completedSession.gameName ? [{ name: completedSession.gameName, price: completedSession.sessionCost || 0 }] : [];
    const products = (completedSession.products || []).map(p => ({ name: p.name, price: p.price }));
    const subtotal = (completedSession.sessionCost || 0) + (completedSession.productsCost || 0);
    const taxRate = stores.settings.taxRate != null ? stores.settings.taxRate : 0;
    const tax = subtotal * taxRate;
    const total = subtotal + tax;

    return {
        id: Date.now(),
        deviceId: completedSession.deviceId,
        deviceName: completedSession.deviceName,
        timeUsed,
        bookedTime: completedSession.bookedTime || timeUsed,
        products,
        games,
        subtotal,
        tax,
        total,
        overtimeMinutes: completedSession.overtimeMinutes || 0,
        overtimeCost: completedSession.overtimeCost || 0,
        isOvertime: completedSession.isOvertime || false,
        includeOvertime: true, // Default to include
        date: getTodayDate(),
        endTime: completedSession.endTime
    };
}

function renderInvoiceDetails(invoice) {
    const container = document.getElementById('invoice-details');
    if (!container) return;
    const sym = stores.settings.currencySymbol || 'ج.م';
    let rows = '';
    rows += `<div class="invoice-row"><span>الجهاز:</span><span><strong>${invoice.deviceName || '-'}</strong></span></div>`;
    rows += `<div class="invoice-row"><span>المدة المحجوزة:</span><span>${invoice.bookedTime || invoice.timeUsed} دقيقة</span></div>`;
    rows += `<div class="invoice-row"><span>المدة الفعلية:</span><span>${invoice.timeUsed} دقيقة</span></div>`;

    if (invoice.games && invoice.games.length) {
        invoice.games.forEach(g => {
            rows += `<div class="invoice-row"><span>${g.name || 'لعبة'}</span><span>${(g.price || 0).toFixed(2)} ${sym}</span></div>`;
        });
    }
    if (invoice.products && invoice.products.length) {
        rows += '<div class="invoice-products"><h3>المنتجات</h3>';
        invoice.products.forEach(p => {
            rows += `<div class="invoice-row"><span>${p.name}</span><span>${(p.price || 0).toFixed(2)} ${sym}</span></div>`;
        });
        rows += '</div>';
    }

    // Overtime section with toggle
    if (invoice.isOvertime && invoice.overtimeMinutes > 0) {
        rows += '<div class="invoice-divider"></div>';
        rows += '<div class="invoice-section-title">⏰ الوقت الإضافي</div>';
        rows += `<div class="invoice-row"><span>مدة الوقت الإضافي:</span><span>${invoice.overtimeMinutes} دقيقة</span></div>`;
        rows += `<div class="invoice-row"><span>تكلفة الوقت الإضافي:</span><span>${invoice.overtimeCost.toFixed(2)} ${sym}</span></div>`;
        rows += `
            <div class="invoice-row overtime-toggle-row">
                <label class="overtime-toggle-label">
                    <input type="checkbox" id="include-overtime-checkbox" ${invoice.includeOvertime ? 'checked' : ''} 
                           onchange="toggleOvertimeInInvoice(this.checked)">
                    <span>إضافة الوقت الإضافي للفاتورة</span>
                </label>
            </div>
        `;
        rows += '<div class="invoice-divider"></div>';
    }

    // Calculate final total based on overtime toggle
    const finalSubtotal = invoice.subtotal + (invoice.includeOvertime ? invoice.overtimeCost : 0);
    const finalTax = finalSubtotal * (invoice.tax / invoice.subtotal || 0); // Proportional tax
    const finalTotal = finalSubtotal + finalTax;

    rows += `<div class="invoice-row"><span>المجموع الفرعي:</span><span>${finalSubtotal.toFixed(2)} ${sym}</span></div>`;
    rows += `<div class="invoice-row"><span>الضريبة:</span><span>${finalTax.toFixed(2)} ${sym}</span></div>`;

    if (invoice.isOvertime && !invoice.includeOvertime) {
        rows += `<div class="invoice-row overtime-not-charged"><span>الوقت الإضافي (غير محتسب):</span><span>${invoice.overtimeCost.toFixed(2)} ${sym}</span></div>`;
    }

    rows += `<div class="invoice-row total"><span>الإجمالي:</span><span>${finalTotal.toFixed(2)} ${sym}</span></div>`;
    container.innerHTML = rows;
}

// Store current invoice globally for toggle
let currentInvoice = null;

function toggleOvertimeInInvoice(includeOvertime) {
    console.log(`💰 Overtime toggle: ${includeOvertime ? 'INCLUDED' : 'NOT CHARGED'}`);
    if (currentInvoice) {
        currentInvoice.includeOvertime = includeOvertime;
        renderInvoiceDetails(currentInvoice);
    }
}

function showInvoice(completedSession) {
    const invoice = buildInvoiceFromSession(completedSession);
    stores.invoices.push(invoice);
    saveStores();
    currentInvoice = invoice; // Store for toggle
    renderInvoiceDetails(invoice);
    openModal('invoice-modal');
}

// ====================================
// REPORT
// ====================================

// ====================================
// ADVANCED REPORTING
// ====================================

let currentReportTab = 'general';
let reportFilter = {
    period: 'today', // today, week, month, all
    customStart: null,
    customEnd: null
};

function initReports() {
    // Tab switching
    document.querySelectorAll('.report-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.report-tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentReportTab = btn.dataset.tab;

            document.querySelectorAll('.report-tab-content').forEach(c => c.classList.remove('active'));
            document.getElementById(`report-${currentReportTab}`).classList.add('active');

            updateReportData();
        });
    });

    // Period switching
    document.querySelectorAll('.report-period-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.report-period-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            reportFilter.period = btn.dataset.period;
            updateReportData();
        });
    });
}

function getFilteredSessions() {
    const now = new Date();
    let start = new Date();
    let end = new Date();

    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    if (reportFilter.period === 'week') {
        const day = start.getDay();
        const diff = start.getDate() - day + (day === 0 ? -6 : 1); // Adjust for starts on Monday
        start.setDate(diff);
        start.setDate(start.getDate() - 7); // Last 7 days? Or current week? Let's do Last 7 Days for simplicity or current week.
        // Let's implement "Last 7 Days"
        start = new Date();
        start.setDate(now.getDate() - 7);
        start.setHours(0, 0, 0, 0);
    } else if (reportFilter.period === 'month') {
        start.setDate(1); // 1st of current month
    } else if (reportFilter.period === 'all') {
        start = new Date(0); // Beginning of time
    }

    // Filter sessions
    return stores.sessions.filter(s => {
        const sDate = new Date(s.endTime);
        return sDate >= start && sDate <= end;
    });
}

function getFilteredTransfers() {
    const now = new Date();
    let start = new Date();
    let end = new Date();

    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    if (reportFilter.period === 'week') {
        start = new Date();
        start.setDate(now.getDate() - 7);
        start.setHours(0, 0, 0, 0);
    } else if (reportFilter.period === 'month') {
        start.setDate(1);
    } else if (reportFilter.period === 'all') {
        start = new Date(0);
    }

    return (stores.transfers || []).filter(t => {
        const tDate = new Date(t.transferTime);
        return tDate >= start && tDate <= end;
    });
}

function updateReport() {
    // Redirect to updateReportData which handles logic
    updateReportData();
}

function updateReportData() {
    if (!hasPermission('reports')) return;

    const sessions = getFilteredSessions();
    const transfers = getFilteredTransfers();

    // Update Summaries
    const totalRevenue = sessions.reduce((sum, s) => sum + (s.total || 0), 0);
    const sessionsCount = sessions.length;
    const productsRevenue = sessions.reduce((sum, s) => sum + (s.productsCost || 0), 0);
    const productsProfit = sessions.reduce((sum, s) => sum + (s.productsProfit || 0), 0);

    document.getElementById('rep-total-revenue').textContent = `${totalRevenue.toFixed(2)} ${stores.settings.currencySymbol}`;
    document.getElementById('rep-total-sessions').textContent = sessionsCount;
    document.getElementById('rep-product-revenue').textContent = `${productsRevenue.toFixed(2)} ${stores.settings.currencySymbol}`;
    document.getElementById('rep-net-profit').textContent = `${productsProfit.toFixed(2)} ${stores.settings.currencySymbol}`; // Note: This logic for net profit seems to only count product profit based on previous code. We might want to add Game Revenue in future.

    // Update specific tab content
    if (currentReportTab === 'general') {
        renderGeneralReport(sessions);
    } else if (currentReportTab === 'devices') {
        renderDevicesReport(sessions, transfers);
    } else if (currentReportTab === 'cashiers') {
        renderCashiersReport(sessions);
    }
}

function renderGeneralReport(sessions) {
    const container = document.getElementById('report-general-list');
    if (!sessions.length) {
        container.innerHTML = '<div class="empty-state">لا توجد بيانات لهذه الفترة</div>';
        return;
    }

    let html = '<table class="report-table"><thead><tr><th>التاريخ</th><th>الجهاز</th><th>اللعبة</th><th>الكاشير</th><th>المدة</th><th>المنتجات</th><th>الإجمالي</th></tr></thead><tbody>';

    // Sort by date desc
    const sorted = [...sessions].sort((a, b) => new Date(b.endTime) - new Date(a.endTime));

    sorted.forEach(s => {
        const date = new Date(s.endTime).toLocaleDateString('ar-EG');
        const time = new Date(s.endTime).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
        html += `
            <tr>
                <td>${date} <span class="text-xs text-gray">${time}</span></td>
                <td>${s.deviceName}</td>
                <td>${s.gameName}</td>
                <td>${s.cashier || '-'}</td>
                <td>${s.duration} د</td>
                <td>${(s.products || []).length}</td>
                <td class="font-bold">${s.total.toFixed(2)}</td>
            </tr>
        `;
    });
    html += '</tbody></table>';
    container.innerHTML = html;
}

function renderDevicesReport(sessions, transfers) {
    const container = document.getElementById('report-devices-list');
    const deviceStats = {};

    // Initialize all devices
    stores.devices.forEach(d => {
        deviceStats[d.name] = { name: d.name, revenue: 0, minutes: 0, sessions: 0, transfersIn: 0, transfersOut: 0 };
    });

    // Aggregating Sessions
    sessions.forEach(s => {
        // Fallback if device was renamed or deleted, though currently deleted devices aren't handled well in ID matching.
        // We use deviceName from session snapshot.
        const dName = s.deviceName;
        if (!deviceStats[dName]) deviceStats[dName] = { name: dName, revenue: 0, minutes: 0, sessions: 0, transfersIn: 0, transfersOut: 0 };

        deviceStats[dName].revenue += s.total;
        deviceStats[dName].minutes += s.duration;
        deviceStats[dName].sessions++;
    });

    // Aggregating Transfers
    transfers.forEach(t => {
        if (deviceStats[t.fromDeviceName]) deviceStats[t.fromDeviceName].transfersOut++;
        if (deviceStats[t.toDeviceName]) deviceStats[t.toDeviceName].transfersIn++;
    });

    let html = '<table class="report-table"><thead><tr><th>الجهاز</th><th>عدد الجلسات</th><th>إجمالي الوقت (د)</th><th>نقل (منه / إليه)</th><th>الإيراد</th></tr></thead><tbody>';

    Object.values(deviceStats).forEach(stat => {
        if (stat.sessions === 0 && stat.transfersIn === 0 && stat.transfersOut === 0) return; // Hide unused
        html += `
            <tr>
                <td class="font-bold">${stat.name}</td>
                <td>${stat.sessions}</td>
                <td>${stat.minutes}</td>
                <td><span class="text-danger">Out: ${stat.transfersOut}</span> / <span class="text-success">In: ${stat.transfersIn}</span></td>
                <td class="font-bold text-success">${stat.revenue.toFixed(2)}</td>
            </tr>
        `;
    });
    html += '</tbody></table>';
    container.innerHTML = html;
}

function renderCashiersReport(sessions) {
    const container = document.getElementById('report-cashiers-list');
    const cashierStats = {};

    sessions.forEach(s => {
        const name = s.cashier || 'غير معروف';
        if (!cashierStats[name]) cashierStats[name] = { name, sessions: 0, revenue: 0, products: 0 };

        cashierStats[name].sessions++;
        cashierStats[name].revenue += s.total;
        cashierStats[name].products += (s.products || []).length;
    });

    let html = '<table class="report-table"><thead><tr><th>الكاشير</th><th>عدد الجلسات</th><th>المنتجات المباعة</th><th>إجمالي الإيراد</th></tr></thead><tbody>';

    Object.values(cashierStats).forEach(stat => {
        html += `
            <tr>
                <td class="font-bold">${stat.name}</td>
                <td>${stat.sessions}</td>
                <td>${stat.products}</td>
                <td class="font-bold text-success">${stat.revenue.toFixed(2)}</td>
            </tr>
        `;
    });
    html += '</tbody></table>';
    container.innerHTML = html;
}

// ====================================
// SETTINGS
// ====================================

function updateSettings() {
    document.getElementById('currency-symbol').value = stores.settings.currencySymbol;
}

function saveSettings() {
    if (!hasPermission('settings')) {
        showToast('ليس لديك صلاحية', 'error');
        return;
    }

    const currency = document.getElementById('currency-symbol').value.trim();

    if (!currency) {
        showToast('الرجاء إدخال رمز العملة', 'error');
        return;
    }

    stores.settings.currencySymbol = currency;
    saveStores();

    renderDevices();
    renderGames();
    renderProducts();
    renderInventory();
    updateReport();

    showToast('تم حفظ الإعدادات');
}

// ====================================
// MODALS
// ====================================

function openModal(modalId) {
    document.getElementById(modalId).classList.add('active');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

// ====================================
// UTILITIES
// ====================================

function getTodayDate() {
    const now = new Date();
    return now.toISOString().split('T')[0];
}

function formatTime(date) {
    const d = new Date(date);
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
}

function playTimerAlert() {
    try {
        const audio = document.getElementById('timer-alert');
        if (audio) {
            audio.currentTime = 0;
            audio.play().catch(e => console.log('Audio play failed:', e));
        }

        // Visual notification
        if (document.body) {
            document.body.style.animation = 'flash 0.5s';
            setTimeout(() => {
                document.body.style.animation = '';
            }, 500);
        }
    } catch (e) {
        console.log('Alert sound error:', e);
    }
}

function printInvoice() {
    const invoiceContent = document.getElementById('invoice-details').innerHTML;
    const printWindow = window.open('', '_blank');

    printWindow.document.write(`
        <!DOCTYPE html>
        <html dir="rtl" lang="ar">
        <head>
            <meta charset="UTF-8">
            <title>فاتورة - PlayStation Cafe</title>
            <style>
                body {
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    direction: rtl;
                    padding: 20px;
                    max-width: 400px;
                    margin: 0 auto;
                }
                h3 {
                    text-align: center;
                    margin-bottom: 20px;
                    color: #1a1a2e;
                }
                .invoice-row {
                    display: flex;
                    justify-content: space-between;
                    padding: 8px 0;
                    border-bottom: 1px solid #eee;
                }
                .invoice-row.total {
                    font-weight: bold;
                    font-size: 1.2em;
                    border-top: 2px solid #333;
                    border-bottom: 2px solid #333;
                    margin-top: 10px;
                }
                .invoice-divider {
                    border-bottom: 2px dashed #ccc;
                    margin: 15px 0;
                }
                .invoice-products {
                    margin: 15px 0;
                }
                .invoice-products h3 {
                    font-size: 1em;
                    text-align: right;
                    margin: 10px 0;
                }
                .invoice-section-title {
                    font-weight: bold;
                    margin: 15px 0 10px;
                }
                @media print {
                    body {
                        padding: 0;
                    }
                }
            </style>
        </head>
        <body>
            <h3>🎮 PlayStation Cafe</h3>
            <div class="invoice-date" style="text-align: center; margin-bottom: 20px;">
                ${new Date().toLocaleString('ar-EG')}
            </div>
            ${invoiceContent}
            <div style="text-align: center; margin-top: 30px; font-size: 0.9em; color: #666;">
                شكراً لزيارتكم - نتمنى لكم وقتاً ممتعاً
            </div>
        </body>
        </html>
    `);

    printWindow.document.close();

    // Wait for content to load then print
    setTimeout(() => {
        printWindow.print();
    }, 250);
}

// ====================================
// USER MANAGEMENT
// ====================================

function renderUsers() {
    const list = document.getElementById('users-list');
    if (!list) return;

    list.innerHTML = '';
    const users = stores.users || [];

    if (users.length === 0) {
        list.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">👥</div>
                <div class="empty-state-text">لا يوجد مستخدمون</div>
            </div>
        `;
        return;
    }

    users.forEach(user => {
        const item = document.createElement('div');
        item.className = 'user-item';

        const roleLabels = {
            'admin': 'مدير - كل الصلاحيات',
            'cashier': 'كاشير - إدارة الأجهزة والمنتجات',
            'viewer': 'مشاهد - التقارير فقط'
        };

        const roleText = roleLabels[user.role] || user.role;
        const isCurrentUser = state.currentUser && state.currentUser.username === user.username;
        const canDelete = user.username !== 'admin' && !isCurrentUser;

        item.innerHTML = `
            <div class="user-item-info">
                <div class="user-item-name">
                    ${user.fullname || user.username}
                    ${isCurrentUser ? '<span style="color: var(--accent); font-size: 14px;"> (أنت)</span>' : ''}
                </div>
                <div class="user-item-role">${user.username}</div>
                <div class="user-permissions">${roleText}</div>
            </div>
            <div class="user-actions">
                ${user.username !== 'admin' ? `<button class="btn btn-warning btn-sm" onclick="editUser('${user.username}')">✏️ تعديل</button>` : ''}
                ${canDelete ? `<button class="btn btn-danger btn-sm" onclick="deleteUser('${user.username}')">🗑️ حذف</button>` : ''}
            </div>
        `;
        list.appendChild(item);
    });
}

function saveUser() {
    const username = document.getElementById('new-username').value.trim();
    const password = document.getElementById('new-password').value;
    const fullname = document.getElementById('new-fullname').value.trim();
    const role = document.getElementById('new-user-role').value;

    if (!username || !password || !fullname) {
        showToast('الرجاء إدخال جميع البيانات', 'error');
        return;
    }

    // Check if username exists
    if (stores.users.some(u => u.username === username)) {
        showToast('اسم المستخدم موجود بالفعل', 'error');
        return;
    }

    const newUser = {
        username: username,
        password: password,
        fullname: fullname,
        role: role,
        permissions: getPermissionsForRole(role)
    };

    stores.users.push(newUser);
    saveStores();
    renderUsers();
    closeModal('add-user-modal');
    showToast('تم إضافة المستخدم بنجاح');
}

function editUser(username) {
    const user = stores.users.find(u => u.username === username);
    if (!user) return;

    document.getElementById('edit-username').value = user.username;
    document.getElementById('edit-password').value = '';
    document.getElementById('edit-fullname').value = user.fullname || '';
    document.getElementById('edit-user-role').value = user.role || 'cashier';

    state.editingUsername = username;
    openModal('edit-user-modal');
}

function updateUser() {
    const username = state.editingUsername;
    const user = stores.users.find(u => u.username === username);
    if (!user) return;

    const newPassword = document.getElementById('edit-password').value;
    const fullname = document.getElementById('edit-fullname').value.trim();
    const role = document.getElementById('edit-user-role').value;

    if (!fullname) {
        showToast('الرجاء إدخال الاسم الكامل', 'error');
        return;
    }

    // Update user
    if (newPassword) user.password = newPassword;
    user.fullname = fullname;
    user.role = role;
    user.permissions = getPermissionsForRole(role);

    // If editing current user, update state
    if (state.currentUser && state.currentUser.username === username) {
        state.currentUser = user;
        localStorage.setItem(STORAGE_KEYS.currentUser, JSON.stringify(user));
        updateUserInfo();
        applyPermissions();
    }

    saveStores();
    renderUsers();
    closeModal('edit-user-modal');
    showToast('تم تحديث المستخدم بنجاح');
}

function deleteUser(username) {
    // Protect admin user
    if (username === 'admin') {
        showToast('لا يمكن حذف المستخدم الأساسي', 'error');
        return;
    }

    // Protect current user
    if (state.currentUser && state.currentUser.username === username) {
        showToast('لا يمكنك حذف حسابك أثناء تسجيل الدخول', 'error');
        return;
    }

    if (confirm(`هل أنت متأكد من حذف المستخدم "${username}"؟`)) {
        stores.users = stores.users.filter(u => u.username !== username);
        saveStores();
        renderUsers();
        showToast('تم حذف المستخدم');
    }
}

function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// ====================================
// START APP
// ====================================

document.addEventListener('DOMContentLoaded', init);
// ====================================
// DEVICE DETAILS MODAL
// ====================================

// Current device being viewed in details
let currentDetailsDevice = null;

/**
 * Open Device Details Modal
 */
function openDeviceDetails(deviceId) {
    console.log('[DeviceDetails] Opening modal for device ID:', deviceId);

    const device = stores.devices.find(d => d.id === deviceId);

    if (!device) {
        console.error('[DeviceDetails] Device not found:', deviceId);
        showToast('الجهاز غير موجود', 'error');
        return;
    }

    if (!device.session) {
        console.log('[DeviceDetails] Device is not in use');
        showToast('هذا الجهاز غير مشغول حالياً', 'error');
        return;
    }

    currentDetailsDevice = device;
    console.log('[DeviceDetails] Device session:', device.session);

    // Populate modal
    updateDeviceDetailsUI();

    // Show modal
    openModal('device-details-modal');

    console.log('[DeviceDetails] Modal opened successfully');
}

/**
 * Update all UI elements in device details modal
 */
function updateDeviceDetailsUI() {
    if (!currentDetailsDevice || !currentDetailsDevice.session) return;

    const device = currentDetailsDevice;
    const session = device.session;

    console.log('[DeviceDetails] Updating UI...');

    // Device name
    document.getElementById('dd-device-name').textContent = device.name;

    // Start time
    const startTime = new Date(session.startTime);
    document.getElementById('dd-start-time').textContent = formatDateTime(startTime);

    // Calculate elapsed time (excluding paused time)
    const now = new Date();
    let elapsed = now - startTime;

    // Subtract paused time
    if (session.pausedTime) {
        elapsed -= session.pausedTime;
    }

    // If currently paused, subtract current pause duration
    if (session.isPaused && session.pausedAt) {
        const currentPauseDuration = now - new Date(session.pausedAt);
        elapsed -= currentPauseDuration;
    }

    const elapsedMinutes = Math.floor(elapsed / 1000 / 60);

    // Booked time
    const bookedTime = session.bookedTime || 0;
    document.getElementById('dd-booked-time').textContent =
        bookedTime > 0 ? `${bookedTime} دقيقة` : 'مفتوح';

    // Base time and overtime calculation
    let baseTimeUsed = elapsedMinutes;
    let overtimeUsed = 0;

    if (session.type === 'timed' && bookedTime > 0) {
        if (elapsedMinutes > bookedTime) {
            baseTimeUsed = bookedTime;
            overtimeUsed = elapsedMinutes - bookedTime;
        }
    }

    document.getElementById('dd-base-time').textContent = `${baseTimeUsed} دقيقة`;
    document.getElementById('dd-overtime').textContent =
        overtimeUsed > 0 ? `${overtimeUsed} دقيقة` : 'لا يوجد';

    // Price per minute
    const pricePerHour = session.gamePrice || 0;
    const pricePerMinute = (pricePerHour / 60).toFixed(2);
    document.getElementById('dd-price-min').textContent =
        `${pricePerMinute} ${stores.settings.currencySymbol}`;

    // Game name
    const game = stores.games.find(g => g.id === session.gameId);
    document.getElementById('dd-game').textContent = game ? game.name : 'غير معروف';

    // Edit fields
    document.getElementById('dd-edit-booked').value = bookedTime || '';
    document.getElementById('dd-edit-price').value = pricePerHour || '';

    // Calculate costs
    const baseHours = baseTimeUsed / 60;
    const overtimeHours = overtimeUsed / 60;

    const baseCost = baseHours * pricePerHour;
    const overtimeCost = overtimeHours * pricePerHour;

    // Check if overtime charging is enabled (default true)
    const chargeOvertime = session.chargeOvertime !== false;
    document.getElementById('dd-charge-overtime').checked = chargeOvertime;

    const totalCost = baseCost + (chargeOvertime ? overtimeCost : 0);

    // Display costs
    document.getElementById('dd-base-cost').textContent =
        `${baseCost.toFixed(2)} ${stores.settings.currencySymbol}`;
    document.getElementById('dd-overtime-cost').textContent =
        `${overtimeCost.toFixed(2)} ${stores.settings.currencySymbol}`;
    document.getElementById('dd-total-cost').textContent =
        `${totalCost.toFixed(2)} ${stores.settings.currencySymbol}`;

    // Update invoice preview
    updateInvoicePreview();

    console.log('[DeviceDetails] UI updated:', {
        device: device.name,
        elapsedMinutes,
        baseTimeUsed,
        overtimeUsed,
        baseCost: baseCost.toFixed(2),
        overtimeCost: overtimeCost.toFixed(2),
        totalCost: totalCost.toFixed(2),
        chargeOvertime
    });
}

/**
 * Update booked time
 */
function updateBookedTime() {
    if (!currentDetailsDevice || !currentDetailsDevice.session) return;

    const newBookedTime = parseInt(document.getElementById('dd-edit-booked').value);

    if (!newBookedTime || newBookedTime < 1) {
        showToast('الرجاء إدخال وقت صحيح', 'error');
        return;
    }

    const oldBookedTime = currentDetailsDevice.session.bookedTime;

    console.log('[DeviceDetails] Updating booked time:', {
        from: oldBookedTime,
        to: newBookedTime
    });

    currentDetailsDevice.session.bookedTime = newBookedTime;

    // Reset overtime flags if time extended beyond current elapsed time
    const now = new Date();
    let elapsed = now - new Date(currentDetailsDevice.session.startTime);
    if (currentDetailsDevice.session.pausedTime) {
        elapsed -= currentDetailsDevice.session.pausedTime;
    }
    const elapsedMinutes = Math.floor(elapsed / 1000 / 60);

    if (elapsedMinutes < newBookedTime) {
        currentDetailsDevice.session.isOvertime = false;
        currentDetailsDevice.session.overtimeStarted = false;
        console.log('[DeviceDetails] Overtime flags reset (time extended)');
    }

    saveStores();
    updateDeviceDetailsUI();
    renderDevices(); // Update main view

    showToast('تم تحديث الوقت المحجوز', 'success');
    console.log('[DeviceDetails] Booked time updated successfully');
}

/**
 * Update price per hour
 */
function updatePricePerHour() {
    if (!currentDetailsDevice || !currentDetailsDevice.session) return;

    const newPrice = parseFloat(document.getElementById('dd-edit-price').value);

    if (isNaN(newPrice) || newPrice < 0) {
        showToast('الرجاء إدخال سعر صحيح', 'error');
        return;
    }

    const oldPrice = currentDetailsDevice.session.gamePrice;

    console.log('[DeviceDetails] Updating price per hour:', {
        from: oldPrice,
        to: newPrice
    });

    currentDetailsDevice.session.gamePrice = newPrice;

    saveStores();
    updateDeviceDetailsUI();

    showToast('تم تحديث السعر', 'success');
    console.log('[DeviceDetails] Price updated successfully');
}

/**
 * Toggle overtime charging
 */
function toggleOvertimeCharge() {
    if (!currentDetailsDevice || !currentDetailsDevice.session) return;

    const chargeOvertime = document.getElementById('dd-charge-overtime').checked;

    console.log('[DeviceDetails] Toggle overtime charging:', chargeOvertime);

    currentDetailsDevice.session.chargeOvertime = chargeOvertime;

    saveStores();
    updateDeviceDetailsUI();

    console.log('[DeviceDetails] Invoice recalculated with overtime:', chargeOvertime);
}

/**
 * Update invoice preview
 */
function updateInvoicePreview() {
    if (!currentDetailsDevice || !currentDetailsDevice.session) return;

    const session = currentDetailsDevice.session;
    const game = stores.games.find(g => g.id === session.gameId);

    // Calculate all values
    const now = new Date();
    let elapsed = now - new Date(session.startTime);

    if (session.pausedTime) {
        elapsed -= session.pausedTime;
    }

    if (session.isPaused && session.pausedAt) {
        elapsed -= (now - new Date(session.pausedAt));
    }

    const elapsedMinutes = Math.floor(elapsed / 1000 / 60);
    const bookedTime = session.bookedTime || 0;

    let baseTime = elapsedMinutes;
    let overtime = 0;

    if (session.type === 'timed' && bookedTime > 0 && elapsedMinutes > bookedTime) {
        baseTime = bookedTime;
        overtime = elapsedMinutes - bookedTime;
    }

    const pricePerHour = session.gamePrice || 0;
    const baseCost = (baseTime / 60) * pricePerHour;
    const overtimeCost = (overtime / 60) * pricePerHour;

    const chargeOvertime = session.chargeOvertime !== false;
    const total = baseCost + (chargeOvertime ? overtimeCost : 0);

    // Build invoice HTML
    let html = `
        <div class="dd-invoice-row">
            <span>الجهاز:</span>
            <span><strong>${currentDetailsDevice.name}</strong></span>
        </div>
        <div class="dd-invoice-row">
            <span>اللعبة:</span>
            <span>${game ? game.name : 'غير معروف'}</span>
        </div>
        <div class="dd-invoice-row">
            <span>الوقت الأساسي:</span>
            <span>${baseTime} دقيقة</span>
        </div>
        <div class="dd-invoice-row">
            <span>تكلفة الوقت الأساسي:</span>
            <span>${baseCost.toFixed(2)} ${stores.settings.currencySymbol}</span>
        </div>
    `;

    // Overtime section
    if (overtime > 0) {
        html += `
            <div class="dd-invoice-row overtime-row">
                <span>⏰ الوقت الإضافي:</span>
                <span><strong>${overtime} دقيقة</strong></span>
            </div>
            <div class="dd-invoice-row overtime-row">
                <span>تكلفة الوقت الإضافي:</span>
                <span><strong>${overtimeCost.toFixed(2)} ${stores.settings.currencySymbol}</strong></span>
            </div>
            <div class="dd-invoice-row" style="background: ${chargeOvertime ? '#d4edda' : '#f8d7da'}; padding: 10px; border-radius: 5px;">
                <span>${chargeOvertime ? '✅' : '❌'} احتساب الوقت الإضافي:</span>
                <span><strong>${chargeOvertime ? 'نعم' : 'لا'}</strong></span>
            </div>
        `;
    }

    // Products if any
    if (session.products && session.products.length > 0) {
        html += `<div class="dd-invoice-row"><span colspan="2"><strong>المنتجات:</strong></span></div>`;
        session.products.forEach(p => {
            html += `
                <div class="dd-invoice-row">
                    <span>  • ${p.name}</span>
                    <span>${p.price} ${stores.settings.currencySymbol}</span>
                </div>
            `;
        });
    }

    // Total
    html += `
        <div class="dd-invoice-row total">
            <span>الإجمالي النهائي:</span>
            <span>${total.toFixed(2)} ${stores.settings.currencySymbol}</span>
        </div>
    `;

    document.getElementById('dd-invoice-content').innerHTML = html;
}

/**
 * Close device details modal
 */
function closeDeviceDetails() {
    console.log('[DeviceDetails] Closing modal');
    closeModal('device-details-modal');
    currentDetailsDevice = null;
    console.log('[DeviceDetails] Modal closed');
}

/**
 * Apply changes and close
 */
function applyAndClose() {
    console.log('[DeviceDetails] Applying all changes and closing');

    if (currentDetailsDevice) {
        saveStores();
        renderDevices(); // Update main view
        showToast('تم حفظ جميع التغييرات', 'success');
    }

    closeDeviceDetails();
}

/**
 * Format date and time
 */
function formatDateTime(date) {
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
}

