require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;

// Necessário para o express-rate-limit funcionar atrás do proxy reverso do Render
app.set('trust proxy', 1);

// ==========================================
// 1. HARDENING: HELMET, CORS E RATE LIMIT
// ==========================================
app.use(helmet());

const origensPermitidas = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'https://jgabriel-sec.github.io'
];

if (process.env.FRONTEND_URL) {
    origensPermitidas.push(process.env.FRONTEND_URL.replace(/\/$/, ''));
}

app.use(cors({
    origin: function (origin, callback) {
        if (!origin || origin === 'null' || origensPermitidas.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Bloqueado pela política de CORS do CredControl.'));
        }
    }
}));

app.use(express.json({ limit: '10kb' }));

const limitadorGeral = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { erro: 'Muitas requisições deste IP. Tente novamente em 15 minutos.' }
});
app.use('/api/', limitadorGeral);

const limitadorLogin = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { erro: 'Muitas tentativas de autenticação. Aguarde 15 minutos.' }
});

function autenticarToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ erro: 'Acesso negado. Token de autenticação ausente.' });
    }

    jwt.verify(token, JWT_SECRET, (err, usuario) => {
        if (err) {
            return res.status(403).json({ erro: 'Sessão expirada ou token inválido.' });
        }
        req.usuario = usuario;
        next();
    });
}

function exigirAdmin(req, res, next) {
    if (!req.usuario || req.usuario.role !== 'admin') {
        return res.status(403).json({ erro: 'Acesso restrito exclusivamente ao Administrador do sistema.' });
    }
    next();
}

// ==========================================
// 2. DIAGNÓSTICO E AUTENTICAÇÃO (ADMIN + GERENTE)
// ==========================================
app.get('/api/status', (req, res) => {
    res.json({ status: 'online', sistema: 'CredControl API (PostgreSQL)' });
});

app.get('/api/auth/verificar-setup', async (req, res) => {
    try {
        const result = await pool.query('SELECT usuario, role FROM usuarios');
        const temAdmin = result.rows.some(u => u.role === 'admin' || u.usuario === 'admin');
        const temGerente = result.rows.some(u => u.role === 'gerente');

        res.json({
            configurado: temAdmin,
            gerenteConfigurado: temGerente
        });
    } catch (err) {
        res.status(500).json({ erro: 'Erro interno ao consultar banco de dados.' });
    }
});

app.post('/api/auth/setup', limitadorLogin, async (req, res) => {
    const { senha } = req.body;
    if (!senha || senha.length < 6) {
        return res.status(400).json({ erro: 'A senha deve ter no mínimo 6 caracteres.' });
    }

    try {
        const check = await pool.query("SELECT id FROM usuarios WHERE role = 'admin' OR usuario = 'admin' LIMIT 1");
        if (check.rows.length > 0) {
            return res.status(403).json({ erro: 'O administrador já foi configurado.' });
        }

        const senhaHash = await bcrypt.hash(senha, 10);
        const insert = await pool.query(
            "INSERT INTO usuarios (usuario, senha_hash, role) VALUES ($1, $2, 'admin') RETURNING id, usuario, role",
            ['admin', senhaHash]
        );

        const user = insert.rows[0];
        const token = jwt.sign({ id: user.id, usuario: user.usuario, role: user.role }, JWT_SECRET, { expiresIn: '8h' });
        res.status(201).json({
            mensagem: 'Administrador configurado com sucesso!',
            token,
            usuario: { usuario: user.usuario, role: user.role }
        });
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao salvar administrador.' });
    }
});

