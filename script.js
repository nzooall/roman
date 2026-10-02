// Konfigurasi & Inisialisasi Firebase
const firebaseConfig = {
    apiKey: "AIzaSyAlkY_-xWPzop1Lg4-PQj_hqOkevwIsRzE",
    authDomain: "roman-website.firebaseapp.com",
    databaseURL: "https://roman-website-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "roman-website",
    storageBucket: "roman-website.firebasestorage.app",
    messagingSenderId: "358696108775",
    appId: "1:358696108775:web:bf340c26129775158f1842"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();

const currentYearEl = document.getElementById('currentYear');
if (currentYearEl) currentYearEl.textContent = new Date().getFullYear();

// 1. PASSWORD ADMIN
// Password admin TIDAK lagi disimpan di kode. Login dicek oleh Firebase Authentication (backend Google).
// Isi dengan email akun admin yang kamu buat di Firebase Console -> Authentication -> Users.
const ADMIN_EMAIL = "adminkenzo@gmail.com";

// 2. DETEKSI PERANGKAT DAN BROWSER RINCI
function getDeviceType() {
    const ua = navigator.userAgent;
    
    if (/iPhone/i.test(ua)) return "iPhone";
    if (/iPad/i.test(ua)) return "iPad";
    if (/Android/i.test(ua)) {
        if (/Samsung|SM-/i.test(ua)) return "Samsung";
        if (/Xiaomi|Redmi|POCO/i.test(ua)) return "Xiaomi";
        if (/OPPO|CPH/i.test(ua)) return "OPPO";
        if (/vivo|V2/i.test(ua)) return "Vivo";
        if (/Realme|RMX/i.test(ua)) return "Realme";
        if (/Infinix/i.test(ua)) return "Infinix";
        return "Android HP";
    }
    if (/Macintosh|Mac OS X/i.test(ua)) return "MacBook/Mac";
    if (/Windows/i.test(ua)) return "Windows PC";
    if (/Linux/i.test(ua)) return "Linux PC";
    
    return "Desktop/Laptop";
}

function getBrowserName() {
    const ua = navigator.userAgent;

    if (/Edg/i.test(ua)) return "Microsoft Edge";
    if (/OPR|Opera/i.test(ua)) return "Opera";
    if (/SamsungBrowser/i.test(ua)) return "Samsung Internet";
    if (/UCBrowser/i.test(ua)) return "UC Browser";
    if (/Chrome/i.test(ua) && !/Edg/i.test(ua)) return "Chrome";
    if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) return "Safari";
    if (/Firefox/i.test(ua)) return "Firefox";
    
    return "Browser";
}

// TRACKING PENGUNJUNG REALTIME & RECORD HISTORY
const sessionId = sessionStorage.getItem('sanctuary_session_id') || ("user_" + Math.random().toString(36).substr(2, 9));
sessionStorage.setItem('sanctuary_session_id', sessionId);

const userPresenceRef = db.ref('presence/' + sessionId);
const historyRef = db.ref('history/' + sessionId);
const connectedRef = db.ref('.info/connected');

const userDevice = `${getDeviceType()} (${getBrowserName()})`;
let joinTime = new Date().toLocaleString('id-ID');
let isHistoryRecorded = false;

// FUNGSI KHUSUS UNTUK MEMAKSA TULIS HISTORY SAAT SAFARI iOS DITUTUP
function buildHistoryPayload(endLabel) {
    const p = {
        sessionId: sessionId,
        device: userDevice,
        timestamp: `${joinTime} - ${endLabel}`,
        status: "Selesai (Keluar Web)"
    };
    if (typeof lastLocation !== 'undefined' && lastLocation) p.location = lastLocation;
    return p;
}

// Daftarkan ulang cadangan riwayat (saat koneksi putus) agar ikut membawa lokasi terakhir
function refreshHistoryOnDisconnect() {
    historyRef.onDisconnect().set(buildHistoryPayload('Terputus'));
}

function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function forceSaveHistory() {
    if (isHistoryRecorded) return;
    isHistoryRecorded = true;

    const exitTime = new Date().toLocaleTimeString('id-ID');
    const payload = buildHistoryPayload(exitTime);
    sendToSheet('exit', { exitAt: new Date().toLocaleString('id-ID') });

    // Menggunakan Fetch dengan keepalive: true agar tetap dikirim saat iOS menutup browser
    const url = `${firebaseConfig.databaseURL}/history/${sessionId}.json`;
    try {
        fetch(url, {
            method: 'PUT',
            body: JSON.stringify(payload),
            headers: { 'Content-Type': 'application/json' },
            keepalive: true
        });
        
        // Hapus presence
        fetch(`${firebaseConfig.databaseURL}/presence/${sessionId}.json`, {
            method: 'DELETE',
            keepalive: true
        });
    } catch (e) {
        historyRef.set(payload);
        userPresenceRef.remove();
    }
}

connectedRef.on('value', (snap) => {
    if (snap.val() === true) {
        joinTime = new Date().toLocaleString('id-ID');

        // Backup Firebase jika server terputus
        userPresenceRef.onDisconnect().remove();
        refreshHistoryOnDisconnect();

        // Simpan data online aktif
        userPresenceRef.set({
            online: true,
            device: userDevice,
            joinedAt: joinTime,
            geoStatus: geoStatus,
            location: lastLocation || null
        });
        sendToSheet('join');
    }
});

// MEMAKSA RECORD HISTORY KHUSUS BROWSER MOBILE / SAFARI iOS
window.addEventListener('pagehide', forceSaveHistory);
window.addEventListener('beforeunload', forceSaveHistory);
document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') {
        forceSaveHistory();
    }
});

// ===== SAMBUNGAN KE GOOGLE SHEETS =====
// Isi dua baris ini setelah Apps Script di-deploy (lihat panduan). Kosongkan URL untuk menonaktifkan.
const SHEET_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbz0tNRIYYzMVoZwmpR3_WmTEui6K9o5i-TReHY5Eg_bthB1QKGo-wvwQEgCoONWXwqM/exec';   // contoh: 'https://script.google.com/macros/s/XXXX/exec'
const SHEET_TOKEN = '05052009';   // harus sama dengan TOKEN di Code.gs
let lastSheetSent = 0;

