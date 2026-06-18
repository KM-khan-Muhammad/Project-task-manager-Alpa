// ===== AUTH PAGE LOGIC =====
(async function () {
  const isRegister = window.location.pathname.includes('register');
  const isIndex = !window.location.pathname.includes('/pages/');

  // Redirect if already logged in
  if (Api.getToken()) {
    const base = isIndex ? '' : '../';
    try {
      await Api.getMe();
      window.location.href = getPagePath('dashboard.html');
      return;
    } catch { Api.removeToken(); }
  }

  if (isRegister) {
    initRegisterForm();
  } else {
    initLoginForm();
  }

  function initLoginForm() {
    const form = document.getElementById('loginForm');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearErrors();
      const email = document.getElementById('loginEmail').value.trim();
      const password = document.getElementById('loginPassword').value;
      let valid = true;

      if (!email) { showFieldError('emailError', 'Email is required'); valid = false; }
      else if (!/\S+@\S+\.\S+/.test(email)) { showFieldError('emailError', 'Enter a valid email'); valid = false; }
      if (!password) { showFieldError('passError', 'Password is required'); valid = false; }
      if (!valid) return;

      const btn = document.getElementById('loginBtn');
      const spinner = document.getElementById('loginSpinner');
      btn.disabled = true;
      spinner && spinner.classList.remove('hidden');

      try {
        const data = await Api.login(email, password);
        Api.setToken(data.token);
        setCurrentUser(data.user);
        showToast('Welcome back! Redirecting... <i class="fas fa-spinner fa-spin"></i>', 'success');
        setTimeout(() => { window.location.href = getPagePath('dashboard.html'); }, 400);
      } catch (err) {
        const errEl = document.getElementById('loginError');
        if (errEl) { errEl.textContent = err.message; errEl.classList.add('show'); }
        showToast(err.message, 'error');
      } finally {
        btn.disabled = false;
        spinner && spinner.classList.add('hidden');
      }
    });
  }

  function initRegisterForm() {
    const form = document.getElementById('registerForm');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearErrors();
      const username = document.getElementById('regUsername').value.trim();
      const email = document.getElementById('regEmail').value.trim();
      const password = document.getElementById('regPassword').value;
      const confirm = document.getElementById('regConfirm').value;
      let valid = true;

      if (!username || username.length < 3) { showFieldError('usernameError', 'Username must be at least 3 characters'); valid = false; }
      if (!email || !/\S+@\S+\.\S+/.test(email)) { showFieldError('emailError', 'Enter a valid email'); valid = false; }
      if (!password || password.length < 6) { showFieldError('passError', 'Password must be at least 6 characters'); valid = false; }
      if (password !== confirm) { showFieldError('confirmError', 'Passwords do not match'); valid = false; }
      if (!valid) return;

      const btn = document.getElementById('registerBtn');
      const spinner = document.getElementById('registerSpinner');
      btn.disabled = true;
      spinner && spinner.classList.remove('hidden');

      try {
        const data = await Api.register(username, email, password);
        Api.setToken(data.token);
        setCurrentUser(data.user);
        showToast('Account created! Welcome to TaskFlow <i class="fas fa-rocket"></i>', 'success');
        setTimeout(() => { window.location.href = getPagePath('dashboard.html'); }, 400);
      } catch (err) {
        const errEl = document.getElementById('registerError');
        if (errEl) { errEl.textContent = err.message; errEl.classList.add('show'); }
        showToast(err.message, 'error');
      } finally {
        btn.disabled = false;
        spinner && spinner.classList.add('hidden');
      }
    });
  }

  function showFieldError(id, msg) {
    const el = document.getElementById(id);
    if (el) { el.textContent = msg; el.classList.add('show'); }
  }
  function clearErrors() {
    document.querySelectorAll('.form-error').forEach(el => { el.textContent = ''; el.classList.remove('show'); });
  }
})();
