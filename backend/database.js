require('dotenv').config();
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
    console.error('ERRO CRÍTICO: Variável de ambiente DATABASE_URL não definida!');
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

async function inicializarBanco() {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS usuarios (
                id SERIAL PRIMARY KEY,
                usuario TEXT UNIQUE NOT NULL,
                senha_hash TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'admin'
            )
        `);

        // Garante compatibilidade com o banco já existente no Supabase
        await client.query(`
            ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'admin'
        `);
        await client.query(`
            UPDATE usuarios SET role = 'admin' WHERE usuario = 'admin'
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS clientes (
                id SERIAL PRIMARY KEY,
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

        await client.query(`
            CREATE TABLE IF NOT EXISTS planos (
                id SERIAL PRIMARY KEY,
                nome TEXT NOT NULL,
                valor NUMERIC(12, 2) DEFAULT 0,
                taxa NUMERIC(6, 2) NOT NULL,
                parcelas INTEGER NOT NULL
            )
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS contratos (
                id SERIAL PRIMARY KEY,
                cliente_id INTEGER NOT NULL REFERENCES clientes(id),
                plano_id INTEGER NOT NULL REFERENCES planos(id),
                valor_base NUMERIC(12, 2) NOT NULL,
                valor_total NUMERIC(12, 2) NOT NULL,
                valor_parcela NUMERIC(12, 2) NOT NULL,
                parcelas_totais INTEGER NOT NULL,
                parcelas_pagas INTEGER DEFAULT 0,
                taxa_aplicada NUMERIC(6, 2),
                status TEXT DEFAULT 'ativo',
                contrato_origem_id INTEGER DEFAULT NULL,
                observacao TEXT DEFAULT '',
                data_primeiro_vencimento TEXT,
                data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS pagamentos (
                id SERIAL PRIMARY KEY,
                contrato_id INTEGER NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
                numero_parcela INTEGER NOT NULL,
                valor_pago NUMERIC(12, 2) NOT NULL,
                data_pagamento TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'America/Sao_Paulo')
            )
        `);

        const resPlanos = await client.query('SELECT COUNT(*)::int AS total FROM planos');
        if (resPlanos.rows[0].total === 0) {
            await client.query(
                `INSERT INTO planos (nome, valor, taxa, parcelas) VALUES 
                ('Plano Flex 3x', 500, 2.5, 3),
                ('Plano Padrão 6x', 1000, 3.0, 6),
                ('Plano Estendido 12x', 2000, 3.5, 12)`
            );
            console.log('Planos iniciais inseridos no PostgreSQL (Supabase).');
        }

        console.log('Banco de dados PostgreSQL (Supabase) conectado e tabelas verificadas.');
    } catch (err) {
        console.error('Erro ao inicializar tabelas no PostgreSQL:', err.message);
    } finally {
        client.release();
    }
}

inicializarBanco();

module.exports = pool;