let sheetWarned = false;
function sendToSheet(type, extra) {
    if (!SHEET_WEBHOOK_URL) {
        if (!sheetWarned) { console.warn('[Sheet] SHEET_WEBHOOK_URL masih kosong di script.js, jadi data tidak dikirim ke Google Sheets.'); sheetWarned = true; }
        return;
    }
    console.log('[Sheet] mengirim:', type);
    const loc = lastLocation || {};
    const body = Object.assign({
        token: SHEET_TOKEN, type: type, sessionId: sessionId, device: userDevice, joinedAt: joinTime, ms: Date.now(),
        lat: loc.lat, lng: loc.lng, accuracy: loc.accuracy, place: loc.place,
        updatedAt: loc.updatedAt ? new Date(loc.updatedAt).toLocaleString('id-ID') : ''
    }, extra || {});
    try {
        fetch(SHEET_WEBHOOK_URL, { method: 'POST', mode: 'no-cors', keepalive: type === 'exit', body: JSON.stringify(body) }).catch(() => {});
    } catch (e) {}
}

// LOKASI REAL-TIME (hanya jika pengunjung mengizinkan)
let lastLocation = null;
let geoStatus = 'Belum diizinkan';
let geoWatchId = null;
let lastGeoSent = 0;
let lastPlaceCoords = null;

function distanceKm(a, b) {
    const R = 6371, toRad = d => d * Math.PI / 180;
    const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
}

function showGeoBanner(show) {
    const el = document.getElementById('geoConsentBanner');
    if (el) el.classList.toggle('hidden', !show);
}

function showGeoStopBtn(show) {
    const el = document.getElementById('geoStopBtn');
    if (el) el.classList.toggle('hidden', !show);
}

function setGeoStatus(status) {
    geoStatus = status;
    userPresenceRef.update({ geoStatus: status }).catch(() => {});
}

let geoHighAccuracy = true;
let geoRetryTimer = null;

function startLocationSharing() {
    if (!navigator.geolocation) { setGeoStatus('Tidak didukung browser'); return; }
    if (geoWatchId !== null) return;
    clearTimeout(geoRetryTimer);
    setGeoStatus('Mencari lokasi...');
    geoWatchId = navigator.geolocation.watchPosition(onGeoSuccess, onGeoError, {
        enableHighAccuracy: geoHighAccuracy, maximumAge: 30000, timeout: geoHighAccuracy ? 12000 : 30000
    });
}

function onGeoSuccess(pos) {
    console.log('[Lokasi] terdeteksi, akurasi', Math.round(pos.coords.accuracy), 'm');
    localStorage.setItem('sanctuary_geo_consent', 'accepted');
    showGeoBanner(false);
    showGeoStopBtn(true);
    const now = Date.now();
    if (now - lastGeoSent < 5000) return;
    lastGeoSent = now;

    const lat = pos.coords.latitude, lng = pos.coords.longitude;
    lastLocation = Object.assign({}, lastLocation, {
        lat, lng, accuracy: Math.round(pos.coords.accuracy), updatedAt: now
    });
    geoStatus = 'Aktif';
    userPresenceRef.update({ location: lastLocation, geoStatus: 'Aktif' }).catch(() => {});
    refreshHistoryOnDisconnect();
    if (now - lastSheetSent > 30000) { lastSheetSent = now; sendToSheet('location'); }
    maybeReverseGeocode(lat, lng);
}

function onGeoError(err) {
    console.warn('[Lokasi] error kode', err.code, err.message);
    if (geoWatchId !== null) { navigator.geolocation.clearWatch(geoWatchId); geoWatchId = null; }

    if (err.code === 1) {   // izin ditolak / diblokir
        showGeoStopBtn(false);
        localStorage.removeItem('sanctuary_geo_consent');
        setGeoStatus('Ditolak pengunjung');
        showBlockedHintIfDenied();
        scheduleGeoReminder();
        return;
    }

    // kode 2 = posisi tidak tersedia, kode 3 = waktu habis: coba mode jaringan (Wi-Fi/IP) lalu terus mencoba
    if (geoHighAccuracy) { geoHighAccuracy = false; startLocationSharing(); return; }
    setGeoStatus(err.code === 3 ? 'Lokasi: waktu habis, mencoba lagi' : 'Lokasi: tidak tersedia, mencoba lagi');
    if (sessionStorage.getItem('sanctuary_geo_stopped') === '1') return;
    geoRetryTimer = setTimeout(startLocationSharing, 20000);
}