// Cadastro único do 2º usuário (Gerente)
app.post('/api/auth/setup-gerente', limitadorLogin, async (req, res) => {
    const usuarioLimpo = String(req.body.usuario || '').trim().toLowerCase();
    const senha = String(req.body.senha || '');

    if (!/^[a-z0-9._-]{3,25}$/.test(usuarioLimpo) || usuarioLimpo === 'admin') {
        return res.status(400).json({ erro: 'Escolha um usuário válido (3 a 25 letras/números, diferente de admin).' });
    }
    if (senha.length < 6) {
        return res.status(400).json({ erro: 'A senha do gerente deve ter no mínimo 6 caracteres.' });
    }

    try {
        const checkTotal = await pool.query('SELECT id, usuario, role FROM usuarios');
        const temAdmin = checkTotal.rows.some(u => u.role === 'admin' || u.usuario === 'admin');
        if (!temAdmin) {
            return res.status(400).json({ erro: 'O administrador precisa configurar o sistema antes do gerente.' });
        }

        const temGerente = checkTotal.rows.some(u => u.role === 'gerente');
        if (temGerente || checkTotal.rows.length >= 2) {
            return res.status(403).json({ erro: 'O limite máximo de 2 usuários (Administrador e Gerente) já foi atingido.' });
        }

        const senhaHash = await bcrypt.hash(senha, 10);
        const insert = await pool.query(
            "INSERT INTO usuarios (usuario, senha_hash, role) VALUES ($1, $2, 'gerente') RETURNING id, usuario, role",
            [usuarioLimpo, senhaHash]
        );

        const user = insert.rows[0];
        const token = jwt.sign({ id: user.id, usuario: user.usuario, role: user.role }, JWT_SECRET, { expiresIn: '8h' });
        res.status(201).json({
            mensagem: 'Conta de Gerente criada com sucesso!',
            token,
            usuario: { usuario: user.usuario, role: user.role }
        });
    } catch (err) {
        if (err.code === '23505') {
            return res.status(409).json({ erro: 'Este nome de usuário já está em uso.' });
        }
        res.status(500).json({ erro: 'Erro ao cadastrar gerente.' });
    }
});

app.post('/api/auth/login', limitadorLogin, async (req, res) => {
    const usuarioLimpo = String(req.body.usuario || 'admin').trim().toLowerCase();
    const senha = String(req.body.senha || '');

    if (!usuarioLimpo || !senha) {
        return res.status(400).json({ erro: 'Usuário e senha são obrigatórios.' });
    }

    try {
        const result = await pool.query('SELECT id, usuario, senha_hash, role FROM usuarios WHERE usuario = $1', [usuarioLimpo]);
        const user = result.rows[0];
        if (!user) return res.status(401).json({ erro: 'Usuário ou senha inválidos.' });

        const senhaValida = await bcrypt.compare(senha, user.senha_hash);
        if (!senhaValida) return res.status(401).json({ erro: 'Usuário ou senha inválidos.' });

        const roleFinal = user.role || (user.usuario === 'admin' ? 'admin' : 'gerente');
        const token = jwt.sign({ id: user.id, usuario: user.usuario, role: roleFinal }, JWT_SECRET, { expiresIn: '8h' });

        res.json({
            mensagem: 'Login realizado com sucesso!',
            token,
            usuario: { usuario: user.usuario, role: roleFinal }
        });
    } catch (err) {
        res.status(500).json({ erro: 'Erro interno no servidor.' });
    }
});

// ==========================================
// 2.1 GESTÃO DO GERENTE (EXCLUSIVO ADMINISTRADOR)
// ==========================================
app.get('/api/admin/gerente', autenticarToken, exigirAdmin, async (req, res) => {
    try {
        const result = await pool.query("SELECT id, usuario, role FROM usuarios WHERE role = 'gerente' LIMIT 1");
        if (result.rows.length === 0) {
            return res.json({ cadastrado: false });
        }
        res.json({ cadastrado: true, gerente: result.rows[0] });
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao consultar dados do gerente.' });
    }
});

app.patch('/api/admin/gerente/senha', autenticarToken, exigirAdmin, async (req, res) => {
    const novaSenha = String(req.body.novaSenha || '');
    if (novaSenha.length < 6) {
        return res.status(400).json({ erro: 'A nova senha do gerente deve ter no mínimo 6 caracteres.' });
    }

    try {
        const result = await pool.query("SELECT id, usuario FROM usuarios WHERE role = 'gerente' LIMIT 1");
        if (result.rows.length === 0) {
            return res.status(404).json({ erro: 'O gerente ainda não criou o acesso dele no sistema.' });
        }

        const senhaHash = await bcrypt.hash(novaSenha, 10);
        await pool.query('UPDATE usuarios SET senha_hash = $1 WHERE id = $2', [senhaHash, result.rows[0].id]);

        res.json({ mensagem: `Senha do gerente (${result.rows[0].usuario}) redefinida com sucesso!` });
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao redefinir a senha do gerente.' });
    }
});

