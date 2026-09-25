const container = document.getElementById('container');
const registerBtn = document.getElementById('register');
const loginBtn = document.getElementById('login');

// Transisi Animasi Slide Geser (Sign Up / Sign In)
registerBtn.addEventListener('click', () => {
    container.classList.add("active");
});

loginBtn.addEventListener('click', () => {
    container.classList.remove("active");
});

// Logika Pendaftaran Akun
document.getElementById('registerForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('regName').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPassword').value;

    if (name && email && password) {
        // Simpan Akun Ke LocalStorage
        const userData = { name, email, password };
        localStorage.setItem('sanctuary_user', JSON.stringify(userData));
        
        // Update Nama Pasangan di Website
        localStorage.setItem('sanctuary_coupleNames', name);

        alert('Registrasi Berhasil! Silakan masuk dengan akun kamu.');
        container.classList.remove("active");
    }
});

// Logika Masuk / Login Ke Website utama (index.html)
document.getElementById('loginForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;

    const savedUser = JSON.parse(localStorage.getItem('sanctuary_user'));

    // Validasi Sederhana
    if (savedUser && savedUser.email === email && savedUser.password === password) {
        localStorage.setItem('sanctuary_isLoggedIn', 'true');
        alert(`Selamat Datang Kembali, ${savedUser.name}! ❤️`);
        window.location.href = 'index.html'; // Masuk ke halaman utama
    } else if (email && password) {
        // Izinkan masuk langsung jika belum ada akun tersimpan di LocalStorage
        localStorage.setItem('sanctuary_isLoggedIn', 'true');
        window.location.href = 'index.html';
    } else {
        alert('Email atau kata sandi tidak cocok!');
    }
});

function forgotPass() {
    alert('Petunjuk: Masukkan kata sandi yang telah kamu buat pada menu Register!');
}