function maybeReverseGeocode(lat, lng) {
    if (lastPlaceCoords && distanceKm(lastPlaceCoords, { lat, lng }) < 1) return;
    lastPlaceCoords = { lat, lng };
    fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&accept-language=id&lat=${lat}&lon=${lng}`)
        .then(r => r.json())
        .then(d => {
            const a = d.address || {};
            const place = [a.suburb || a.village || a.neighbourhood, a.city || a.town || a.county, a.state, a.country]
                .filter(Boolean).join(', ') || d.display_name || '';
            if (!place) return;
            if (lastLocation) lastLocation.place = place;
            userPresenceRef.child('location/place').set(place).catch(() => {});
            refreshHistoryOnDisconnect();
            sendToSheet('location');
        })
        .catch(() => {});
}

function acceptLocationSharing() {
    localStorage.setItem('sanctuary_geo_consent', 'accepted');
    showGeoBanner(false);
    startLocationSharing();
}

function declineLocationSharing() {
    // "Nanti saja" TIDAK disimpan permanen: banner muncul lagi tiap beberapa detik
    // dan di setiap kunjungan berikutnya, sampai pengunjung menekan "Izinkan".
    showGeoBanner(false);
    scheduleGeoReminder();
}

let geoReminderTimer = null;
const GEO_REMINDER_MS = 45000; // ubah angka ini untuk mengatur jeda munculnya banner lagi
function scheduleGeoReminder() {
    clearTimeout(geoReminderTimer);
    geoReminderTimer = setTimeout(() => {
        if (geoWatchId !== null) return;
        if (sessionStorage.getItem('sanctuary_geo_stopped') === '1') return;
        if (navigator.permissions && navigator.permissions.query) {
            navigator.permissions.query({ name: 'geolocation' }).then(p => {
                if (p.state === 'prompt') showGeoBanner(true);
                else if (p.state === 'granted') startLocationSharing();
            }).catch(() => showGeoBanner(true));
        } else {
            showGeoBanner(true);
        }
    }, GEO_REMINDER_MS);
}

function stopLocationSharing() {
    if (geoWatchId !== null) { navigator.geolocation.clearWatch(geoWatchId); geoWatchId = null; }
    sessionStorage.setItem('sanctuary_geo_stopped', '1');   // berlaku selama tab ini saja
    localStorage.removeItem('sanctuary_geo_consent');       // kunjungan berikutnya ditanya lagi
    lastLocation = null;
    userPresenceRef.child('location').remove().catch(() => {});
    refreshHistoryOnDisconnect();
    sendToSheet('stop');
    setGeoStatus('Dihentikan pengunjung');
    showGeoStopBtn(false);
}

function showBlockedHintIfDenied() {
    if (!(navigator.permissions && navigator.permissions.query)) return;
    navigator.permissions.query({ name: 'geolocation' }).then(p => {
        const el = document.getElementById('geoBlockedHint');
        if (el) el.classList.toggle('hidden', p.state !== 'denied');
    }).catch(() => {});
}

function initLocationConsent() {
    if (!navigator.geolocation) { setGeoStatus('Tidak didukung browser'); return; }
    // bersihkan nilai lama dari versi sebelumnya
    const old = localStorage.getItem('sanctuary_geo_consent');
    if (old === 'stopped' || old === 'declined') localStorage.removeItem('sanctuary_geo_consent');

    if (sessionStorage.getItem('sanctuary_geo_stopped') === '1') { setGeoStatus('Dihentikan pengunjung'); return; }
    if (localStorage.getItem('sanctuary_geo_consent') === 'accepted') { startLocationSharing(); return; }

    if (navigator.permissions && navigator.permissions.query) {
        navigator.permissions.query({ name: 'geolocation' })
            .then(p => {
                if (p.state === 'granted') {
                    localStorage.setItem('sanctuary_geo_consent', 'accepted');
                    startLocationSharing();
                } else if (p.state === 'denied') {
                    setGeoStatus('Diblokir browser');
                    showBlockedHintIfDenied();
                } else {
                    showGeoBanner(true);
                }
            })
            .catch(() => showGeoBanner(true));
    } else {
        showGeoBanner(true);
    }
}
window.addEventListener('load', initLocationConsent);

let locationListenerStarted = false;
function listenToLocationData() {
    if (locationListenerStarted) return;
    locationListenerStarted = true;
    db.ref('presence').on('value', (snapshot) => {
        const tbody = document.getElementById('locationTableBody');
        tbody.innerHTML = '';
        const data = snapshot.val();
        if (!data) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center text-slate-400">Tidak ada pengunjung aktif.</td></tr>';
            return;
        }
        Object.keys(data).forEach((key) => {
            const v = data[key], loc = v.location;
            const tr = document.createElement('tr');
            const cell = (text) => { const td = document.createElement('td'); td.textContent = text; tr.appendChild(td); return td; };

            const statusTd = cell(' Online');
            const dot = document.createElement('span');
            dot.className = 'status-dot';
            statusTd.prepend(dot);

            cell(key).style.fontFamily = 'monospace';
            cell(v.device || 'Unknown');

            if (loc && typeof loc.lat === 'number') {
                cell(loc.place || 'Mencari nama lokasi...');
                cell(`${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}`);
                cell(`±${loc.accuracy} m`);
                cell(new Date(loc.updatedAt).toLocaleTimeString('id-ID'));
                const td = document.createElement('td');
                const a = document.createElement('a');
                a.href = `https://www.google.com/maps?q=${loc.lat},${loc.lng}`;
                a.target = '_blank'; a.rel = 'noopener';
                a.textContent = 'Buka Peta';
                a.style.color = '#ffd700';
                td.appendChild(a);
                tr.appendChild(td);
            } else {
                const td = cell(v.geoStatus || 'Belum diizinkan');
                td.colSpan = 5;
                td.style.color = '#94a3b8';
            }
            tbody.appendChild(tr);
        });
    });
}

// EXPORT KE EXCEL (Lokasi Real-Time + Riwayat Login)
function exportToExcel() {
    if (typeof XLSX === 'undefined') { alert('Library Excel belum termuat. Cek koneksi internet lalu coba lagi.'); return; }
    Promise.all([db.ref('presence').once('value'), db.ref('history').once('value')]).then(([pSnap, hSnap]) => {
        const p = pSnap.val() || {}, h = hSnap.val() || {};
        const mapLink = (l) => (l && typeof l.lat === 'number') ? `https://www.google.com/maps?q=${l.lat},${l.lng}` : '';

        const locRows = Object.keys(p).map((k) => {
            const v = p[k], l = v.location || {};
            return {
                'Status': 'Online',
                'Sesi ID': k,
                'Perangkat': v.device || 'Unknown',
                'Masuk': v.joinedAt || '',
                'Status Lokasi': v.geoStatus || '',
                'Lokasi': l.place || '',
                'Latitude': typeof l.lat === 'number' ? l.lat : '',
                'Longitude': typeof l.lng === 'number' ? l.lng : '',
                'Akurasi (m)': l.accuracy != null ? l.accuracy : '',
                'Update Terakhir': l.updatedAt ? new Date(l.updatedAt).toLocaleString('id-ID') : '',
                'Link Google Maps': mapLink(l)
            };
        });

        const histRows = Object.keys(h).reverse().map((k) => {
            const v = h[k], l = v.location || {};
            return {
                'Waktu Akses': v.timestamp || '',
                'Sesi ID': v.sessionId || k,
                'Perangkat / Browser': v.device || 'Unknown',
                'Status Akhir': v.status || '',
                'Lokasi Terakhir': l.place || '',
                'Latitude': typeof l.lat === 'number' ? l.lat : '',
                'Longitude': typeof l.lng === 'number' ? l.lng : '',
                'Akurasi (m)': l.accuracy != null ? l.accuracy : '',
                'Link Google Maps': mapLink(l)
            };
        });

        const wb = XLSX.utils.book_new();
        const ws1 = XLSX.utils.json_to_sheet(locRows.length ? locRows : [{ 'Info': 'Belum ada pengunjung online saat ini' }]);
        ws1['!cols'] = [{wch:9},{wch:16},{wch:28},{wch:20},{wch:22},{wch:38},{wch:12},{wch:12},{wch:12},{wch:20},{wch:42}];
        const ws2 = XLSX.utils.json_to_sheet(histRows.length ? histRows : [{ 'Info': 'Belum ada riwayat kunjungan' }]);
        ws2['!cols'] = [{wch:34},{wch:16},{wch:28},{wch:22},{wch:38},{wch:12},{wch:12},{wch:12},{wch:42}];
        XLSX.utils.book_append_sheet(wb, ws1, 'Lokasi Real-Time');
        XLSX.utils.book_append_sheet(wb, ws2, 'Riwayat Login');
        XLSX.writeFile(wb, `data-pengunjung-${new Date().toISOString().slice(0,10)}.xlsx`);
    }).catch((e) => alert('Gagal mengambil data dari Firebase: ' + e.message));
}

