# CredControl | Sistema Full Stack de Gestão de Empréstimos

Sistema web completo para controle de carteiras de crédito, gestão de clientes, planos de juros, cronograma automático de vencimentos e cobrança integrada via WhatsApp, desenvolvido sob princípios de **Security by Design**.

---

## Arquitetura do Sistema

O projeto segue uma arquitetura cliente-servidor desacoplada:

- **Frontend (`frontend/`):** Single Page Application (SPA) construída em HTML5, CSS3 e JavaScript Vanilla moderno (ES6+), comunicando-se de forma assíncrona via `fetch` com autenticação baseada em tokens.
- **Backend (`backend/`):** API RESTful desenvolvida em **Node.js** e **Express**, responsável pelas regras de negócio, cálculos financeiros, validação de entrada e controle de acesso.
- **Banco de Dados:** **SQLite** relacional com integridade referencial ativa (`PRAGMA foreign_keys = ON`) entre administradores, clientes, planos e contratos.

---

## Medidas de Segurança (AppSec & LGPD)

- **Autenticação Stateless (JWT):** Todas as rotas de negócio exigem um *JSON Web Token* válido no cabeçalho `Authorization: Bearer`.
- **Criptografia de Senhas (Bcrypt):** Senhas administrativas são armazenadas exclusivamente como hashes com *Salt* aleatório (`cost 10`).
- **Prevenção contra SQL Injection:** Uso estrito de *Prepared Statements* (`?`) em todas as consultas ao banco de dados.
- **Defesa contra Força Bruta & DoS:** Implementação de `express-rate-limit` (bloqueio após 5 tentativas de login em 15 minutos) e limitação de payload JSON (`10kb`).
- **Hardening HTTP & CORS:** Cabeçalhos protegidos via `Helmet` e política restritiva de origem (`CORS Allowlist`).
- **Privacidade (LGPD):** Mascaramento visual de CPF na interface (`***.XXX.XXX-**`) e validação estrita de dados no servidor (*Zero Trust*).

---

## Como Executar Localmente

### 1. Clonar o repositório
```bash
git clone [https://github.com/jgabriel-sec/gestor-emprestimos.git](https://github.com/jgabriel-sec/gestor-emprestimos.git)
cd gestor-emprestimos