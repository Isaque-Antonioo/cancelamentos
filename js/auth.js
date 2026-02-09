// Hubstrom Authentication System
// Sistema multi-usuario com perfis e permissoes

(function() {
    'use strict';

    const SESSION_KEY = 'hubstrom_auth_session';
    const SESSION_DURATION = 8 * 60 * 60 * 1000; // 8 horas

    // Funcao para gerar hash SHA-256
    async function sha256(message) {
        const msgBuffer = new TextEncoder().encode(message);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        return hashHex;
    }

    // Expor sha256 globalmente para uso no admin.js
    window.hubstromSha256 = sha256;

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

    const isAdminPage = currentPage === 'admin.html';

    // Verificar sessao
    function isAuthenticated() {
        const session = localStorage.getItem(SESSION_KEY);
        if (!session) return false;

        try {
            const sessionData = JSON.parse(session);
            const now = Date.now();

            // Verificar expiracao
            if (now > sessionData.expires) {
                localStorage.removeItem(SESSION_KEY);
                return false;
            }

            // Verificar se tem userId (sessao nova)
            if (!sessionData.userId) {
                localStorage.removeItem(SESSION_KEY);
                return false;
            }

            return true;
        } catch (e) {
            localStorage.removeItem(SESSION_KEY);
            return false;
        }
    }

    // Obter usuario atual da sessao
    function getCurrentUser() {
        const session = localStorage.getItem(SESSION_KEY);
        if (!session) return null;

        try {
            const sessionData = JSON.parse(session);
            const now = Date.now();

            if (now > sessionData.expires || !sessionData.userId) {
                return null;
            }

            return sessionData;
        } catch (e) {
            return null;
        }
    }

    // Expor getCurrentUser globalmente
    window.hubstromGetUser = getCurrentUser;

    // Criar sessao com dados do usuario
    function createSession(userObj) {
        const sessionData = {
            authenticated: true,
            userId: userObj.id,
            displayName: userObj.displayName || 'Usuario',
            role: userObj.role || 'collaborator',
            allowedPages: userObj.allowedPages || [],
            created: Date.now(),
            expires: Date.now() + SESSION_DURATION
        };
        localStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
        return sessionData;
    }

    // Verificar acesso a pagina
    function hasPageAccess(userSession, pageFile) {
        if (!userSession) return false;

        // Admin tem acesso total
        if (userSession.role === 'admin') return true;

        // Colaborador verifica allowedPages
        return (userSession.allowedPages || []).includes(pageFile);
    }

    // Obter primeira pagina permitida para redirect
    function getFirstAllowedPage(userSession) {
        if (!userSession) return 'login.html';
        if (userSession.role === 'admin') return 'index.html';

        const pages = userSession.allowedPages || [];
        if (pages.length > 0) {
            // Priorizar index.html se estiver na lista
            if (pages.includes('index.html')) return 'index.html';
            return pages[0];
        }

        return 'login.html';
    }

    // Logout
    function logout() {
        // Registrar no audit log antes de sair
        if (typeof window.hubstromLog === 'function') {
            window.hubstromLog('logout', { page: currentPage });
        }

        localStorage.removeItem(SESSION_KEY);

        // Delay para garantir que o audit log seja salvo
        setTimeout(() => {
            window.location.href = 'login.html';
        }, 300);
    }

    // Expor funcoes globalmente
    window.hubstromLogout = logout;

    // Validar credenciais contra Firebase
    async function validateCredentials(username, password) {
        const userHash = await sha256(username);
        const passHash = await sha256(password);

        // Aguardar Firebase estar pronto
        if (typeof findUserByUsernameHash === 'function') {
            const user = await findUserByUsernameHash(userHash);

            if (user && user.password_hash === passHash) {
                if (user.active === false) {
                    return { success: false, error: 'Conta desativada. Contate o administrador.' };
                }
                return { success: true, user: user };
            }

            return { success: false, error: 'Usuario ou senha incorretos. Tente novamente.' };
        }

        // Fallback: Firebase nao carregou ainda
        return { success: false, error: 'Sistema carregando. Tente novamente em instantes.' };
    }

    // ==============================
    // LOGICA DE REDIRECIONAMENTO
    // ==============================

    // Se estiver na pagina de login
    if (isLoginPage) {
        if (isAuthenticated()) {
            const user = getCurrentUser();
            window.location.href = getFirstAllowedPage(user);
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

                    errorMessage.classList.remove('show');
                    submitBtn.classList.add('loading');
                    submitBtn.disabled = true;

                    // Validar com delay para UX
                    setTimeout(async function() {
                        const result = await validateCredentials(username, password);

                        if (result.success) {
                            const session = createSession(result.user);

                            // Atualizar lastLogin no Firebase
                            if (typeof updateLastLogin === 'function') {
                                updateLastLogin(result.user.id);
                            }

                            // Registrar login no audit log
                            if (typeof logAuditEvent === 'function') {
                                logAuditEvent('login', { page: 'login.html' });
                            }

                            // Animacao de sucesso
                            submitBtn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
                            submitBtn.querySelector('.btn-text').textContent = 'Sucesso!';

                            setTimeout(function() {
                                window.location.href = getFirstAllowedPage(session);
                            }, 500);
                        } else {
                            submitBtn.classList.remove('loading');
                            submitBtn.disabled = false;

                            errorText.textContent = result.error;
                            errorMessage.classList.add('show');

                            // Registrar tentativa falha
                            if (typeof logAuditEvent === 'function') {
                                logAuditEvent('login_failed', { page: 'login.html' });
                            }

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
            const usernameInput = document.getElementById('username');
            if (usernameInput) {
                usernameInput.addEventListener('keypress', function(e) {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        document.getElementById('password').focus();
                    }
                });
            }
        });

        return; // Parar aqui se for pagina de login
    }

    // ==============================
    // PAGINAS PROTEGIDAS
    // ==============================

    // Se nao autenticado, redirecionar para login
    if (!isAuthenticated()) {
        window.location.href = 'login.html';
        return;
    }

    // Verificar permissao de acesso a pagina atual
    const user = getCurrentUser();

    if (user && !hasPageAccess(user, currentPage)) {
        // Sem acesso a esta pagina, redirecionar
        window.location.href = getFirstAllowedPage(user);
        return;
    }

    // Registrar page_view no audit
    document.addEventListener('DOMContentLoaded', function() {
        if (typeof window.hubstromLog === 'function') {
            window.hubstromLog('page_view', { page: currentPage });
        }

        // Configurar UI baseada no perfil
        setupUserUI(user);
    });

    // Configurar elementos de UI baseados no perfil do usuario
    function setupUserUI(userSession) {
        if (!userSession) return;

        // Mostrar nome do usuario no header
        const userNameEl = document.getElementById('userDisplayName');
        if (userNameEl) {
            userNameEl.textContent = userSession.displayName;
        }

        // Mostrar/ocultar link admin no sidebar
        const adminItems = document.querySelectorAll('.sidebar-admin-only');
        adminItems.forEach(item => {
            if (userSession.role === 'admin') {
                item.classList.remove('sidebar-admin-only');
            }
        });

        // Desabilitar links de sidebar para paginas sem acesso
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