// 3. LOGIC TOGGLE & LOGIN ADMIN
function toggleLoginBox() {
    const box = document.getElementById('adminLoginBox');
    box.style.display = box.style.display === 'block' ? 'none' : 'block';
}

function checkEnter(e) {
    if (e.key === 'Enter') loginAdmin();
}

function loginAdmin() {
    const pwEl = document.getElementById('adminPasswordInput');
    const errMsgs = document.getElementById('loginError');
    const inputPw = pwEl.value;
    if (!inputPw) return;

    const auth = firebase.auth();
    auth.setPersistence(firebase.auth.Auth.Persistence.SESSION) // otomatis logout saat tab ditutup
        .then(() => auth.signInWithEmailAndPassword(ADMIN_EMAIL, inputPw))
        .then(() => {
            errMsgs.style.display = 'none';
            pwEl.value = '';
            document.getElementById('adminLoginBox').style.display = 'none';

            const adminSec = document.getElementById('adminDashboardSection');
            adminSec.classList.remove('hidden');
            adminSec.scrollIntoView({ behavior: 'smooth' });

            listenToVisitorData();
            listenToHistoryData();
            listenToLocationData();
        })
        .catch((err) => {
            const wrong = ['auth/wrong-password', 'auth/invalid-credential', 'auth/invalid-login-credentials', 'auth/user-not-found', 'auth/invalid-email'];
            errMsgs.textContent = wrong.includes(err.code) ? 'Password salah!'
                : err.code === 'auth/too-many-requests' ? 'Terlalu banyak percobaan, coba lagi nanti.'
                : err.code === 'auth/unauthorized-domain' ? 'Domain website belum didaftarkan di Firebase (Authorized domains).'
                : 'Gagal login: ' + (err.code || err.message);
            errMsgs.style.display = 'block';
        });
}

function closeDashboardSection() {
    document.getElementById('adminDashboardSection').classList.add('hidden');
}

function listenToVisitorData() {
    const presenceRef = db.ref('presence');
    presenceRef.on('value', (snapshot) => {
        const tbody = document.getElementById('visitorTableBody');
        tbody.innerHTML = '';

        const data = snapshot.val();
        let count = 0;

        if (data) {
            Object.keys(data).forEach((key) => {
                count++;
                const visitor = data[key];
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td><span class="status-dot"></span> Online</td>
                    <td style="font-family: monospace;">${key}</td>
                    <td>${visitor.device || 'Unknown'}</td>
                    <td>${visitor.joinedAt || '-'}</td>
                `;
                tbody.appendChild(row);
            });
        } else {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center text-slate-400">Tidak ada pengunjung aktif.</td></tr>';
        }

        const onlineCountEl = document.getElementById('onlineCount');
        if (onlineCountEl) onlineCountEl.innerText = count;
    });
}

function listenToHistoryData() {
    const historyRef = db.ref('history');
    historyRef.on('value', (snapshot) => {
        const tbody = document.getElementById('historyTableBody');
        tbody.innerHTML = '';

        const data = snapshot.val();
        let totalHistory = 0;

        if (data) {
            const keys = Object.keys(data).reverse();
            totalHistory = keys.length;

            keys.forEach((key) => {
                const item = data[key];
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${esc(item.timestamp || '-')}</td>
                    <td style="font-family: monospace;">${esc(item.sessionId || key)}</td>
                    <td>${esc(item.device || 'Unknown')}</td>
                    <td>${item.location ? esc(item.location.place || (item.location.lat.toFixed(5) + ', ' + item.location.lng.toFixed(5))) : '-'}</td>
                    <td><span class="px-2 py-0.5 text-[10px] rounded bg-pink-500/20 text-pink-300 border border-pink-500/30">Selesai</span></td>
                `;
                tbody.appendChild(row);
            });
        } else {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-slate-400">Belum ada riwayat kunjungan.</td></tr>';
        }

        const historyCountEl = document.getElementById('historyCount');
        if (historyCountEl) historyCountEl.innerText = totalHistory;
    });
}

function clearLoginHistory() {
    if (confirm("Apakah kamu yakin ingin menghapus semua riwayat login?")) {
        db.ref('history').remove();
    }
}

// 4. DATA DEFAULT & FIREBASE REALTIME
const DEFAULT_NAMES = "my romance website";
const DEFAULT_START_DATE = '2023-02-14T00:00:00';
const DEFAULT_BUCKET = [
    { id: 1, text: "kelilingi Gm", done: true },
    { id: 2, text: "Stargazing dan ngobrol semalaman", done: true },
    { id: 3, text: "Masak resep pasta baru bareng", done: true },
    { id: 4, text: "Liburan singkat ke pantai pulau impian", done: false }
];

let coupleNames = localStorage.getItem('sanctuary_coupleNames') || DEFAULT_NAMES;
let startDateStr = localStorage.getItem('sanctuary_startDate') || DEFAULT_START_DATE;
let startDate = new Date(startDateStr);

let photoMemories = [];
let bucketList = [];
let notes = [];

const bucketRef = db.ref('bucketList');
const photosRef = db.ref('photoMemories');
const notesRef = db.ref('notes');

bucketRef.once('value').then(snap => {
    if (!snap.exists()) {
        const seed = {};
        DEFAULT_BUCKET.forEach(item => seed[item.id] = item);
        bucketRef.set(seed);
    }
});

bucketRef.on('value', snapshot => {
    const data = snapshot.val();
    bucketList = data ? Object.values(data) : [];
    renderBucketList();
});

photosRef.on('value', snapshot => {
    const data = snapshot.val();
    photoMemories = data ? Object.values(data).sort((a, b) => b.id - a.id) : [];
    renderPhotoGallery();
});

notesRef.on('value', snapshot => {
    const data = snapshot.val();
    notes = data ? Object.values(data).sort((a, b) => b.id - a.id) : [];
    renderNotes();
});