// ==========================================
// 3. ROTAS DE CLIENTES (PROTEGIDAS POR JWT)
// ==========================================
app.get('/api/clientes', autenticarToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM clientes ORDER BY id DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao buscar clientes.' });
    }
});

app.post('/api/clientes', autenticarToken, async (req, res) => {
    const { nome, cpf, whatsapp, cep, rua, numero, complemento, bairro, cidade, uf } = req.body;

    const nomeLimpo = String(nome || '').trim();
    const cpfLimpo = String(cpf || '').replace(/\D/g, '');
    let whatsappLimpo = String(whatsapp || '').replace(/\D/g, '');

    const cepLimpo = String(cep || '').replace(/\D/g, '').slice(0, 8);
    const ruaLimpa = String(rua || '').trim().slice(0, 120);
    const numeroLimpo = String(numero || '').trim().slice(0, 20);
    const complementoLimpo = String(complemento || '').trim().slice(0, 80);
    const bairroLimpo = String(bairro || '').trim().slice(0, 80);
    const cidadeLimpa = String(cidade || '').trim().slice(0, 80);
    const ufLimpa = String(uf || '').trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);

    if (whatsappLimpo.startsWith('55') && (whatsappLimpo.length === 12 || whatsappLimpo.length === 13)) {
        whatsappLimpo = whatsappLimpo.slice(2);
    }

    if (!/^[A-Za-zÀ-ÖØ-öø-ÿ\s]{3,}$/.test(nomeLimpo)) {
        return res.status(400).json({ erro: 'Nome inválido no servidor.' });
    }
    if (cpfLimpo.length !== 11 || /^(\d)\1+$/.test(cpfLimpo)) {
        return res.status(400).json({ erro: 'CPF inválido. Deve conter exatamente 11 dígitos válidos.' });
    }
    if (whatsappLimpo.length < 10 || whatsappLimpo.length > 11) {
        return res.status(400).json({ erro: 'WhatsApp inválido. Use o padrão +55(DDD)900000000.' });
    }
    if (cepLimpo.length !== 8 || ruaLimpa.length < 2 || numeroLimpo.length < 1 || bairroLimpo.length < 2 || cidadeLimpa.length < 2 || ufLimpa.length !== 2) {
        return res.status(400).json({ erro: 'Preencha todos os campos obrigatórios do endereço (CEP, Rua, Número, Bairro, Cidade e UF).' });
    }

    try {
        const result = await pool.query(
            `INSERT INTO clientes (nome, cpf, whatsapp, cep, rua, numero, complemento, bairro, cidade, uf)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             RETURNING *`,
            [nomeLimpo, cpfLimpo, whatsappLimpo, cepLimpo, ruaLimpa, numeroLimpo, complementoLimpo, bairroLimpo, cidadeLimpa, ufLimpa]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        if (err.code === '23505') {
            return res.status(409).json({ erro: 'Este CPF já está cadastrado no banco de dados!' });
        }
        res.status(500).json({ erro: 'Erro ao cadastrar cliente.' });
    }
});

app.delete('/api/clientes/:id', autenticarToken, async (req, res) => {
    const id = parseInt(req.params.id);
    try {
        await pool.query('DELETE FROM clientes WHERE id = $1', [id]);
        res.json({ mensagem: 'Cliente removido com sucesso.' });
    } catch (err) {
        res.status(400).json({ erro: 'Não é possível excluir cliente com contratos vinculados.' });
    }
});

// ==========================================
// 4. ROTAS DE PLANOS E TAXAS (PROTEGIDAS)
// ==========================================
app.get('/api/planos', autenticarToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT id, nome, valor::float, taxa::float, parcelas FROM planos ORDER BY id ASC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao buscar planos.' });
    }
});

