// Hubstrom Authentication System
// Login real via Firebase Authentication (email + senha).
// O acesso a dados e paginas e sempre validado contra o Firebase (Realtime Database Rules
// + auth.uid), nunca apenas contra o cache local — o localStorage serve so para a UI.

(function() {
    'use strict';

    const SESSION_KEY = 'hubstrom_auth_session';
    const SESSION_DURATION = 8 * 60 * 60 * 1000; // 8 horas (so para expirar o cache de UI)

    // Detectar pagina atual
    function getCurrentPageFile() {
        const path = window.location.pathname;
        const parts = path.split('/');
        const page = parts[parts.length - 1] || 'index.html';
        return page === '' ? 'index.html' : page;
    }

    const currentPage = getCurrentPageFile();
    const isLoginPage = currentPage === 'login.html' ||
                        window.location.pathname.endsWith('/login') ||
                        document.getElementById('loginForm') !== null;

    function onFirebaseReady(callback) {
        if (typeof isFirebaseReady === 'function' && isFirebaseReady()) {
            callback();
        } else {
            window.addEventListener('firebaseReady', callback, { once: true });
        }
    }

    // Cache local (so para desenhar a UI rapido). Nunca e a fonte de verdade do acesso.
    function readSessionCache() {
        const raw = localStorage.getItem(SESSION_KEY);
        if (!raw) return null;
        try {
            const sessionData = JSON.parse(raw);
            if (Date.now() > sessionData.expires) {
                localStorage.removeItem(SESSION_KEY);
                return null;
            }
            return sessionData;
        } catch (e) {
            localStorage.removeItem(SESSION_KEY);
            return null;
        }
    }

    function writeSessionCache(uid, profile) {
        const sessionData = {
            authenticated: true,
            userId: uid,
            displayName: profile.displayName || 'Usuario',
            role: profile.role || 'collaborator',
            allowedPages: profile.allowedPages || [],
            created: Date.now(),
            expires: Date.now() + SESSION_DURATION
        };
        localStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
        return sessionData;
    }

    // Expor para uso no admin.js / audit log (cache local, apenas leitura de UI)
    window.hubstromGetUser = readSessionCache;

    function hasPageAccess(profile, pageFile) {
        if (!profile) return false;
        if (profile.role === 'admin') return true;
        return (profile.allowedPages || []).includes(pageFile);
    }

    function getFirstAllowedPage(profile) {
        if (!profile) return 'login.html';
        if (profile.role === 'admin') return 'index.html';

        const pages = profile.allowedPages || [];
        if (pages.length > 0) {
            if (pages.includes('index.html')) return 'index.html';
            return pages[0];
        }

        return 'login.html';
    }

    // Logout
    function logout() {
        if (typeof window.hubstromLog === 'function') {
            window.hubstromLog('logout', { page: currentPage });
        }

        localStorage.removeItem(SESSION_KEY);

        firebase.auth().signOut().catch(() => {}).then(() => {
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 300);
        });
    }

    window.hubstromLogout = logout;

    // ==============================
    // PAGINA DE LOGIN
    // ==============================
    if (isLoginPage) {
        document.addEventListener('DOMContentLoaded', function() {
            const loginForm = document.getElementById('loginForm');
            const errorMessage = document.getElementById('errorMessage');
            const errorText = document.getElementById('errorText');
            const submitBtn = document.getElementById('submitBtn');
            const togglePassword = document.getElementById('togglePassword');
            const passwordInput = document.getElementById('password');
            const eyeIcon = document.getElementById('eyeIcon');

            // Se ja existir sessao real do Firebase (persistida), pula direto pra area logada
            onFirebaseReady(function() {
                firebase.auth().onAuthStateChanged(async function(user) {
                    if (!user) return;
                    const profile = await getUserProfile(user.uid);
                    if (profile && profile.active !== false) {
                        const session = writeSessionCache(user.uid, profile);
                        window.location.href = getFirstAllowedPage(session);
                    }
                });
            });

            // Toggle password visibility
            if (togglePassword && passwordInput) {
                togglePassword.addEventListener('click', function() {
                    const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
                    passwordInput.setAttribute('type', type);

                    if (type === 'text') {
                        eyeIcon.innerHTML = `
                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                            <line x1="1" y1="1" x2="23" y2="23"/>
                        `;
                    } else {
                        eyeIcon.innerHTML = `
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                            <circle cx="12" cy="12" r="3"/>
                        `;
                    }
                });
            }

            // Form submit handler
            if (loginForm) {
                loginForm.addEventListener('submit', function(e) {
                    e.preventDefault();

                    const email = document.getElementById('username').value.trim();
                    const password = document.getElementById('password').value;

                    errorMessage.classList.remove('show');
                    submitBtn.classList.add('loading');
                    submitBtn.disabled = true;

                    setTimeout(async function() {
                        try {
                            const cred = await firebase.auth().signInWithEmailAndPassword(email, password);
                            const profile = await getUserProfile(cred.user.uid);

                            if (!profile || profile.active === false) {
                                await firebase.auth().signOut();
                                throw new Error('Conta desativada. Contate o administrador.');
                            }

                            const session = writeSessionCache(cred.user.uid, profile);

                            if (typeof updateLastLogin === 'function') {
                                updateLastLogin(cred.user.uid);
                            }
                            if (typeof logAuditEvent === 'function') {
                                logAuditEvent('login', { page: 'login.html' });
                            }

                            submitBtn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
                            submitBtn.querySelector('.btn-text').textContent = 'Sucesso!';

                            setTimeout(function() {
                                window.location.href = getFirstAllowedPage(session);
                            }, 500);
                        } catch (err) {
                            submitBtn.classList.remove('loading');
                            submitBtn.disabled = false;

                            const code = err && err.code;
                            let message = 'Usuario ou senha incorretos. Tente novamente.';
                            if (code === 'auth/too-many-requests') {
                                message = 'Muitas tentativas. Aguarde alguns minutos e tente novamente.';
                            } else if (err && err.message && err.message.indexOf('desativada') !== -1) {
                                message = err.message;
                            }

                            errorText.textContent = message;
                            errorMessage.classList.add('show');

                            if (typeof logAuditEvent === 'function') {
                                logAuditEvent('login_failed', { page: 'login.html' });
                            }

                            document.getElementById('username').focus();
                        }
                    }, 400);
                });
            }

            // Limpar erro ao digitar
            const inputs = document.querySelectorAll('.form-input');
            inputs.forEach(function(input) {
                input.addEventListener('input', function() {
                    errorMessage.classList.remove('show');
                });
            });

            // Enter key navigation
            const usernameInput = document.getElementById('username');
            if (usernameInput) {
                usernameInput.addEventListener('keypress', function(e) {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        document.getElementById('password').focus();
                    }
                });
            }

            // Esqueci minha senha
            const forgotLink = document.getElementById('forgotPasswordLink');
            if (forgotLink) {
                forgotLink.addEventListener('click', function(e) {
                    e.preventDefault();
                    const email = document.getElementById('username').value.trim();
                    if (!email) {
                        errorText.textContent = 'Digite seu e-mail no campo acima para receber o link de redefinicao.';
                        errorMessage.classList.add('show');
                        return;
                    }
                    onFirebaseReady(function() {
                        firebase.auth().sendPasswordResetEmail(email)
                            .then(function() {
                                errorMessage.classList.remove('show');
                                alert('Se esse e-mail estiver cadastrado, enviamos um link de redefinicao de senha.');
                            })
                            .catch(function() {
                                alert('Se esse e-mail estiver cadastrado, enviamos um link de redefinicao de senha.');
                            });
                    });
                });
            }
        });

        return; // Parar aqui se for pagina de login
    }

    // ==============================
    // PAGINAS PROTEGIDAS
    // ==============================
    onFirebaseReady(function() {
        firebase.auth().onAuthStateChanged(async function(user) {
            if (!user) {
                localStorage.removeItem(SESSION_KEY);
                window.location.href = 'login.html';
                return;
            }

            const profile = await getUserProfile(user.uid);

            if (!profile || profile.active === false) {
                localStorage.removeItem(SESSION_KEY);
                await firebase.auth().signOut();
                window.location.href = 'login.html';
                return;
            }

            const session = writeSessionCache(user.uid, profile);

            if (!hasPageAccess(session, currentPage)) {
                window.location.href = getFirstAllowedPage(session);
                return;
            }

            if (typeof window.hubstromLog === 'function') {
                window.hubstromLog('page_view', { page: currentPage });
            }

            setupUserUI(session);
        });
    });

    // Configurar elementos de UI baseados no perfil do usuario
    function setupUserUI(userSession) {
        if (!userSession) return;

        const userNameEl = document.getElementById('userDisplayName');
        if (userNameEl) {
            userNameEl.textContent = userSession.displayName;
        }

        const adminItems = document.querySelectorAll('.sidebar-admin-only');
        adminItems.forEach(item => {
            if (userSession.role === 'admin') {
                item.classList.remove('sidebar-admin-only');
            }
        });

        if (userSession.role !== 'admin') {
            document.querySelectorAll('.sidebar-menu .sidebar-item a').forEach(link => {
                const href = link.getAttribute('href');
                if (href && href !== '#' && !hasPageAccess(userSession, href)) {
                    link.closest('.sidebar-item').classList.add('disabled');
                    link.setAttribute('href', '#');
                    link.addEventListener('click', function(e) {
                        e.preventDefault();
                    });
                }
            });
        }
    }

})();