const coupleNamesEl = document.getElementById('coupleNames');
if (coupleNamesEl) coupleNamesEl.textContent = coupleNames;

const options = { year: 'numeric', month: 'long', day: 'numeric' };
const startDateDisplayEl = document.getElementById('startDateDisplay');
if (startDateDisplayEl) startDateDisplayEl.textContent = startDate.toLocaleDateString('id-ID', options);

/* TIMING & COUNTER LOGIC */
function updateCounter() {
    const now = new Date();
    const diff = now - startDate;

    const daysEl = document.getElementById('daysCount');
    const hoursEl = document.getElementById('hoursCount');
    const minutesEl = document.getElementById('minutesCount');
    const secondsEl = document.getElementById('secondsCount');

    if (diff < 0) {
        if (daysEl) daysEl.textContent = "00";
        if (hoursEl) hoursEl.textContent = "00";
        if (minutesEl) minutesEl.textContent = "00";
        if (secondsEl) secondsEl.textContent = "00";
        return;
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const minutes = Math.floor((diff / (1000 * 60)) % 60);
    const seconds = Math.floor((diff / 1000) % 60);

    if (daysEl) daysEl.textContent = String(days).padStart(2, '0');
    if (hoursEl) hoursEl.textContent = String(hours).padStart(2, '0');
    if (minutesEl) minutesEl.textContent = String(minutes).padStart(2, '0');
    if (secondsEl) secondsEl.textContent = String(seconds).padStart(2, '0');
}

setInterval(updateCounter, 1000);
updateCounter();

function editNames() {
    const current = document.getElementById('coupleNames').textContent.trim();
    const newNames = prompt("Masukkan Nama Pasangan (contoh: Romeo & Juliet):", current);
    if (newNames && newNames.trim() !== "") {
        const formatted = newNames.trim();
        document.getElementById('coupleNames').textContent = formatted;
        localStorage.setItem('sanctuary_coupleNames', formatted);
    }
}

function editStartDate() {
    const input = prompt("Masukkan tanggal jadian (Format: YYYY-MM-DD):", startDateStr.split('T')[0]);
    if (input) {
        const parsed = new Date(input + "T00:00:00");
        if (!isNaN(parsed.getTime())) {
            startDate = parsed;
            startDateStr = input + "T00:00:00";
            localStorage.setItem('sanctuary_startDate', startDateStr);
            document.getElementById('startDateDisplay').textContent = parsed.toLocaleDateString('id-ID', options);
            updateCounter();
        } else {
            alert("Format tanggal tidak valid. Gunakan YYYY-MM-DD.");
        }
    }
}

/* PARTIKEL MELAYANG BACKGROUND */
const pCanvas = document.getElementById('particleCanvas');
const pCtx = pCanvas ? pCanvas.getContext('2d') : null;
let particles = [];

function resizeParticleCanvas() {
    if (!pCanvas) return;
    pCanvas.width = window.innerWidth;
    pCanvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeParticleCanvas);
resizeParticleCanvas();

class FloatingParticle {
    constructor() { this.reset(); }
    reset() {
        if (!pCanvas) return;
        this.x = Math.random() * pCanvas.width;
        this.y = pCanvas.height + Math.random() * 100;
        this.size = Math.random() * 4 + 2;
        this.speedY = Math.random() * 1 + 0.3;
        this.speedX = Math.sin(Math.random() * Math.PI) * 0.5;
        this.opacity = Math.random() * 0.6 + 0.2;
        this.type = Math.random() > 0.4 ? 'petal' : 'heart';
        this.rotation = Math.random() * 360;
        this.rotSpeed = (Math.random() - 0.5) * 2;
    }
    update() {
        this.y -= this.speedY;
        this.x += Math.sin(this.y * 0.01) * 0.5 + this.speedX;
        this.rotation += this.rotSpeed;
        if (this.y < -20) this.reset();
    }
    draw() {
        if (!pCtx) return;
        pCtx.save();
        pCtx.translate(this.x, this.y);
        pCtx.rotate((this.rotation * Math.PI) / 180);
        pCtx.globalAlpha = this.opacity;

        if (this.type === 'heart') {
            pCtx.fillStyle = '#ff4d6d';
            pCtx.beginPath();
            const topCurveHeight = this.size * 0.3;
            pCtx.moveTo(0, topCurveHeight);
            pCtx.bezierCurveTo(0, 0, -this.size / 2, 0, -this.size / 2, topCurveHeight);
            pCtx.bezierCurveTo(-this.size / 2, (this.size + topCurveHeight) / 2, 0, this.size, 0, this.size);
            pCtx.bezierCurveTo(0, this.size, this.size / 2, (this.size + topCurveHeight) / 2, this.size / 2, topCurveHeight);
            pCtx.bezierCurveTo(this.size / 2, 0, 0, 0, 0, topCurveHeight);
            pCtx.closePath();
            pCtx.fill();
        } else {
            pCtx.fillStyle = '#f3a6b3';
            pCtx.beginPath();
            pCtx.ellipse(0, 0, this.size, this.size * 1.8, 0, 0, Math.PI * 2);
            pCtx.fill();
        }
        pCtx.restore();
    }
}

if (pCanvas) {
    for (let i = 0; i < 40; i++) particles.push(new FloatingParticle());
}

function animateParticles() {
    if (!pCanvas || !pCtx) return;
    pCtx.clearRect(0, 0, pCanvas.width, pCanvas.height);
    particles.forEach(p => { p.update(); p.draw(); });
    requestAnimationFrame(animateParticles);
}
if (pCanvas) animateParticles();

/* ANIMASI BUNGA MEKAR (CANVAS) */
const fCanvas = document.getElementById('flowerCanvas');
const fCtx = fCanvas ? fCanvas.getContext('2d') : null;
let bloomProgress = 0;
let isBlooming = false;

function resizeFlowerCanvas() {
    if (!fCanvas) return;
    const rect = fCanvas.parentElement.getBoundingClientRect();
    fCanvas.width = rect.width;
    fCanvas.height = rect.height;
    drawFlower(bloomProgress);
}
window.addEventListener('resize', resizeFlowerCanvas);

function drawFlower(progress) {
    if (!fCanvas || !fCtx) return;
    const w = fCanvas.width;
    const h = fCanvas.height;
    const cx = w / 2;
    const cy = h / 2 + 30;

    fCtx.clearRect(0, 0, w, h);

    fCtx.strokeStyle = '#2d6a4f';
    fCtx.lineWidth = 6;
    fCtx.beginPath();
    fCtx.moveTo(cx, cy + 120);
    fCtx.quadraticCurveTo(cx - 20, cy + 60, cx, cy);
    fCtx.stroke();

    const leafScale = Math.min(1, progress * 1.5);
    fCtx.fillStyle = '#40916c';
    fCtx.beginPath();
    fCtx.ellipse(cx - 25 * leafScale, cy + 50, 20 * leafScale, 8 * leafScale, -Math.PI / 4, 0, Math.PI * 2);
    fCtx.fill();
    fCtx.beginPath();
    fCtx.ellipse(cx + 25 * leafScale, cy + 30, 20 * leafScale, 8 * leafScale, Math.PI / 4, 0, Math.PI * 2);
    fCtx.fill();

    const petalLayers = 3;
    for (let layer = petalLayers; layer >= 1; layer--) {
        const petalCount = 5 + layer * 3;
        const radius = (40 - layer * 8) * (0.2 + progress * 0.8);
        const angleStep = (Math.PI * 2) / petalCount;

        for (let i = 0; i < petalCount; i++) {
            const angle = i * angleStep + (layer * 0.2);
            const px = cx + Math.cos(angle) * radius * progress;
            const py = cy + Math.sin(angle) * radius * progress;

            fCtx.save();
            fCtx.translate(px, py);
            fCtx.rotate(angle + Math.PI / 2);

            const petalGradient = fCtx.createLinearGradient(0, -20, 0, 20);
            if (layer === 1) {
                petalGradient.addColorStop(0, '#ff758f');
                petalGradient.addColorStop(1, '#ff4d6d');
            } else if (layer === 2) {
                petalGradient.addColorStop(0, '#ff4d6d');
                petalGradient.addColorStop(1, '#c9184a');
            } else {
                petalGradient.addColorStop(0, '#a4133c');
                petalGradient.addColorStop(1, '#590d22');
            }

            fCtx.fillStyle = petalGradient;
            fCtx.beginPath();
            fCtx.ellipse(0, 0, 14 * progress, (22 - layer * 3) * progress, 0, 0, Math.PI * 2);
            fCtx.fill();
            fCtx.strokeStyle = 'rgba(255, 215, 0, 0.4)';
            fCtx.lineWidth = 1;
            fCtx.stroke();
            fCtx.restore();
        }
    }

    if (progress > 0.5) {
        const centerScale = (progress - 0.5) * 2;
        fCtx.fillStyle = '#ffd700';
        fCtx.beginPath();
        fCtx.arc(cx, cy, 10 * centerScale, 0, Math.PI * 2);
        fCtx.fill();

        fCtx.fillStyle = '#ffffff';
        for (let s = 0; s < 6; s++) {
            const sa = (s * Math.PI) / 3 + progress * 2;
            const sx = cx + Math.cos(sa) * 16 * centerScale;
            const sy = cy + Math.sin(sa) * 16 * centerScale;
            fCtx.beginPath();
            fCtx.arc(sx, sy, 2 * centerScale, 0, Math.PI * 2);
            fCtx.fill();
        }
    }
}

function triggerBloom(reset = false) {
    if (reset) bloomProgress = 0;
    if (isBlooming) return;
    isBlooming = true;

    const quote = document.getElementById('flowerQuote');
    if (quote) quote.classList.add('opacity-0');

    let anim = setInterval(() => {
        bloomProgress += 0.02;
        drawFlower(bloomProgress);

        if (bloomProgress >= 1) {
            bloomProgress = 1;
            clearInterval(anim);
            isBlooming = false;
            if (quote) quote.classList.remove('opacity-0');
            spawnHeartExplosion(window.innerWidth / 2, window.innerHeight / 2);
        }
    }, 30);
}

if (fCanvas) {
    fCanvas.addEventListener('click', () => triggerBloom(true));
    setTimeout(() => resizeFlowerCanvas(), 100);
}

/* AUDIO CONTEXT & MUSIK LATAR */
let audioCtx = null;
let isAudioPlaying = false;
const bgMusic = document.getElementById('bgMusic');
if (bgMusic) bgMusic.volume = 0.5;

function setMusicButtonState(playing) {
    const musicText = document.getElementById('musicText');
    const musicIcon = document.getElementById('musicIcon');
    if (musicText) musicText.textContent = playing ? "Hentikan Musik" : "Putar Musik Favoritmu";
    if (musicIcon) musicIcon.textContent = playing ? "🎶" : "🎵";
}

function toggleRomanticMusic() {
    if (!bgMusic) return;
    if (isAudioPlaying) {
        bgMusic.pause();
        isAudioPlaying = false;
        setMusicButtonState(false);
    } else {
        bgMusic.play().then(() => {
            isAudioPlaying = true;
            setMusicButtonState(true);
        }).catch(() => {});
    }
}

function tryAutoplayMusic() {
    if (!bgMusic) return;
    bgMusic.play().then(() => {
        isAudioPlaying = true;
        setMusicButtonState(true);
    }).catch(() => {
        const startOnInteraction = () => {
            bgMusic.play().then(() => {
                isAudioPlaying = true;
                setMusicButtonState(true);
            }).catch(() => {});
        };
        ['click', 'touchstart', 'keydown', 'scroll'].forEach(evt =>
            document.addEventListener(evt, startOnInteraction, { once: true })
        );
    });
}

tryAutoplayMusic();

function sendMissYouPing() {
    showNotification("Doi baru saja memencet tombol Kangen! 🥰 Seseorang sedang memikirkanmu.");
    playChimeSound();
    spawnHeartExplosion(window.innerWidth / 2, window.innerHeight / 2);
}

function showNotification(msg) {
    const container = document.getElementById('notificationContainer');
    const text = document.getElementById('notifText');
    if (text) text.textContent = msg;
    if (container) container.classList.remove('hidden');
    setTimeout(() => hideNotification(), 5000);
}

function hideNotification() {
    const container = document.getElementById('notificationContainer');
    if (container) container.classList.add('hidden');
}

function playChimeSound() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    audioCtx.resume();

    const notes = [523.25, 659.25, 783.99, 1046.50];
    notes.forEach((freq, idx) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.08, audioCtx.currentTime + idx * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + idx * 0.12 + 0.8);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(audioCtx.currentTime + idx * 0.12);
        osc.stop(audioCtx.currentTime + idx * 0.12 + 0.8);
    });
}