app.post('/api/planos', autenticarToken, async (req, res) => {
    const { nome, valor, taxa, parcelas } = req.body;
    const nomeLimpo = String(nome || '').trim();
    const valorNum = parseFloat(valor);
    const taxaNum = parseFloat(taxa);
    const parcelasNum = parseInt(parcelas);

    if (
        !/^[A-Za-zÀ-ÖØ-öø-ÿ0-9\s\-]{3,40}$/.test(nomeLimpo) ||
        isNaN(valorNum) || valorNum < 0 ||
        isNaN(taxaNum) || taxaNum < 0 ||
        isNaN(parcelasNum) || parcelasNum < 1
    ) {
        return res.status(400).json({ erro: 'Dados do plano inválidos.' });
    }

    try {
        const result = await pool.query(
            'INSERT INTO planos (nome, valor, taxa, parcelas) VALUES ($1, $2, $3, $4) RETURNING id, nome, valor::float, taxa::float, parcelas',
            [nomeLimpo, valorNum, taxaNum, parcelasNum]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao salvar plano.' });
    }
});

app.delete('/api/planos/:id', autenticarToken, async (req, res) => {
    const id = parseInt(req.params.id);
    try {
        const countRes = await pool.query('SELECT COUNT(*)::int AS total FROM planos');
        if (countRes.rows[0].total <= 1) {
            return res.status(400).json({ erro: 'O sistema precisa manter pelo menos 1 plano ativo.' });
        }
        await pool.query('DELETE FROM planos WHERE id = $1', [id]);
        res.json({ mensagem: 'Plano excluído com sucesso.' });
    } catch (err) {
        res.status(400).json({ erro: 'Não é possível excluir plano vinculado a contratos.' });
    }
});

// ==========================================
// 5. ROTAS DE CONTRATOS, UNIFICAÇÃO, TAXAS E AUDITORIA
// ==========================================
app.get('/api/contratos', autenticarToken, async (req, res) => {
    const sql = `
        SELECT 
            c.id,
            c.valor_base::float AS "valorBase",
            c.valor_total::float AS "valorTotal",
            c.valor_parcela::float AS "valorParcela",
            c.parcelas_totais AS "parcelas",
            c.parcelas_pagas AS "parcelasPagas",
            COALESCE(c.taxa_aplicada, p.taxa)::float AS "taxa",
            COALESCE(c.status, 'ativo') AS "status",
            c.contrato_origem_id AS "contratoOrigemId",
            c.observacao AS "observacao",
            COALESCE(c.data_primeiro_vencimento, TO_CHAR(c.data_criacao, 'YYYY-MM-DD')) AS "dataPrimeiroVencimento",
            cli.id AS "clienteId",
            cli.nome AS "cliente",
            cli.cpf AS "cpf",
            cli.whatsapp AS "whatsapp",
            cli.cep AS "cep",
            cli.rua AS "rua",
            cli.numero AS "numero",
            cli.complemento AS "complemento",
            cli.bairro AS "bairro",
            cli.cidade AS "cidade",
            cli.uf AS "uf",
            p.nome AS "plano"
        FROM contratos c
        JOIN clientes cli ON c.cliente_id = cli.id
        JOIN planos p ON c.plano_id = p.id
        ORDER BY c.id DESC
    `;
    try {
        const result = await pool.query(sql);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao listar contratos.' });
    }
});

app.get('/api/financeiro/pagamentos-geral', autenticarToken, async (req, res) => {
    const sql = `
        SELECT 
            pag.id,
            pag.contrato_id AS "contratoId",
            pag.numero_parcela AS "numeroParcela",
            pag.valor_pago::float AS "valorPago",
            TO_CHAR(pag.data_pagamento, 'YYYY-MM-DD HH24:MI:SS') AS "dataPagamento",
            c.valor_base::float AS "valorBase",
            c.parcelas_totais AS "parcelasTotais",
            cli.nome AS "cliente",
            p.nome AS "plano"
        FROM pagamentos pag
        JOIN contratos c ON pag.contrato_id = c.id
        JOIN clientes cli ON c.cliente_id = cli.id
        JOIN planos p ON c.plano_id = p.id
        ORDER BY pag.data_pagamento DESC, pag.id DESC
    `;
    try {
        const result = await pool.query(sql);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao carregar movimentações financeiras.' });
    }
});

function contratoVenceNoMesmoMesEDia(contrato, novaDataISO) {
    if ((contrato.status || 'ativo') !== 'ativo') return false;
    if (contrato.parcelasPagas >= contrato.parcelasTotais) return false;

    const [novoAno, novoMes, novoDia] = novaDataISO.split('-').map(Number);
    const [origAno, origMes, origDia] = contrato.dataPrimeiroVencimento.split('-').map(Number);

    for (let i = contrato.parcelasPagas; i < contrato.parcelasTotais; i++) {
        const dataParc = new Date(origAno, origMes - 1 + i, origDia);
        if (dataParc.getDate() !== origDia) {
            dataParc.setDate(0);
        }

        const parcAno = dataParc.getFullYear();
        const parcMes = dataParc.getMonth() + 1;
        const parcDia = dataParc.getDate();

        if (parcAno === novoAno && parcMes === novoMes && parcDia === novoDia) {
            return true;
        }
    }
    return false;
}

app.post('/api/contratos', autenticarToken, async (req, res) => {
    const clienteId = parseInt(req.body.clienteId);
    const planoId = parseInt(req.body.planoId);
    const valorBase = parseFloat(req.body.valorBase);
    const dataVencimento = String(req.body.dataPrimeiroVencimento || '').trim();
    const confirmarUnificacao = Boolean(req.body.confirmarUnificacao);

    if (isNaN(clienteId) || isNaN(planoId) || isNaN(valorBase) || valorBase < 50) {
        return res.status(400).json({ erro: 'Dados do contrato inválidos (valor mínimo R$ 50,00).' });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataVencimento)) {
        return res.status(400).json({ erro: 'Data do primeiro vencimento inválida.' });
    }

    const client = await pool.connect();
    try {
        const planoRes = await client.query('SELECT id, nome, valor::float, taxa::float, parcelas FROM planos WHERE id = $1', [planoId]);
        const plano = planoRes.rows[0];
        if (!plano) return res.status(404).json({ erro: 'Plano não encontrado.' });

        const ativosRes = await client.query(
            `SELECT id, valor_base::float AS "valorBase", valor_total::float AS "valorTotal", valor_parcela::float AS "valorParcela",
                    parcelas_totais AS "parcelasTotais", parcelas_pagas AS "parcelasPagas", status,
                    COALESCE(data_primeiro_vencimento, TO_CHAR(data_criacao, 'YYYY-MM-DD')) AS "dataPrimeiroVencimento"
             FROM contratos 
             WHERE cliente_id = $1 AND COALESCE(status, 'ativo') = 'ativo' AND parcelas_pagas < parcelas_totais`,
            [clienteId]
        );

        const contratoConflitante = ativosRes.rows.find(c => contratoVenceNoMesmoMesEDia(c, dataVencimento));

        if (contratoConflitante) {
            const capitalPorParcela = contratoConflitante.valorBase / contratoConflitante.parcelasTotais;
            const parcelasRestantes = contratoConflitante.parcelasTotais - contratoConflitante.parcelasPagas;
            const saldoCapitalAnterior = parcelasRestantes * capitalPorParcela;
            const saldoTotalAnterior = parcelasRestantes * contratoConflitante.valorParcela;

            if (!confirmarUnificacao) {
                return res.status(409).json({
                    requerUnificacao: true,
                    contratoAnterior: {
                        id: contratoConflitante.id,
                        valorBaseOriginal: contratoConflitante.valorBase,
                        saldoCapitalRestante: saldoCapitalAnterior,
                        saldoTotalRestante: saldoTotalAnterior,
                        parcelasPagas: contratoConflitante.parcelasPagas,
                        parcelasTotais: contratoConflitante.parcelasTotais
                    },
                    novoValorSolicitado: valorBase,
                    valorBaseUnificado: saldoCapitalAnterior + valorBase
                });
            }

            const novoValorBaseUnificado = saldoCapitalAnterior + valorBase;
            const jurosTotais = novoValorBaseUnificado * (plano.taxa / 100) * plano.parcelas;
            const valorTotal = novoValorBaseUnificado + jurosTotais;
            const valorParcela = valorTotal / plano.parcelas;
            const obsUnificacao = `Unificado com contrato #CTR-${String(contratoConflitante.id).padStart(4, '0')} (Saldo anterior: R$ ${saldoCapitalAnterior.toFixed(2)} + Novo: R$ ${valorBase.toFixed(2)})`;

            await client.query('BEGIN');
            await client.query(`UPDATE contratos SET status = 'unificado' WHERE id = $1`, [contratoConflitante.id]);
            const insertUnif = await client.query(
                `INSERT INTO contratos (cliente_id, plano_id, valor_base, valor_total, valor_parcela, parcelas_totais, parcelas_pagas, taxa_aplicada, status, contrato_origem_id, observacao, data_primeiro_vencimento)
                 VALUES ($1, $2, $3, $4, $5, $6, 0, $7, 'ativo', $8, $9, $10) RETURNING id`,
                [clienteId, planoId, novoValorBaseUnificado, valorTotal, valorParcela, plano.parcelas, plano.taxa, contratoConflitante.id, obsUnificacao, dataVencimento]
            );
            await client.query('COMMIT');

            return res.status(201).json({
                id: insertUnif.rows[0].id,
                unificado: true,
                mensagem: 'Contratos unificados com sucesso! O histórico anterior foi preservado.'
            });
        }

        const jurosTotais = valorBase * (plano.taxa / 100) * plano.parcelas;
        const valorTotal = valorBase + jurosTotais;
        const valorParcela = valorTotal / plano.parcelas;

        const insertNormal = await client.query(
            `INSERT INTO contratos (cliente_id, plano_id, valor_base, valor_total, valor_parcela, parcelas_totais, parcelas_pagas, taxa_aplicada, status, data_primeiro_vencimento) 
             VALUES ($1, $2, $3, $4, $5, $6, 0, $7, 'ativo', $8) RETURNING id`,
            [clienteId, planoId, valorBase, valorTotal, valorParcela, plano.parcelas, plano.taxa, dataVencimento]
        );

        res.status(201).json({ id: insertNormal.rows[0].id, mensagem: 'Contrato gerado com sucesso!' });
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        res.status(500).json({ erro: 'Erro ao processar geração do contrato.' });
    } finally {
        client.release();
    }
});

