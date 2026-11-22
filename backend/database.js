const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Erro ao conectar ao banco de dados SQLite:', err.message);
    } else {
        console.log('Conectado ao banco de dados SQLite com sucesso.');
    }
});

db.serialize(() => {
    db.run('PRAGMA foreign_keys = ON');

    db.run(`
        CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            usuario TEXT UNIQUE NOT NULL,
            senha_hash TEXT NOT NULL
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS clientes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            cpf TEXT UNIQUE NOT NULL,
            whatsapp TEXT NOT NULL,
            cep TEXT DEFAULT '',
            rua TEXT DEFAULT '',
            numero TEXT DEFAULT '',
            complemento TEXT DEFAULT '',
            bairro TEXT DEFAULT '',
            cidade TEXT DEFAULT '',
            uf TEXT DEFAULT ''
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS planos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            valor REAL DEFAULT 0,
            taxa REAL NOT NULL,
            parcelas INTEGER NOT NULL
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS contratos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cliente_id INTEGER NOT NULL,
            plano_id INTEGER NOT NULL,
            valor_base REAL NOT NULL,
            valor_total REAL NOT NULL,
            valor_parcela REAL NOT NULL,
            parcelas_totais INTEGER NOT NULL,
            parcelas_pagas INTEGER DEFAULT 0,
            taxa_aplicada REAL,
            status TEXT DEFAULT 'ativo',
            contrato_origem_id INTEGER DEFAULT NULL,
            observacao TEXT DEFAULT '',
            data_primeiro_vencimento TEXT,
            data_criacao TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (cliente_id) REFERENCES clientes(id),
            FOREIGN KEY (plano_id) REFERENCES planos(id)
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS pagamentos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            contrato_id INTEGER NOT NULL,
            numero_parcela INTEGER NOT NULL,
            valor_pago REAL NOT NULL,
            data_pagamento TEXT DEFAULT (datetime('now', 'localtime')),
            FOREIGN KEY (contrato_id) REFERENCES contratos(id) ON DELETE CASCADE
        )
    `);

    // Migrações seguras para bancos já existentes
    db.run(`ALTER TABLE contratos ADD COLUMN data_primeiro_vencimento TEXT`, () => {});
    db.run(`ALTER TABLE contratos ADD COLUMN taxa_aplicada REAL`, () => {});
    db.run(`ALTER TABLE contratos ADD COLUMN status TEXT DEFAULT 'ativo'`, () => {});
    db.run(`ALTER TABLE contratos ADD COLUMN contrato_origem_id INTEGER DEFAULT NULL`, () => {});
    db.run(`ALTER TABLE contratos ADD COLUMN observacao TEXT DEFAULT ''`, () => {});
    db.run(`ALTER TABLE planos ADD COLUMN valor REAL DEFAULT 0`, () => {});
    db.run(`ALTER TABLE clientes ADD COLUMN cep TEXT DEFAULT ''`, () => {});
    db.run(`ALTER TABLE clientes ADD COLUMN rua TEXT DEFAULT ''`, () => {});
    db.run(`ALTER TABLE clientes ADD COLUMN numero TEXT DEFAULT ''`, () => {});
    db.run(`ALTER TABLE clientes ADD COLUMN complemento TEXT DEFAULT ''`, () => {});
    db.run(`ALTER TABLE clientes ADD COLUMN bairro TEXT DEFAULT ''`, () => {});
    db.run(`ALTER TABLE clientes ADD COLUMN cidade TEXT DEFAULT ''`, () => {});
    db.run(`ALTER TABLE clientes ADD COLUMN uf TEXT DEFAULT ''`, () => {});

    // Preenche taxa_aplicada nos contratos antigos onde estiver nula
    db.run(`
        UPDATE contratos 
        SET taxa_aplicada = (SELECT taxa FROM planos WHERE planos.id = contratos.plano_id)
        WHERE taxa_aplicada IS NULL
    `);

    db.get('SELECT COUNT(*) as total FROM planos', (err, row) => {
        if (!err && row.total === 0) {
            const stmt = db.prepare('INSERT INTO planos (nome, valor, taxa, parcelas) VALUES (?, ?, ?, ?)');
            stmt.run('Plano Flex 3x', 500, 2.5, 3);
            stmt.run('Plano Padrão 6x', 1000, 3.0, 6);
            stmt.run('Plano Estendido 12x', 2000, 3.5, 12);
            stmt.finalize();
            console.log('Planos iniciais inseridos no banco de dados.');
        }
    });
});

module.exports = db;