function spawnHeartExplosion(x, y) {
    for (let i = 0; i < 20; i++) {
        const heart = document.createElement('div');
        heart.innerHTML = '💖';
        heart.className = 'fixed text-2xl pointer-events-none z-50 transition-all duration-1000 ease-out';
        heart.style.left = `${x}px`;
        heart.style.top = `${y}px`;
        document.body.appendChild(heart);

        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * 150 + 50;
        const tx = Math.cos(angle) * dist;
        const ty = Math.sin(angle) * dist - 80;

        setTimeout(() => {
            heart.style.transform = `translate(${tx}px, ${ty}px) scale(${Math.random() * 1.5 + 0.5})`;
            heart.style.opacity = '0';
        }, 20);

        setTimeout(() => heart.remove(), 1050);
    }
}

/* MANAJEMEN FOTO KENANGAN */
function renderPhotoGallery() {
    const grid = document.getElementById('photoGrid');
    if (!grid) return;
    grid.innerHTML = '';

    photoMemories.forEach(mem => {
        const card = document.createElement('div');
        card.className = "glass-card glass-card-interactive rounded-2xl p-4 cursor-pointer space-y-3 group";
        card.onclick = () => openPhotoModal(mem);

        card.innerHTML = `
            <div class="h-48 rounded-xl overflow-hidden bg-black/40 relative">
                <img src="${mem.url}" alt="${mem.title}" class="w-full h-full object-cover group-hover:scale-105 transition duration-500">
                <div class="absolute bottom-2 right-2 bg-black/60 backdrop-blur-md px-2 py-1 rounded-lg text-[10px] text-romantic-gold">
                    ${mem.date}
                </div>
            </div>
            <div>
                <span class="text-[10px] text-slate-400 font-medium">📍 ${mem.location}</span>
                <h4 class="font-serif text-lg font-bold text-white group-hover:text-romantic-rose transition">${mem.title}</h4>
                <p class="text-xs text-slate-300 line-clamp-2 mt-1">${mem.desc}</p>
            </div>
        `;
        grid.appendChild(card);
    });
}

