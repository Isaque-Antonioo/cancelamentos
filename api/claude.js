// Proxy server-side para a API da Anthropic.
// A chave real (ANTHROPIC_API_KEY) fica só aqui, como variável de ambiente do Vercel —
// nunca é enviada ao navegador. Só aceita chamadas de quem tem uma sessão válida do
// Firebase Auth (o ID token é verificado contra o próprio Firebase antes de repassar).

const FIREBASE_WEB_API_KEY = 'AIzaSyDpDpeaz2py6ZQEPLR3p2Bd-DCcamRcV_A';
const MAX_TOKENS_LIMIT = 4096;

async function verifyFirebaseIdToken(idToken) {
    const resp = await fetch(
        'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + FIREBASE_WEB_API_KEY,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken })
        }
    );
    if (!resp.ok) return false;
    const data = await resp.json();
    return !!(data.users && data.users.length > 0);
}

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    const authHeader = req.headers.authorization || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

    if (!idToken || !(await verifyFirebaseIdToken(idToken))) {
        res.status(401).json({ error: 'Sessão inválida ou expirada. Faça login novamente.' });
        return;
    }

    const { model, max_tokens, messages } = req.body || {};
    if (!model || !messages) {
        res.status(400).json({ error: 'Parâmetros inválidos.' });
        return;
    }

    if (!process.env.ANTHROPIC_API_KEY) {
        res.status(500).json({ error: 'ANTHROPIC_API_KEY não configurada no servidor.' });
        return;
    }

    try {
        const claudeResp = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': process.env.ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model,
                max_tokens: Math.min(max_tokens || 1024, MAX_TOKENS_LIMIT),
                messages
            })
        });

        const data = await claudeResp.json();
        res.status(claudeResp.status).json(data);
    } catch (error) {
        res.status(502).json({ error: 'Erro ao chamar a API da Anthropic.' });
    }
};
