require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;

// ==========================================
// 1. HARDENING: HELMET, CORS RESTRITO E RATE LIMIT
// ==========================================
app.use(helmet());

const origensPermitidas = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5500',
    'http://127.0.0.1:5500'
];

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
    max: 150,
    standardHeaders: true,
    legacyHeaders: false,
    message: { erro: 'Muitas requisições deste IP. Tente novamente em 15 minutos.' }
});
app.use('/api/', limitadorGeral);

const limitadorLogin = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { erro: 'Muitas tentativas de login. Acesso temporariamente bloqueado por 15 minutos.' }
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

// ==========================================
// 2. DIAGNÓSTICO E AUTENTICAÇÃO (PÚBLICAS)
// ==========================================
app.get('/api/status', (req, res) => {
    res.json({ status: 'online', sistema: 'CredControl API' });
});

app.get('/api/auth/verificar-setup', (req, res) => {
    db.get('SELECT id FROM usuarios LIMIT 1', (err, row) => {
        if (err) return res.status(500).json({ erro: 'Erro interno no banco de dados.' });
        res.json({ configurado: !!row });
    });
});

app.post('/api/auth/setup', limitadorLogin, async (req, res) => {
    const { senha } = req.body;
    if (!senha || senha.length < 6) {
        return res.status(400).json({ erro: 'A senha deve ter no mínimo 6 caracteres.' });
    }

    db.get('SELECT id FROM usuarios LIMIT 1', async (err, row) => {
        if (err) return res.status(500).json({ erro: 'Erro ao consultar banco.' });
        if (row) return res.status(403).json({ erro: 'O administrador já foi configurado.' });

        const senhaHash = await bcrypt.hash(senha, 10);
        db.run('INSERT INTO usuarios (usuario, senha_hash) VALUES (?, ?)', ['admin', senhaHash], function(err) {
            if (err) return res.status(500).json({ erro: 'Erro ao salvar administrador.' });

            const token = jwt.sign({ id: this.lastID, usuario: 'admin' }, JWT_SECRET, { expiresIn: '8h' });
            res.status(201).json({ mensagem: 'Administrador configurado com sucesso!', token });
        });
    });
});

app.post('/api/auth/login', limitadorLogin, (req, res) => {
    const { senha } = req.body;
    if (!senha) return res.status(400).json({ erro: 'Senha é obrigatória.' });

    db.get('SELECT * FROM usuarios WHERE usuario = ?', ['admin'], async (err, user) => {
        if (err) return res.status(500).json({ erro: 'Erro interno no servidor.' });
        if (!user) return res.status(404).json({ erro: 'Administrador ainda não configurado.' });

        const senhaValida = await bcrypt.compare(senha, user.senha_hash);
        if (!senhaValida) return res.status(401).json({ erro: 'Credenciais inválidas.' });

        const token = jwt.sign({ id: user.id, usuario: user.usuario }, JWT_SECRET, { expiresIn: '8h' });
        res.json({ mensagem: 'Login realizado com sucesso!', token });
    });
});

// ==========================================
// 3. ROTAS DE CLIENTES (PROTEGIDAS POR JWT)
// ==========================================
app.get('/api/clientes', autenticarToken, (req, res) => {
    db.all('SELECT * FROM clientes ORDER BY id DESC', [], (err, rows) => {
        if (err) return res.status(500).json({ erro: 'Erro ao buscar clientes.' });
        res.json(rows);
    });
});

app.post('/api/clientes', autenticarToken, (req, res) => {
    const { nome, cpf, whatsapp } = req.body;
    const nomeLimpo = String(nome || '').trim();
    const cpfLimpo = String(cpf || '').replace(/\D/g, '');
    const whatsappLimpo = String(whatsapp || '').replace(/\D/g, '');

    if (!/^[A-Za-zÀ-ÖØ-öø-ÿ\s]{3,}$/.test(nomeLimpo)) {
        return res.status(400).json({ erro: 'Nome inválido no servidor.' });
    }
    if (cpfLimpo.length !== 11 || /^(\d)\1+$/.test(cpfLimpo)) {
        return res.status(400).json({ erro: 'CPF inválido no servidor.' });
    }
    if (whatsappLimpo.length < 10 || whatsappLimpo.length > 11) {
        return res.status(400).json({ erro: 'WhatsApp inválido no servidor.' });
    }

    db.run(
        'INSERT INTO clientes (nome, cpf, whatsapp) VALUES (?, ?, ?)',
        [nomeLimpo, cpfLimpo, whatsappLimpo],
        function(err) {
            if (err) {
                if (err.message.includes('UNIQUE')) {
                    return res.status(409).json({ erro: 'Este CPF já está cadastrado no banco de dados!' });
                }
                return res.status(500).json({ erro: 'Erro ao cadastrar cliente.' });
            }
            res.status(201).json({ id: this.lastID, nome: nomeLimpo, cpf: cpfLimpo, whatsapp: whatsappLimpo });
        }
    );
});