function openPhotoModal(mem) {
    currentModalMem = mem;
    document.getElementById('modalImg').src = mem.url;
    document.getElementById('modalTitle').textContent = mem.title;
    document.getElementById('modalDate').textContent = mem.date;
    document.getElementById('modalLoc').textContent = `📍 ${mem.location}`;
    document.getElementById('modalDesc').textContent = mem.desc;
    document.getElementById('photoModal').classList.remove('hidden');
}

let currentModalMem = null;
let editingPhotoId = null;

function closePhotoModal() { document.getElementById('photoModal').classList.add('hidden'); }

function resetPhotoForm() {
    editingPhotoId = null;
    document.getElementById('photoModalFormTitle').textContent = 'Tambah Kenangan Baru 📸';
    document.getElementById('savePhotoBtn').textContent = 'Simpan Kenangan';
    document.getElementById('inputPhotoTitle').value = '';
    document.getElementById('inputPhotoUrl').value = '';
    document.getElementById('inputPhotoDate').value = '';
    document.getElementById('inputPhotoLoc').value = '';
    document.getElementById('inputPhotoDesc').value = '';
}

function openAddPhotoModal() {
    resetPhotoForm();
    document.getElementById('addPhotoModal').classList.remove('hidden');
}

function openEditPhotoModal() {
    if (!currentModalMem) return;
    editingPhotoId = currentModalMem.id;
    document.getElementById('inputPhotoTitle').value = currentModalMem.title;
    document.getElementById('inputPhotoUrl').value = currentModalMem.url;
    document.getElementById('inputPhotoDate').value = currentModalMem.date;
    document.getElementById('inputPhotoLoc').value = currentModalMem.location;
    document.getElementById('inputPhotoDesc').value = currentModalMem.desc;
    document.getElementById('photoModalFormTitle').textContent = 'Edit Kenangan ✏️';
    document.getElementById('savePhotoBtn').textContent = 'Update Kenangan';
    closePhotoModal();
    document.getElementById('addPhotoModal').classList.remove('hidden');
}

function closeAddPhotoModal() { document.getElementById('addPhotoModal').classList.add('hidden'); }

function savePhotoMemory() {
    const title = document.getElementById('inputPhotoTitle').value.trim();
    const url = document.getElementById('inputPhotoUrl').value.trim();
    const date = document.getElementById('inputPhotoDate').value.trim();
    const location = document.getElementById('inputPhotoLoc').value.trim();
    const desc = document.getElementById('inputPhotoDesc').value.trim();

    if (!title || !url) { alert("Mohon isi minimal Judul dan URL Foto!"); return; }

    if (editingPhotoId) {
        photosRef.child(editingPhotoId).update({
            title, url,
            date: date || "Hari Ini",
            location: location || "Indonesia",
            desc: desc || "Momen spesial bersama."
        });
    } else {
        const id = Date.now();
        photosRef.child(id).set({
            id, title, url,
            date: date || "Hari Ini",
            location: location || "Indonesia",
            desc: desc || "Momen spesial bersama."
        });
    }

    closeAddPhotoModal();
    resetPhotoForm();
}

