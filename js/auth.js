// Hubstrom Authentication System
// Sistema de autenticacao seguro

(function() {
    'use strict';

    // Hashes SHA-256 pre-calculados (impossivel reverter para texto original)
    const _0x3d2f = [0x38,0x63,0x36,0x39,0x37,0x36,0x65,0x35,0x62,0x35,
                     0x34,0x31,0x30,0x34,0x31,0x35,0x62,0x64,0x65,0x39,
                     0x30,0x38,0x62,0x64,0x34,0x64,0x65,0x65,0x31,0x35,
                     0x64,0x66,0x62,0x31,0x36,0x37,0x61,0x39,0x63,0x38,
                     0x37,0x33,0x66,0x63,0x34,0x62,0x62,0x38,0x61,0x38,
                     0x31,0x66,0x36,0x66,0x32,0x61,0x62,0x34,0x34,0x38,
                     0x61,0x39,0x31,0x38];
    const _0x4f2a = [0x34,0x65,0x38,0x61,0x39,0x32,0x66,0x30,0x32,0x62,
                     0x39,0x30,0x36,0x62,0x64,0x31,0x65,0x39,0x38,0x66,
                     0x39,0x31,0x32,0x35,0x39,0x62,0x37,0x64,0x36,0x36,
                     0x63,0x63,0x37,0x37,0x65,0x31,0x38,0x63,0x37,0x38,
                     0x33,0x64,0x63,0x38,0x38,0x35,0x36,0x38,0x35,0x32,
                     0x65,0x39,0x36,0x63,0x31,0x62,0x66,0x31,0x38,0x30,
                     0x38,0x61,0x62,0x64];
    const _u = _0x3d2f.map(c => String.fromCharCode(c)).join('');
    const _p = _0x4f2a.map(c => String.fromCharCode(c)).join('');

    const SESSION_KEY = 'hubstrom_auth_session';
    const SESSION_DURATION = 8 * 60 * 60 * 1000;

    // Funcao para gerar hash SHA-256
    async function sha256(message) {
        const msgBuffer = new TextEncoder().encode(message);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        return hashHex;
    }

    // Verificar se esta na pagina de login
    const isLoginPage = window.location.pathname.includes('login.html') ||
                        window.location.pathname.endsWith('/login') ||
                        document.getElementById('loginForm') !== null;

    // Verificar se esta na pagina principal
    const isMainPage = window.location.pathname.includes('index.html') ||
                       window.location.pathname.endsWith('/') ||
                       window.location.pathname.endsWith('/cancelamentos/');

    // Funcao para verificar sessao
    function isAuthenticated() {
        const session = localStorage.getItem(SESSION_KEY);
        if (!session) return false;

        try {
            const sessionData = JSON.parse(session);
            const now = new Date().getTime();

            if (now > sessionData.expires) {
                localStorage.removeItem(SESSION_KEY);
                return false;
            }
            return true;
        } catch (e) {
            localStorage.removeItem(SESSION_KEY);
            return false;
        }
    }

    // Funcao para criar sessao
    function createSession() {
        const sessionData = {
            authenticated: true,
            created: new Date().getTime(),
            expires: new Date().getTime() + SESSION_DURATION
        };
        localStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
    }

    // Funcao para fazer logout
    function logout() {
        localStorage.removeItem(SESSION_KEY);
        window.location.href = 'login.html';
    }

    // Expor funcao de logout globalmente
    window.hubstromLogout = logout;

    // Funcao para validar credenciais (assincrona por causa do hash)
    async function validateCredentials(username, password) {
        const userHash = await sha256(username);
        const passHash = await sha256(password);
        return userHash === _u && passHash === _p;
    }

    // Se estiver na pagina de login
    if (isLoginPage) {
        // Se ja estiver autenticado, redirecionar para o dashboard
        if (isAuthenticated()) {
            window.location.href = 'index.html';
            return;
        }

        // Configurar formulario de login
        document.addEventListener('DOMContentLoaded', function() {
            const loginForm = document.getElementById('loginForm');
            const errorMessage = document.getElementById('errorMessage');
            const errorText = document.getElementById('errorText');
            const submitBtn = document.getElementById('submitBtn');
            const togglePassword = document.getElementById('togglePassword');
            const passwordInput = document.getElementById('password');
            const eyeIcon = document.getElementById('eyeIcon');

            // Toggle password visibility
            if (togglePassword && passwordInput) {
                togglePassword.addEventListener('click', function() {
                    const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
                    passwordInput.setAttribute('type', type);

                    // Alterar icone
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
                loginForm.addEventListener('submit', async function(e) {
                    e.preventDefault();

                    const username = document.getElementById('username').value.trim();
                    const password = document.getElementById('password').value;

                    // Esconder mensagem de erro
                    errorMessage.classList.remove('show');

                    // Mostrar loading
                    submitBtn.classList.add('loading');
                    submitBtn.disabled = true;

                    // Validar com delay para UX
                    setTimeout(async function() {
                        const isValid = await validateCredentials(username, password);

                        if (isValid) {
                            // Login bem-sucedido
                            createSession();

                            // Animacao de sucesso
                            submitBtn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
                            submitBtn.querySelector('.btn-text').textContent = 'Sucesso!';

                            setTimeout(function() {
                                window.location.href = 'index.html';
                            }, 500);
                        } else {
                            // Login falhou
                            submitBtn.classList.remove('loading');
                            submitBtn.disabled = false;

                            errorText.textContent = 'Usuario ou senha incorretos. Tente novamente.';
                            errorMessage.classList.add('show');

                            // Focar no campo de usuario
                            document.getElementById('username').focus();
                        }
                    }, 800);
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
            document.getElementById('username').addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    document.getElementById('password').focus();
                }
            });
        });
    }

    // Se estiver na pagina principal (index.html)
    if (isMainPage || (!isLoginPage && !isAuthenticated())) {
        // Se nao estiver autenticado, redirecionar para login
        if (!isAuthenticated()) {
            window.location.href = 'login.html';
        }
    }

})();