app.delete('/api/clientes/:id', autenticarToken, (req, res) => {
    const id = parseInt(req.params.id);
    db.run('DELETE FROM clientes WHERE id = ?', [id], function(err) {
        if (err) {
            return res.status(400).json({ erro: 'Não é possível excluir cliente com contratos vinculados.' });
        }
        res.json({ mensagem: 'Cliente removido com sucesso.' });
    });
});

// ==========================================
// 4. ROTAS DE PLANOS E TAXAS (PROTEGIDAS)
// ==========================================
app.get('/api/planos', autenticarToken, (req, res) => {
    db.all('SELECT * FROM planos ORDER BY id ASC', [], (err, rows) => {
        if (err) return res.status(500).json({ erro: 'Erro ao buscar planos.' });
        res.json(rows);
    });
});

app.post('/api/planos', autenticarToken, (req, res) => {
    const { nome, taxa, parcelas } = req.body;
    const nomeLimpo = String(nome || '').trim();
    const taxaNum = parseFloat(taxa);
    const parcelasNum = parseInt(parcelas);

    if (!/^[A-Za-zÀ-ÖØ-öø-ÿ0-9\s\-]{3,40}$/.test(nomeLimpo) || isNaN(taxaNum) || taxaNum < 0 || isNaN(parcelasNum) || parcelasNum < 1) {
        return res.status(400).json({ erro: 'Dados do plano inválidos.' });
    }

    db.run(
        'INSERT INTO planos (nome, taxa, parcelas) VALUES (?, ?, ?)',
        [nomeLimpo, taxaNum, parcelasNum],
        function(err) {
            if (err) return res.status(500).json({ erro: 'Erro ao salvar plano.' });
            res.status(201).json({ id: this.lastID, nome: nomeLimpo, taxa: taxaNum, parcelas: parcelasNum });
        }
    );
});

app.delete('/api/planos/:id', autenticarToken, (req, res) => {
    const id = parseInt(req.params.id);
    db.get('SELECT COUNT(*) as total FROM planos', (err, row) => {
        if (row && row.total <= 1) {
            return res.status(400).json({ erro: 'O sistema precisa manter pelo menos 1 plano ativo.' });
        }
        db.run('DELETE FROM planos WHERE id = ?', [id], function(err) {
            if (err) return res.status(400).json({ erro: 'Não é possível excluir plano vinculado a contratos.' });
            res.json({ mensagem: 'Plano excluído com sucesso.' });
        });
    });
});

// ==========================================
// 5. ROTAS DE CONTRATOS E AUDITORIA DE PAGAMENTOS
// ==========================================
app.get('/api/contratos', autenticarToken, (req, res) => {
    const sql = `
        SELECT 
            c.id,
            c.valor_base AS valorBase,
            c.valor_total AS valorTotal,
            c.valor_parcela AS valorParcela,
            c.parcelas_totais AS parcelas,
            c.parcelas_pagas AS parcelasPagas,
            COALESCE(c.data_primeiro_vencimento, DATE(c.data_criacao)) AS dataPrimeiroVencimento,
            cli.id AS clienteId,
            cli.nome AS cliente,
            cli.cpf AS cpf,
            cli.whatsapp AS whatsapp,
            p.nome AS plano,
            p.taxa AS taxa
        FROM contratos c
        JOIN clientes cli ON c.cliente_id = cli.id
        JOIN planos p ON c.plano_id = p.id
        ORDER BY c.id DESC
    `;
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ erro: 'Erro ao listar contratos.' });
        res.json(rows);
    });
});