/* MANAJEMEN SURAT RAHASIA */
function openLetter(id) {
    const letterModal = document.getElementById('letterModal');
    const title = document.getElementById('letterTitle');
    const content = document.getElementById('letterContent');
    const headerTag = document.getElementById('letterHeaderTag');

    if (id === 1) {
        headerTag.textContent = "Surat #1 • Open When You Miss Me";
        title.textContent = "Saat Kamu Merindukanku";
        content.innerHTML = `
            <p>Halo Sayang,</p>
            <p>Kalau kamu lagi baca surat ini, berarti kamu lagi kangen banget ya sama aku? Ingat ya, jarak atau kesibukan sejauh apa pun gak akan pernah mengurangi rasa sayangku ke kamu.</p>
            <p>Coba pejamkan matamu sebentar, tarik napas dalam-dalam, dan bayangkan aku lagi memelukmu erat. Aku selalu di sini untukmu, kapan pun kamu butuh tempat untuk pulang.</p>
        `;
        letterModal.classList.remove('hidden');
    } else if (id === 2) {
        const pass = prompt("Masukkan tanggal lahir kamu (DDMM, contoh: 1402):");
        if (pass === "1006" || pass === "10jun" || pass === "0505" || pass === "15") {
            headerTag.textContent = "Surat #2 • Open When You Feel Sad";
            title.textContent = "Saat Hatimu Sedang Sedih";
            content.innerHTML = `
                <p>Hai Sayang,</p>
                <p>Tidak apa-apa kalau hari ini terasa berat. Kamu gak harus selalu kuat setiap saat di depanku. Menangis atau merasa lelah itu sangat manusiawi.</p>
                <p>Ingatlah bahwa kamu tidak sendirian. Kita adalah tim, dan aku akan selalu ada di sampingmu untuk melewati badai terhebat sekalipun. Senyum manis pencerah hariku akan segera kembali, aku yakin itu!</p>
            `;
            letterModal.classList.remove('hidden');
        } else {
            alert("Kata sandi salah! Petunjuk: Coba masukkan 1402.");
        }
    } else if (id === 3) {
        headerTag.textContent = "Surat #3 • Our Future Promises";
        title.textContent = "Distance in words, not in stories";
        content.innerHTML = `
            <p>Untuk Kamu,</p>
            <p>Jarak cuma mengubah cara kita bertukar sapa, bukan cara kita merasa.
                Sejauh apa pun langkah membawa kita, kamu akan selalu punya ruang khusus di hatiku, 
                dan rasa sayang serta perhatian ini enggak akan berkurang sedikit pun oleh ruang dan waktu. 
                Ini bukan tentang kalimat untuk perpisahan, melainkan tentang kalimat yang menjaga rasa yang sama meski berada di tempat yang berbeda. 
                Terima kasih untuk semua kebaikan, cerita, dan momen indah yang udah kita bagi bersama—semuanya akan selalu tersimpan dengan sangat rapi dan abadi di memoriku.</p>
        `;
        letterModal.classList.remove('hidden');
    }
}

function closeLetterModal() { document.getElementById('letterModal').classList.add('hidden'); }

/* MANAJEMEN BUCKET LIST */
function renderBucketList() {
    const container = document.getElementById('bucketListContainer');
    if (!container) return;
    container.innerHTML = '';

    bucketList.forEach(item => {
        const el = document.createElement('div');
        el.className = `p-4 rounded-2xl border flex items-center justify-between transition ${
            item.done 
            ? 'bg-romantic-rose/10 border-romantic-rose/30 text-slate-300' 
            : 'bg-black/30 border-white/10 text-white'
        }`;

        el.innerHTML = `
            <div class="flex items-center space-x-3">
                <button onclick="toggleBucket(${item.id})" class="w-6 h-6 rounded-lg flex items-center justify-center border ${
                    item.done 
                    ? 'bg-romantic-rose border-romantic-rose text-white' 
                    : 'border-white/30 hover:border-romantic-rose'
                }">
                    ${item.done ? '✓' : ''}
                </button>
                <span class="text-sm ${item.done ? 'line-through text-slate-400' : 'font-medium'}">${item.text}</span>
            </div>
            <button onclick="deleteBucket(${item.id})" class="text-xs text-slate-500 hover:text-red-400">✕</button>
        `;
        container.appendChild(el);
    });
}

function toggleBucket(id) {
    const found = bucketList.find(i => i.id === id);
    if (found) {
        const newDone = !found.done;
        if (newDone) spawnHeartExplosion(window.innerWidth / 2, window.innerHeight / 2);
        bucketRef.child(id).update({ done: newDone });
    }
}

function addBucketItem() {
    const input = document.getElementById('newBucketInput');
    const val = input.value.trim();
    if (val) {
        const id = Date.now();
        bucketRef.child(id).set({ id, text: val, done: false });
        input.value = '';
    }
}

function deleteBucket(id) {
    bucketRef.child(id).remove();
}

/* MANAJEMEN NOTES */
function renderNotes() {
    const container = document.getElementById('notesContainer');
    if (!container) return;
    container.innerHTML = '';

    notes.forEach(note => {
        const el = document.createElement('div');
        el.onclick = () => openNoteModal(note.id);
        el.className = 'glass-card glass-card-interactive p-5 rounded-2xl cursor-pointer space-y-2 relative';
        el.innerHTML = `
            <button onclick="event.stopPropagation(); deleteNote(${note.id})" class="absolute top-3 right-3 text-xs text-slate-500 hover:text-red-400">✕</button>
            ${note.title ? `<p class="text-sm font-semibold text-white pr-6 break-words">${note.title}</p>` : ''}
            <p class="text-sm text-slate-300 line-clamp-3 pr-6 break-words">${note.text}</p>
            <div class="flex items-center justify-between pt-1">
                <p class="text-xs text-romantic-gold font-medium">— by: ${note.author}</p>
                <span class="text-xs text-pink-300 font-semibold">Baca →</span>
            </div>
        `;
        container.appendChild(el);
    });
}

function openNoteModal(id) {
    const note = notes.find(n => String(n.id) === String(id));
    if (!note) return;

    const d = new Date(Number(note.id));
    const tanggal = d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const jam = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false }).replace('.', ':');

    const titleEl = document.getElementById('noteModalTitle');
    titleEl.textContent = note.title || 'Notes 📝';

    let timeEl = document.getElementById('noteModalTime');
    if (!timeEl) {
        timeEl = document.createElement('p');
        timeEl.id = 'noteModalTime';
        timeEl.className = 'text-xs text-amber-700/80 mt-2';
        titleEl.insertAdjacentElement('afterend', timeEl);
    }
    timeEl.textContent = `🕒 ${tanggal} • ${jam}`;

    document.getElementById('noteModalContent').innerHTML = `<p>${note.text}</p>`;
    document.getElementById('noteModalAuthor').textContent = `by: ${note.author}`;
    document.getElementById('noteModal').classList.remove('hidden');
}

function closeNoteModal() {
    document.getElementById('noteModal').classList.add('hidden');
}

function addNote() {
    const titleInput = document.getElementById('newNoteTitle');
    const textInput = document.getElementById('newNoteText');
    const authorInput = document.getElementById('newNoteAuthor');
    const title = titleInput.value.trim();
    const text = textInput.value.trim();
    const author = authorInput.value.trim();
    if (!text) return;

    const id = Date.now();
    notesRef.child(id).set({ id, title, text, author: author || 'Anonim' });

    titleInput.value = '';
    textInput.value = '';
}

function deleteNote(id) {
    notesRef.child(id).remove();
}