app.patch('/api/contratos/:id/revisar-taxa', autenticarToken, async (req, res) => {
    const id = parseInt(req.params.id);
    const novaTaxa = parseFloat(req.body.novaTaxa);

    if (isNaN(novaTaxa) || novaTaxa < 0 || novaTaxa > 100) {
        return res.status(400).json({ erro: 'Informe uma taxa válida entre 0% e 100%.' });
    }

    try {
        const result = await pool.query('SELECT id, valor_base::float, parcelas_totais, status FROM contratos WHERE id = $1', [id]);
        const contrato = result.rows[0];
        if (!contrato) return res.status(404).json({ erro: 'Contrato não encontrado.' });

        if ((contrato.status || 'ativo') === 'unificado') {
            return res.status(400).json({ erro: 'Contratos já unificados são históricos e não podem ter taxa alterada.' });
        }

        const novosJuros = contrato.valor_base * (novaTaxa / 100) * contrato.parcelas_totais;
        const novoValorTotal = contrato.valor_base + novosJuros;
        const novoValorParcela = novoValorTotal / contrato.parcelas_totais;

        await pool.query(
            `UPDATE contratos SET taxa_aplicada = $1, valor_total = $2, valor_parcela = $3 WHERE id = $4`,
            [novaTaxa, novoValorTotal, novoValorParcela, id]
        );

        res.json({
            mensagem: 'Taxa revisada e contrato recalculado com sucesso!',
            novaTaxa,
            novoValorTotal,
            novoValorParcela
        });
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao atualizar a taxa do contrato.' });
    }
});