app.post('/api/contratos', autenticarToken, (req, res) => {
    const clienteId = parseInt(req.body.clienteId);
    const planoId = parseInt(req.body.planoId);
    const valorBase = parseFloat(req.body.valorBase);
    const dataVencimento = String(req.body.dataPrimeiroVencimento || '').trim();

    if (isNaN(clienteId) || isNaN(planoId) || isNaN(valorBase) || valorBase < 50) {
        return res.status(400).json({ erro: 'Dados do contrato inválidos (valor mínimo R$ 50,00).' });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataVencimento)) {
        return res.status(400).json({ erro: 'Data do primeiro vencimento inválida.' });
    }

    db.get('SELECT * FROM planos WHERE id = ?', [planoId], (err, plano) => {
        if (err || !plano) return res.status(404).json({ erro: 'Plano não encontrado.' });

        const jurosTotais = valorBase * (plano.taxa / 100) * plano.parcelas;
        const valorTotal = valorBase + jurosTotais;
        const valorParcela = valorTotal / plano.parcelas;

        db.run(
            `INSERT INTO contratos (cliente_id, plano_id, valor_base, valor_total, valor_parcela, parcelas_totais, parcelas_pagas, data_primeiro_vencimento) 
             VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
            [clienteId, planoId, valorBase, valorTotal, valorParcela, plano.parcelas, dataVencimento],
            function(err) {
                if (err) return res.status(400).json({ erro: 'Erro ao criar contrato. Verifique se o cliente existe.' });
                res.status(201).json({ id: this.lastID, mensagem: 'Contrato gerado com sucesso!' });
            }
        );
    });
});

app.patch('/api/contratos/:id/pagar-parcela', autenticarToken, (req, res) => {
    const id = parseInt(req.params.id);
    db.get('SELECT parcelas_pagas, parcelas_totais, valor_parcela FROM contratos WHERE id = ?', [id], (err, contrato) => {
        if (err || !contrato) return res.status(404).json({ erro: 'Contrato não encontrado.' });

        if (contrato.parcelas_pagas >= contrato.parcelas_totais) {
            return res.status(400).json({ erro: 'Este contrato já está totalmente quitado.' });
        }

        const numeroParcela = contrato.parcelas_pagas + 1;

        db.serialize(() => {
            db.run('BEGIN TRANSACTION');
            db.run('UPDATE contratos SET parcelas_pagas = ? WHERE id = ?', [numeroParcela, id]);
            db.run(
                'INSERT INTO pagamentos (contrato_id, numero_parcela, valor_pago) VALUES (?, ?, ?)',
                [id, numeroParcela, contrato.valor_parcela],
                function(err) {
                    if (err) {
                        db.run('ROLLBACK');
                        return res.status(500).json({ erro: 'Erro ao registrar recibo no histórico.' });
                    }
                    db.run('COMMIT');
                    res.json({
                        mensagem: 'Parcela registrada com sucesso!',
                        reciboId: this.lastID,
                        parcelasPagas: numeroParcela
                    });
                }
            );
        });
    });
});

app.get('/api/contratos/:id/pagamentos', autenticarToken, (req, res) => {
    const id = parseInt(req.params.id);
    db.all(
        'SELECT id, numero_parcela AS numeroParcela, valor_pago AS valorPago, data_pagamento AS dataPagamento FROM pagamentos WHERE contrato_id = ? ORDER BY numero_parcela ASC',
        [id],
        (err, rows) => {
            if (err) return res.status(500).json({ erro: 'Erro ao carregar histórico de pagamentos.' });
            res.json(rows);
        }
    );
});

app.delete('/api/contratos/:id/estornar-ultima', autenticarToken, (req, res) => {
    const id = parseInt(req.params.id);
    db.get('SELECT parcelas_pagas FROM contratos WHERE id = ?', [id], (err, contrato) => {
        if (err || !contrato) return res.status(404).json({ erro: 'Contrato não encontrado.' });
        if (contrato.parcelas_pagas <= 0) {
            return res.status(400).json({ erro: 'Não há parcelas pagas para estornar neste contrato.' });
        }

        const parcelaAtual = contrato.parcelas_pagas;
        const novaQuantidade = parcelaAtual - 1;

        db.serialize(() => {
            db.run('BEGIN TRANSACTION');
            db.run('UPDATE contratos SET parcelas_pagas = ? WHERE id = ?', [novaQuantidade, id]);
            db.run(
                'DELETE FROM pagamentos WHERE contrato_id = ? AND numero_parcela = ?',
                [id, parcelaAtual],
                (err) => {
                    if (err) {
                        db.run('ROLLBACK');
                        return res.status(500).json({ erro: 'Erro ao estornar pagamento.' });
                    }
                    db.run('COMMIT');
                    res.json({ mensagem: 'Último pagamento estornado com sucesso!', parcelasPagas: novaQuantidade });
                }
            );
        });
    });
});

app.delete('/api/contratos/:id', autenticarToken, (req, res) => {
    const id = parseInt(req.params.id);
    db.run('DELETE FROM contratos WHERE id = ?', [id], (err) => {
        if (err) return res.status(500).json({ erro: 'Erro ao excluir contrato.' });
        res.json({ mensagem: 'Contrato excluído com sucesso.' });
    });
});

// ==========================================
// 6. INICIALIZAÇÃO DO SERVIDOR
// ==========================================
app.listen(PORT, () => {
    console.log(`Servidor CredControl API blindado rodando em http://localhost:${PORT}`);
});