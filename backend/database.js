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
            whatsapp TEXT NOT NULL
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS planos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
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
            data_primeiro_vencimento TEXT,
            data_criacao TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (cliente_id) REFERENCES clientes(id),
            FOREIGN KEY (plano_id) REFERENCES planos(id)
        )
    `);

    // Migração segura: adiciona a coluna caso o banco já existisse antes desta atualização
    db.run(`ALTER TABLE contratos ADD COLUMN data_primeiro_vencimento TEXT`, (err) => {
        // Ignora erro caso a coluna já exista
    });

    db.get('SELECT COUNT(*) as total FROM planos', (err, row) => {
        if (!err && row.total === 0) {
            const stmt = db.prepare('INSERT INTO planos (nome, taxa, parcelas) VALUES (?, ?, ?)');
            stmt.run('Plano Flex 3x', 2.5, 3);
            stmt.run('Plano Padrão 6x', 3.0, 6);
            stmt.run('Plano Estendido 12x', 3.5, 12);
            stmt.finalize();
            console.log('Planos iniciais inseridos no banco de dados.');
        }
    });
});

module.exports = db;