app.patch('/api/contratos/:id/pagar-parcela', autenticarToken, async (req, res) => {
    const id = parseInt(req.params.id);
    const client = await pool.connect();

    try {
        const result = await client.query('SELECT parcelas_pagas, parcelas_totais, valor_parcela::float, status FROM contratos WHERE id = $1', [id]);
        const contrato = result.rows[0];
        if (!contrato) return res.status(404).json({ erro: 'Contrato não encontrado.' });

        if ((contrato.status || 'ativo') === 'unificado') {
            return res.status(400).json({ erro: 'Este contrato foi unificado. Registre os pagamentos no contrato consolidado.' });
        }

        if (contrato.parcelas_pagas >= contrato.parcelas_totais) {
            return res.status(400).json({ erro: 'Este contrato já está totalmente quitado.' });
        }

        const numeroParcela = contrato.parcelas_pagas + 1;

        await client.query('BEGIN');
        await client.query('UPDATE contratos SET parcelas_pagas = $1 WHERE id = $2', [numeroParcela, id]);
        const insertPag = await client.query(
            'INSERT INTO pagamentos (contrato_id, numero_parcela, valor_pago) VALUES ($1, $2, $3) RETURNING id',
            [id, numeroParcela, contrato.valor_parcela]
        );
        await client.query('COMMIT');

        res.json({
            mensagem: 'Parcela registrada com sucesso!',
            reciboId: insertPag.rows[0].id,
            parcelasPagas: numeroParcela
        });
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        res.status(500).json({ erro: 'Erro ao registrar recibo no histórico.' });
    } finally {
        client.release();
    }
});

