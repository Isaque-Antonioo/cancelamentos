// Hubstrom - Admin Panel
// Gerenciamento de usuarios e auditoria

(function() {
    'use strict';

    let allUsers = [];
    let auditLogs = [];
    let auditOffset = 0;
    const AUDIT_PAGE_SIZE = 50;

    // ==========================================
    // SIDEBAR
    // ==========================================

    window.toggleSidebar = function() {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebarOverlay');
        if (sidebar) sidebar.classList.toggle('active');
        if (overlay) overlay.classList.toggle('active');
    };

    // ==========================================
    // TABS
    // ==========================================

    window.switchTab = function(tab) {
        // Atualizar botoes
        document.querySelectorAll('.admin-tab').forEach(btn => btn.classList.remove('active'));
        event.currentTarget.classList.add('active');

        // Atualizar secoes
        document.querySelectorAll('.admin-section').forEach(sec => sec.classList.remove('active'));

        if (tab === 'users') {
            document.getElementById('sectionUsers').classList.add('active');
        } else if (tab === 'audit') {
            document.getElementById('sectionAudit').classList.add('active');
            loadAuditLogs();
        }
    };

    // ==========================================
    // USUARIOS
    // ==========================================

    async function loadUsers() {
        try {
            allUsers = await getAllUsers();
            renderUserTable();
        } catch (error) {
            console.error('Erro ao carregar usuarios:', error);
            document.getElementById('usersTableBody').innerHTML =
                '<tr><td colspan="6" style="text-align:center;padding:40px;color:#ef4444;">Erro ao carregar usuarios</td></tr>';
        }
    }

    function renderUserTable() {
        const tbody = document.getElementById('usersTableBody');

        if (!allUsers || allUsers.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:#64748b;">Nenhum usuario encontrado</td></tr>';
            return;
        }

        const currentUser = window.hubstromGetUser ? window.hubstromGetUser() : null;

        tbody.innerHTML = allUsers.map(user => {
            const roleBadge = user.role === 'admin'
                ? '<span class="role-badge role-admin">Admin</span>'
                : '<span class="role-badge role-collaborator">Colaborador</span>';

            const statusBadge = user.active !== false
                ? '<span class="status-badge status-active">Ativo</span>'
                : '<span class="status-badge status-inactive">Inativo</span>';

            const pageLabels = {
                'index.html': 'Cancelamentos',
                'comercial.html': 'Comercial',
                'suporte.html': 'Suporte',
                'relacionamento.html': 'Relacionamento'
            };

            let pagesHtml = '';
            if (user.role === 'admin') {
                pagesHtml = '<span class="page-badge">Todos</span>';
            } else if (user.allowedPages && user.allowedPages.length > 0) {
                pagesHtml = user.allowedPages
                    .filter(p => p !== 'admin.html')
                    .map(p => `<span class="page-badge">${pageLabels[p] || p}</span>`)
                    .join(' ');
            } else {
                pagesHtml = '<span style="color:#94a3b8;font-size:12px;">Nenhum</span>';
            }

            const lastLogin = user.lastLogin
                ? formatDate(user.lastLogin)
                : '<span style="color:#94a3b8;font-size:12px;">Nunca</span>';

            const isSelf = currentUser && currentUser.userId === user.id;

            const actions = `
                <button class="btn-action btn-edit" onclick="openUserModal('${user.id}')" title="Editar">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                </button>
                ${!isSelf ? `
                <button class="btn-action ${user.active !== false ? 'btn-deactivate' : 'btn-activate'}"
                    onclick="toggleUserStatus('${user.id}', ${user.active !== false})"
                    title="${user.active !== false ? 'Desativar' : 'Ativar'}">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        ${user.active !== false
                            ? '<circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>'
                            : '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>'}
                    </svg>
                </button>` : ''}
            `;

            return `<tr${user.active === false ? ' class="user-inactive"' : ''}>
                <td><strong>${escapeHTML(user.displayName || 'Sem nome')}</strong></td>
                <td>${roleBadge}</td>
                <td>${pagesHtml}</td>
                <td>${statusBadge}</td>
                <td>${lastLogin}</td>
                <td class="actions-cell">${actions}</td>
            </tr>`;
        }).join('');
    }

    // ==========================================
    // MODAL DE USUARIO
    // ==========================================

    window.openUserModal = function(userId) {
        const modal = document.getElementById('userModal');
        const title = document.getElementById('modalTitle');
        const editId = document.getElementById('editUserId');
        const displayNameInput = document.getElementById('userDisplayNameInput');
        const usernameInput = document.getElementById('userUsername');
        const passwordInput = document.getElementById('userPassword');
        const passwordLabel = document.getElementById('passwordLabel');
        const roleSelect = document.getElementById('userRole');

        // Reset
        displayNameInput.value = '';
        usernameInput.value = '';
        passwordInput.value = '';
        roleSelect.value = 'collaborator';

        // Reset checkboxes
        document.querySelectorAll('#pagesGroup input[type="checkbox"]').forEach(cb => {
            cb.checked = cb.value === 'index.html';
        });

        if (userId) {
            // Editar usuario existente
            const user = allUsers.find(u => u.id === userId);
            if (!user) return;

            title.textContent = 'Editar Usuario';
            editId.value = userId;
            displayNameInput.value = user.displayName || '';
            usernameInput.value = ''; // Nao mostramos o username (hash)
            usernameInput.placeholder = 'Deixe em branco para manter';
            passwordLabel.textContent = 'Nova Senha (deixe em branco para manter)';
            passwordInput.placeholder = 'Deixe em branco para manter';
            roleSelect.value = user.role || 'collaborator';

            // Marcar pages
            document.querySelectorAll('#pagesGroup input[type="checkbox"]').forEach(cb => {
                cb.checked = (user.allowedPages || []).includes(cb.value);
            });
        } else {
            // Novo usuario
            title.textContent = 'Novo Usuario';
            editId.value = '';
            usernameInput.placeholder = 'Ex: maria';
            passwordLabel.textContent = 'Senha';
            passwordInput.placeholder = 'Digite a senha';
        }

        togglePagesVisibility();
        modal.classList.add('active');
    };

    window.closeUserModal = function() {
        document.getElementById('userModal').classList.remove('active');
    };

    window.togglePagesVisibility = function() {
        const role = document.getElementById('userRole').value;
        const pagesGroup = document.getElementById('pagesGroup');
        pagesGroup.style.display = role === 'admin' ? 'none' : '';
    };

    window.handleSaveUser = async function() {
        const editId = document.getElementById('editUserId').value;
        const displayName = document.getElementById('userDisplayNameInput').value.trim();
        const username = document.getElementById('userUsername').value.trim();
        const password = document.getElementById('userPassword').value;
        const role = document.getElementById('userRole').value;

        // Coletar paginas selecionadas
        const allowedPages = [];
        document.querySelectorAll('#pagesGroup input[type="checkbox"]:checked').forEach(cb => {
            allowedPages.push(cb.value);
        });

        // Validacoes
        if (!displayName) {
            alert('Informe o nome de exibicao.');
            return;
        }

        if (!editId && !username) {
            alert('Informe o nome de usuario.');
            return;
        }

        if (!editId && !password) {
            alert('Informe a senha.');
            return;
        }

        const btnSave = document.getElementById('btnSaveUser');
        btnSave.disabled = true;
        btnSave.textContent = 'Salvando...';

        try {
            if (editId) {
                // Atualizar usuario
                const updates = {
                    displayName: displayName,
                    role: role,
                    allowedPages: role === 'admin'
                        ? ['index.html', 'comercial.html', 'suporte.html', 'admin.html']
                        : allowedPages
                };

                // Se informou novo username
                if (username) {
                    updates.username_hash = await window.hubstromSha256(username);
                }

                // Se informou nova senha
                if (password) {
                    updates.password_hash = await window.hubstromSha256(password);
                }

                const success = await updateUser(editId, updates);
                if (success) {
                    if (typeof logAuditEvent === 'function') {
                        logAuditEvent('user_updated', {
                            targetUserId: editId,
                            displayName: displayName,
                            changes: Object.keys(updates).join(', ')
                        });
                    }
                    closeUserModal();
                    await loadUsers();
                } else {
                    alert('Erro ao atualizar usuario.');
                }
            } else {
                // Criar usuario
                const usernameHash = await window.hubstromSha256(username);
                const passwordHash = await window.hubstromSha256(password);

                // Verificar se username ja existe
                const existing = await findUserByUsernameHash(usernameHash);
                if (existing) {
                    alert('Ja existe um usuario com esse nome de usuario.');
                    btnSave.disabled = false;
                    btnSave.textContent = 'Salvar';
                    return;
                }

                const currentUser = window.hubstromGetUser ? window.hubstromGetUser() : null;

                const userData = {
                    username_hash: usernameHash,
                    password_hash: passwordHash,
                    displayName: displayName,
                    role: role,
                    allowedPages: role === 'admin'
                        ? ['index.html', 'comercial.html', 'suporte.html', 'admin.html']
                        : allowedPages,
                    active: true,
                    createdBy: currentUser ? currentUser.userId : 'unknown'
                };

                const newId = await createUser(userData);
                if (newId) {
                    if (typeof logAuditEvent === 'function') {
                        logAuditEvent('user_created', {
                            targetUserId: newId,
                            displayName: displayName,
                            role: role
                        });
                    }
                    closeUserModal();
                    await loadUsers();
                } else {
                    alert('Erro ao criar usuario.');
                }
            }
        } catch (error) {
            console.error('Erro ao salvar usuario:', error);
            alert('Erro ao salvar usuario.');
        }

        btnSave.disabled = false;
        btnSave.textContent = 'Salvar';
    };

    window.toggleUserStatus = async function(userId, isActive) {
        const action = isActive ? 'desativar' : 'ativar';
        if (!confirm(`Deseja ${action} este usuario?`)) return;

        try {
            if (isActive) {
                await deactivateUser(userId);
                if (typeof logAuditEvent === 'function') {
                    logAuditEvent('user_deactivated', { targetUserId: userId });
                }
            } else {
                await updateUser(userId, { active: true });
                if (typeof logAuditEvent === 'function') {
                    logAuditEvent('user_updated', { targetUserId: userId, changes: 'reativado' });
                }
            }
            await loadUsers();
        } catch (error) {
            console.error('Erro ao alterar status:', error);
            alert('Erro ao alterar status do usuario.');
        }
    };

    // ==========================================
    // AUDIT LOG
    // ==========================================

    window.loadAuditLogs = async function() {
        auditOffset = 0;

        const filterUser = document.getElementById('auditFilterUser').value;
        const filterAction = document.getElementById('auditFilterAction').value;

        try {
            const filters = { limit: 500 };
            if (filterUser) filters.userId = filterUser;
            if (filterAction) filters.action = filterAction;

            auditLogs = await getAuditLogs(filters);
            renderAuditTable();
        } catch (error) {
            console.error('Erro ao carregar audit logs:', error);
            document.getElementById('auditTableBody').innerHTML =
                '<tr><td colspan="4" style="text-align:center;padding:40px;color:#ef4444;">Erro ao carregar historico</td></tr>';
        }
    };

    function renderAuditTable() {
        const tbody = document.getElementById('auditTableBody');
        const btnMore = document.getElementById('btnLoadMore');

        if (!auditLogs || auditLogs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:40px;color:#64748b;">Nenhum registro encontrado</td></tr>';
            btnMore.style.display = 'none';
            return;
        }

        const pageEnd = auditOffset + AUDIT_PAGE_SIZE;
        const visibleLogs = auditLogs.slice(0, pageEnd);

        tbody.innerHTML = visibleLogs.map(log => {
            const date = formatDate(log.isoDate || new Date(log.timestamp).toISOString());
            const actionBadge = getActionBadge(log.action);
            const details = formatDetails(log.action, log.details);

            return `<tr>
                <td>${date}</td>
                <td>${escapeHTML(log.displayName || 'Desconhecido')}</td>
                <td>${actionBadge}</td>
                <td>${details}</td>
            </tr>`;
        }).join('');

        btnMore.style.display = pageEnd < auditLogs.length ? '' : 'none';
    }

    window.loadMoreAuditLogs = function() {
        auditOffset += AUDIT_PAGE_SIZE;
        renderAuditTable();
    };

    async function populateAuditUserFilter() {
        const select = document.getElementById('auditFilterUser');
        try {
            const users = await getAllUsers();
            users.forEach(user => {
                const opt = document.createElement('option');
                opt.value = user.id;
                opt.textContent = user.displayName || 'Sem nome';
                select.appendChild(opt);
            });
        } catch (error) {
            console.error('Erro ao popular filtro de usuarios:', error);
        }
    }

    // ==========================================
    // HELPERS
    // ==========================================

    function escapeHTML(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function formatDate(isoString) {
        try {
            const d = new Date(isoString);
            const day = String(d.getDate()).padStart(2, '0');
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const year = d.getFullYear();
            const hours = String(d.getHours()).padStart(2, '0');
            const minutes = String(d.getMinutes()).padStart(2, '0');
            return `${day}/${month}/${year} ${hours}:${minutes}`;
        } catch (e) {
            return isoString || '-';
        }
    }

    function getActionBadge(action) {
        const labels = {
            'login': 'Login',
            'login_failed': 'Login Falho',
            'logout': 'Logout',
            'page_view': 'Visualizacao',
            'filter_change': 'Filtro Alterado',
            'data_sync': 'Sincronizacao',
            'data_save': 'Dados Salvos',
            'data_delete': 'Dados Deletados',
            'user_created': 'Usuario Criado',
            'user_updated': 'Usuario Editado',
            'user_deactivated': 'Usuario Desativado'
        };

        const label = labels[action] || action;
        return `<span class="audit-action-badge action-${action}">${escapeHTML(label)}</span>`;
    }

    function formatDetails(action, details) {
        if (!details) return '-';

        const parts = [];

        if (details.page) {
            const pageLabels = {
                'index.html': 'Cancelamentos',
                'comercial.html': 'Comercial',
                'suporte.html': 'Suporte',
                'relacionamento.html': 'Relacionamento',
                'admin.html': 'Admin',
                'login.html': 'Login'
            };
            parts.push(pageLabels[details.page] || details.page);
        }

        if (details.displayName) parts.push(details.displayName);
        if (details.role) parts.push(`Perfil: ${details.role === 'admin' ? 'Admin' : 'Colaborador'}`);
        if (details.changes) parts.push(`Alteracoes: ${details.changes}`);
        if (details.filter) parts.push(`Filtro: ${details.filter}`);
        if (details.value) parts.push(`Valor: ${details.value}`);
        if (details.source) parts.push(`Fonte: ${details.source}`);
        if (details.month) parts.push(`Mes: ${details.month}`);

        return parts.length > 0 ? escapeHTML(parts.join(' | ')) : '-';
    }

    // ==========================================
    // INICIALIZACAO
    // ==========================================

    function init() {
        // Aguardar Firebase estar pronto
        if (typeof isFirebaseReady === 'function' && isFirebaseReady()) {
            loadUsers();
            populateAuditUserFilter();
        } else {
            window.addEventListener('firebaseReady', function() {
                loadUsers();
                populateAuditUserFilter();
            });
        }
    }

    document.addEventListener('DOMContentLoaded', init);

})();