app.get('/api/contratos/:id/pagamentos', autenticarToken, async (req, res) => {
    const id = parseInt(req.params.id);
    try {
        const result = await pool.query(
            `SELECT id, numero_parcela AS "numeroParcela", valor_pago::float AS "valorPago", 
                    TO_CHAR(data_pagamento, 'YYYY-MM-DD HH24:MI:SS') AS "dataPagamento"
             FROM pagamentos WHERE contrato_id = $1 ORDER BY numero_parcela ASC`,
            [id]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao carregar histórico de pagamentos.' });
    }
});

app.delete('/api/contratos/:id/estornar-ultima', autenticarToken, async (req, res) => {
    const id = parseInt(req.params.id);
    const client = await pool.connect();

    try {
        const result = await client.query('SELECT parcelas_pagas, status FROM contratos WHERE id = $1', [id]);
        const contrato = result.rows[0];
        if (!contrato) return res.status(404).json({ erro: 'Contrato não encontrado.' });

        if ((contrato.status || 'ativo') === 'unificado') {
            return res.status(400).json({ erro: 'Contratos unificados são históricos e não permitem estorno.' });
        }
        if (contrato.parcelas_pagas <= 0) {
            return res.status(400).json({ erro: 'Não há parcelas pagas para estornar neste contrato.' });
        }

        const parcelaAtual = contrato.parcelas_pagas;
        const novaQuantidade = parcelaAtual - 1;

        await client.query('BEGIN');
        await client.query('UPDATE contratos SET parcelas_pagas = $1 WHERE id = $2', [novaQuantidade, id]);
        await client.query('DELETE FROM pagamentos WHERE contrato_id = $1 AND numero_parcela = $2', [id, parcelaAtual]);
        await client.query('COMMIT');

        res.json({ mensagem: 'Último pagamento estornado com sucesso!', parcelasPagas: novaQuantidade });
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        res.status(500).json({ erro: 'Erro ao estornar pagamento.' });
    } finally {
        client.release();
    }
});

app.delete('/api/contratos/:id', autenticarToken, async (req, res) => {
    const id = parseInt(req.params.id);
    try {
        await pool.query('DELETE FROM contratos WHERE id = $1', [id]);
        res.json({ mensagem: 'Contrato excluído com sucesso.' });
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao excluir contrato.' });
    }
});

// ==========================================
// 6. INICIALIZAÇÃO DO SERVIDOR
// ==========================================
app.listen(PORT, () => {
    console.log(`Servidor CredControl API rodando na porta ${PORT}`);
});