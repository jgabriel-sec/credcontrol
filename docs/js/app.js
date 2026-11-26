const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const API_URL = isLocalhost
    ? 'http://localhost:3000/api'
    : 'https://gestor-emprestimos.onrender.com/api';

// ==========================================
// 0. CLIENTE HTTP SEGURO E AUTENTICAÇÃO JWT (ADMIN + GERENTE)
// ==========================================
const telaLogin = document.getElementById('tela-login');
const sistemaPrincipal = document.getElementById('sistema-principal');
const formLogin = document.getElementById('form-login');
const loginTitulo = document.getElementById('login-titulo');
const loginInstrucao = document.getElementById('login-instrucao');
const labelLoginUsuario = document.getElementById('label-login-usuario');
const inputLoginUsuario = document.getElementById('admin-usuario');
const loginErro = document.getElementById('login-erro');
const btnLogin = document.getElementById('btn-login');
const btnAlternarCadastroGerente = document.getElementById('btn-alternar-cadastro-gerente');
const btnLogout = document.getElementById('btn-logout');

const blocoSegurancaAdmin = document.getElementById('bloco-seguranca-admin');
const badgePerfilUsuario = document.getElementById('badge-perfil-usuario');

let modoSetupInicial = false;
let modoCadastroGerente = false;
let gerenteJaConfigurado = false;
let usuarioAtualSessao = null;

function decodificarPayloadJWT(token) {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(
            atob(base64)
                .split('')
                .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
                .join('')
        );
        return JSON.parse(jsonPayload);
    } catch (e) {
        return null;
    }
}

function aplicarPermissoesDePerfil(usuarioLogado) {
    usuarioAtualSessao = usuarioLogado;
    const ehAdmin = usuarioLogado && usuarioLogado.role === 'admin';

    if (blocoSegurancaAdmin) {
        blocoSegurancaAdmin.style.display = ehAdmin ? 'block' : 'none';
    }

    if (badgePerfilUsuario && usuarioLogado) {
        const cargoLabel = ehAdmin ? 'Administrador' : 'Gerente';
        badgePerfilUsuario.textContent = `${cargoLabel} (${usuarioLogado.usuario})`;
    }
}

function atualizarInterfaceLogin() {
    loginErro.style.display = 'none';

    if (modoSetupInicial) {
        loginTitulo.textContent = 'Configuração Inicial (Admin)';
        loginInstrucao.textContent = 'Crie sua senha de Administrador no servidor (mínimo 6 caracteres).';
        labelLoginUsuario.textContent = 'Usuário Administrador';
        inputLoginUsuario.value = 'admin';
        inputLoginUsuario.readOnly = true;
        inputLoginUsuario.style.backgroundColor = '#F1F5F9';
        inputLoginUsuario.style.color = '#64748B';
        btnLogin.textContent = 'Definir Senha e Entrar';
        btnAlternarCadastroGerente.style.display = 'none';
        return;
    }

    if (modoCadastroGerente) {
        loginTitulo.textContent = 'Cadastro do Gerente';
        loginInstrucao.textContent = 'Crie seu login e senha individuais (limite único para o Gerente).';
        labelLoginUsuario.textContent = 'Escolha seu Usuário (ex: carlos)';
        inputLoginUsuario.value = '';
        inputLoginUsuario.readOnly = false;
        inputLoginUsuario.style.backgroundColor = '#FFFFFF';
        inputLoginUsuario.style.color = '#0F172A';
        btnLogin.textContent = 'Criar Conta de Gerente e Entrar';
        btnAlternarCadastroGerente.textContent = 'Voltar para o Login';
        btnAlternarCadastroGerente.style.display = 'block';
        return;
    }

    loginTitulo.textContent = 'Acesso Restrito';
    loginInstrucao.textContent = 'Informe seu usuário e senha para acessar o painel.';
    labelLoginUsuario.textContent = 'Usuário';
    inputLoginUsuario.readOnly = false;
    inputLoginUsuario.style.backgroundColor = '#FFFFFF';
    inputLoginUsuario.style.color = '#0F172A';
    btnLogin.textContent = 'Entrar no Sistema';

    if (!gerenteJaConfigurado) {
        btnAlternarCadastroGerente.textContent = 'Primeiro acesso do Gerente? Criar login';
        btnAlternarCadastroGerente.style.display = 'block';
    } else {
        btnAlternarCadastroGerente.style.display = 'none';
    }
}

btnAlternarCadastroGerente.addEventListener('click', () => {
    modoCadastroGerente = !modoCadastroGerente;
    formLogin.reset();
    atualizarInterfaceLogin();
});

async function requisicaoAPI(endpoint, opcoes = {}) {
    const token = sessionStorage.getItem('credcontrol_token');
    const headers = {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        ...(opcoes.headers || {})
    };

    const resposta = await fetch(`${API_URL}${endpoint}`, {
        ...opcoes,
        headers
    });

    const ehRotaPublicaAuth = endpoint.startsWith('/auth');
    const ehErroSenhaAtualIncorreta = endpoint === '/admin/minhas-credenciais' && resposta.status === 401;

    if ((resposta.status === 401 || resposta.status === 403) && !ehRotaPublicaAuth && !ehErroSenhaAtualIncorreta) {
        sessionStorage.removeItem('credcontrol_token');
        verificarEstadoAutenticacao();
        throw new Error('Sessão expirada ou acesso não autorizado.');
    }

    const dados = await resposta.json();
    if (!resposta.ok) {
        const erroObj = new Error(dados.erro || 'Erro na comunicação com o servidor.');
        erroObj.status = resposta.status;
        erroObj.dados = dados;
        throw erroObj;
    }

    return dados;
}

async function verificarEstadoAutenticacao() {
    const token = sessionStorage.getItem('credcontrol_token');

    if (token) {
        const payload = decodificarPayloadJWT(token);
        if (payload && payload.usuario) {
            aplicarPermissoesDePerfil(payload);
            telaLogin.style.display = 'none';
            sistemaPrincipal.style.display = 'flex';
            await carregarTodosOsDados();
            return;
        }
        sessionStorage.removeItem('credcontrol_token');
    }

    telaLogin.style.display = 'flex';
    sistemaPrincipal.style.display = 'none';
    modoCadastroGerente = false;

    try {
        const statusSetup = await requisicaoAPI('/auth/verificar-setup');
        modoSetupInicial = !statusSetup.configurado;
        gerenteJaConfigurado = Boolean(statusSetup.gerenteConfigurado);
        atualizarInterfaceLogin();
    } catch (erro) {
        loginErro.textContent = 'Servidor offline ou inicializando! Aguarde 40 segundos e atualize a página.';
        loginErro.style.display = 'block';
    }
}

formLogin.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    loginErro.style.display = 'none';

    const usuarioDigitado = inputLoginUsuario.value.trim().toLowerCase();
    const senhaDigitada = document.getElementById('admin-senha').value;

    let rotaAuth = '/auth/login';
    let corpoReq = { usuario: usuarioDigitado, senha: senhaDigitada };

    if (modoSetupInicial) {
        rotaAuth = '/auth/setup';
        corpoReq = { senha: senhaDigitada };
    } else if (modoCadastroGerente) {
        rotaAuth = '/auth/setup-gerente';
        corpoReq = { usuario: usuarioDigitado, senha: senhaDigitada };
    }

    try {
        const resposta = await requisicaoAPI(rotaAuth, {
            method: 'POST',
            body: JSON.stringify(corpoReq)
        });

        sessionStorage.setItem('credcontrol_token', resposta.token);
        formLogin.reset();
        await verificarEstadoAutenticacao();
    } catch (erro) {
        loginErro.textContent = erro.message;
        loginErro.style.display = 'block';
    }
});

btnLogout.addEventListener('click', () => {
    sessionStorage.removeItem('credcontrol_token');
    verificarEstadoAutenticacao();
});

// ==========================================
// 0.1 MODAL ALTERAR MINHAS CREDENCIAIS (ADMIN)
// ==========================================
const modalMinhasCredenciais = document.getElementById('modal-minhas-credenciais');
const formMinhasCredenciais = document.getElementById('form-minhas-credenciais');
const inputAdminNovoUsuario = document.getElementById('input-admin-novo-usuario');
const inputAdminNovaSenha = document.getElementById('input-admin-nova-senha');
const inputAdminSenhaAtual = document.getElementById('input-admin-senha-atual');

function fecharModalCredenciais() {
    modalMinhasCredenciais.style.display = 'none';
    formMinhasCredenciais.reset();
}

document.getElementById('btn-fechar-modal-credenciais').addEventListener('click', fecharModalCredenciais);
document.getElementById('btn-cancelar-credenciais').addEventListener('click', fecharModalCredenciais);
modalMinhasCredenciais.addEventListener('click', (e) => {
    if (e.target === modalMinhasCredenciais) fecharModalCredenciais();
});

document.getElementById('btn-abrir-minhas-credenciais').addEventListener('click', () => {
    formMinhasCredenciais.reset();
    if (usuarioAtualSessao && usuarioAtualSessao.usuario) {
        inputAdminNovoUsuario.value = usuarioAtualSessao.usuario;
    }
    modalMinhasCredenciais.style.display = 'flex';
});

formMinhasCredenciais.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const novoUsuario = inputAdminNovoUsuario.value.trim().toLowerCase();
    const novaSenha = inputAdminNovaSenha.value;
    const senhaAtual = inputAdminSenhaAtual.value;

    try {
        const resp = await requisicaoAPI('/admin/minhas-credenciais', {
            method: 'PATCH',
            body: JSON.stringify({ novoUsuario, novaSenha, senhaAtual })
        });

        if (resp.token) {
            sessionStorage.setItem('credcontrol_token', resp.token);
            const novoPayload = decodificarPayloadJWT(resp.token);
            if (novoPayload) aplicarPermissoesDePerfil(novoPayload);
        }

        alert(resp.mensagem);
        fecharModalCredenciais();
    } catch (erro) {
        alert(erro.message);
    }
});

// ==========================================
// 0.2 MODAL DE GESTÃO DO GERENTE (EXCLUSIVO ADMIN)
// ==========================================
const modalGerente = document.getElementById('modal-gerente');
const modalGerenteStatus = document.getElementById('modal-gerente-status');
const formRedefinirSenhaGerente = document.getElementById('form-redefinir-senha-gerente');
const inputNovaSenhaGerente = document.getElementById('input-nova-senha-gerente');

function fecharModalGerente() {
    modalGerente.style.display = 'none';
    formRedefinirSenhaGerente.reset();
}

document.getElementById('btn-fechar-modal-gerente').addEventListener('click', fecharModalGerente);
document.getElementById('btn-cancelar-gerente').addEventListener('click', fecharModalGerente);
modalGerente.addEventListener('click', (e) => {
    if (e.target === modalGerente) fecharModalGerente();
});

document.getElementById('btn-abrir-gerenciar-gerente').addEventListener('click', async () => {
    modalGerenteStatus.innerHTML = '<p style="color: var(--text-muted);">Consultando conta do gerente...</p>';
    formRedefinirSenhaGerente.style.display = 'none';
    modalGerente.style.display = 'flex';

    try {
        const info = await requisicaoAPI('/admin/gerente');
        if (!info.cadastrado) {
            modalGerenteStatus.innerHTML = `
                <div style="background-color: #FEF3C7; border: 1px solid #FDE68A; color: #92400E; padding: 12px; border-radius: 8px;">
                    <strong>Gerente ainda não cadastrado.</strong><br>
                    Peça para o gerente acessar o link do sistema e clicar em <em>"Primeiro acesso do Gerente? Criar login"</em> na tela de entrada.
                </div>
            `;
        } else {
            modalGerenteStatus.innerHTML = `
                <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; padding: 12px; border-radius: 8px;">
                    <div><strong>Perfil:</strong> Gerente do Sistema</div>
                    <div style="margin-top: 4px;"><strong>Login cadastrado:</strong> <span style="color: #2563EB; font-weight: 700;">${info.gerente.usuario}</span></div>
                </div>
            `;
            formRedefinirSenhaGerente.style.display = 'block';
        }
    } catch (erro) {
        modalGerenteStatus.textContent = erro.message;
    }
});

formRedefinirSenhaGerente.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const novaSenha = inputNovaSenhaGerente.value;

    try {
        const resp = await requisicaoAPI('/admin/gerente/senha', {
            method: 'PATCH',
            body: JSON.stringify({ novaSenha })
        });
        alert(resp.mensagem);
        fecharModalGerente();
    } catch (erro) {
        alert(erro.message);
    }
});

// ==========================================
// 1. NAVEGAÇÃO ENTRE TELAS (SPA)
// ==========================================
const itensMenu = document.querySelectorAll('.menu-item[data-tela]');
const secoesTela = document.querySelectorAll('.tela-secao');

itensMenu.forEach((item) => {
    item.addEventListener('click', (evento) => {
        evento.preventDefault();
        const telaAlvo = item.getAttribute('data-tela');

        itensMenu.forEach(m => m.classList.remove('active'));
        item.classList.add('active');

        secoesTela.forEach(secao => {
            secao.style.display = (secao.id === telaAlvo) ? 'block' : 'none';
        });
    });
});

// ==========================================
// 2. ESTADO EM MEMÓRIA E FORMATAÇÃO
// ==========================================
let clientes = [];
let planos = [];
let contratos = [];
let pagamentosGerais = [];

async function carregarTodosOsDados() {
    try {
        const [listaClientes, listaPlanos, listaContratos, listaPagamentos] = await Promise.all([
            requisicaoAPI('/clientes'),
            requisicaoAPI('/planos'),
            requisicaoAPI('/contratos'),
            requisicaoAPI('/financeiro/pagamentos-geral')
        ]);

        clientes = listaClientes;
        planos = listaPlanos;
        contratos = listaContratos;
        pagamentosGerais = listaPagamentos;

        atualizarClientesNaTela();
        atualizarPlanosNaTela();
        atualizarContratosNaTela();
        atualizarExtratoMensal();
    } catch (erro) {
        console.error('Erro ao carregar dados do servidor:', erro.message);
    }
}

function formatarMoeda(valor) {
    return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function aplicarMascaraMoedaInput(valorBruto) {
    const apenasDigitos = String(valorBruto).replace(/\D/g, '');
    if (!apenasDigitos) return '';
    const valorNumerico = parseInt(apenasDigitos, 10) / 100;
    return valorNumerico.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function converterMoedaParaNumero(textoMoeda) {
    if (!textoMoeda) return NaN;
    const limpo = String(textoMoeda)
        .replace(/[R$\s.]/g, '')
        .replace(',', '.');
    return parseFloat(limpo);
}

function mascararCPF(cpfLimpo) {
    if (!cpfLimpo || cpfLimpo.length !== 11) return '***.***.***.**';
    return `***.${cpfLimpo.substring(3, 6)}.${cpfLimpo.substring(6, 9)}.**`;
}

function formatarTelefone(tel) {
    if (!tel) return '';
    const apenasDigitos = String(tel).replace(/\D/g, '');
    const semPais = (apenasDigitos.startsWith('55') && apenasDigitos.length >= 12)
        ? apenasDigitos.slice(2)
        : apenasDigitos;

    if (semPais.length < 10) return tel;
    const ddd = semPais.substring(0, 2);
    const numero = semPais.substring(2);
    return `+55(${ddd})${numero}`;
}

function formatarCEP(cepLimpo) {
    const digitos = String(cepLimpo || '').replace(/\D/g, '');
    if (digitos.length !== 8) return cepLimpo || '';
    return `${digitos.slice(0, 5)}-${digitos.slice(5)}`;
}

function formatarEnderecoCompleto(item) {
    if (!item || !item.rua) return 'Não informado';
    const comp = item.complemento ? ` (${item.complemento})` : '';
    const cepFmt = item.cep ? ` - CEP: ${formatarCEP(item.cep)}` : '';
    return `${item.rua}, nº ${item.numero}${comp} - ${item.bairro}, ${item.cidade}/${item.uf}${cepFmt}`;
}

function formatarDataHoraSQLite(dataStr) {
    if (!dataStr) return '—';
    const [dataParte, horaParte] = dataStr.split(' ');
    const [ano, mes, dia] = dataParte.split('-');
    return horaParte ? `${dia}/${mes}/${ano} às ${horaParte.slice(0, 5)}` : `${dia}/${mes}/${ano}`;
}

document.getElementById('btn-exportar-backup').addEventListener('click', () => {
    const dadosBackup = {
        sistema: 'CredControl',
        origem: 'PostgreSQL-API',
        dataExportacao: new Date().toISOString(),
        clientes,
        planos,
        contratos,
        pagamentosGerais
    };

    const blob = new Blob([JSON.stringify(dadosBackup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `backup_credcontrol_${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
});

document.getElementById('input-importar-backup').addEventListener('change', (evento) => {
    alert('No modo Full Stack em nuvem, os dados já ficam salvos automaticamente no banco PostgreSQL (Supabase).');
    evento.target.value = '';
});

// ==========================================
// 3. MÓDULO DE CLIENTES, MÁSCARAS, ENDEREÇO E EXTRATO
// ==========================================
const formCliente = document.getElementById('form-cliente');
const tabelaClientes = document.getElementById('tabela-clientes');
const inputBuscaCliente = document.getElementById('busca-cliente');
const selectClienteContrato = document.getElementById('contrato-cliente');
const inputClienteCpf = document.getElementById('cliente-cpf');
const inputClienteWhatsapp = document.getElementById('cliente-whatsapp');
const inputClienteCep = document.getElementById('cliente-cep');
const inputClienteRua = document.getElementById('cliente-rua');
const inputClienteNumero = document.getElementById('cliente-numero');
const inputClienteComplemento = document.getElementById('cliente-complemento');
const inputClienteBairro = document.getElementById('cliente-bairro');
const inputClienteCidade = document.getElementById('cliente-cidade');
const inputClienteUf = document.getElementById('cliente-uf');

const modalCliente = document.getElementById('modal-cliente');
const modalClienteTitulo = document.getElementById('modal-cliente-titulo');
const modalClienteSubtitulo = document.getElementById('modal-cliente-subtitulo');
const modalClienteConteudo = document.getElementById('modal-cliente-conteudo');

function fecharModalCliente() {
    modalCliente.style.display = 'none';
}

document.getElementById('btn-fechar-modal-cliente').addEventListener('click', fecharModalCliente);
document.getElementById('btn-fechar-modal-cliente-rodape').addEventListener('click', fecharModalCliente);
modalCliente.addEventListener('click', (e) => {
    if (e.target === modalCliente) fecharModalCliente();
});

function abrirExtratoCliente(cliente) {
    const contratosDoCliente = contratos.filter(c => c.clienteId === cliente.id);

    modalClienteTitulo.textContent = `Extrato do Cliente — ${cliente.nome}`;
    modalClienteSubtitulo.textContent = `CPF: ${mascararCPF(cliente.cpf)} • WhatsApp: ${formatarTelefone(cliente.whatsapp)}`;
    modalClienteConteudo.innerHTML = '';

    const boxEndereco = document.createElement('div');
    boxEndereco.style.backgroundColor = '#F8FAFC';
    boxEndereco.style.border = '1px solid #E2E8F0';
    boxEndereco.style.borderRadius = '8px';
    boxEndereco.style.padding = '14px';
    boxEndereco.style.marginBottom = '18px';
    boxEndereco.style.fontSize = '0.9rem';

    const tituloEnd = document.createElement('strong');
    tituloEnd.style.display = 'block';
    tituloEnd.style.marginBottom = '6px';
    tituloEnd.style.color = '#0F172A';
    tituloEnd.textContent = 'Endereço Residencial Cadastrado';

    const textoEnd = document.createElement('p');
    textoEnd.style.margin = '0';
    textoEnd.style.color = '#334155';
    textoEnd.textContent = formatarEnderecoCompleto(cliente);

    boxEndereco.appendChild(tituloEnd);
    boxEndereco.appendChild(textoEnd);
    modalClienteConteudo.appendChild(boxEndereco);

    const tituloContratos = document.createElement('strong');
    tituloContratos.style.display = 'block';
    tituloContratos.style.marginBottom = '10px';
    tituloContratos.style.color = '#0F172A';
    tituloContratos.textContent = `Histórico Independente de Empréstimos Solicitados (${contratosDoCliente.length})`;
    modalClienteConteudo.appendChild(tituloContratos);

    if (contratosDoCliente.length === 0) {
        const pSemContratos = document.createElement('p');
        pSemContratos.style.color = 'var(--text-muted)';
        pSemContratos.style.textAlign = 'center';
        pSemContratos.style.padding = '16px 0';
        pSemContratos.textContent = 'Este cliente ainda não solicitou nenhum empréstimo.';
        modalClienteConteudo.appendChild(pSemContratos);
    } else {
        const tabela = document.createElement('table');
        tabela.innerHTML = `
            <thead>
                <tr>
                    <th>Contrato</th>
                    <th>Plano</th>
                    <th>Capital Base</th>
                    <th>Total c/ Juros</th>
                    <th>Parcelas</th>
                    <th>Situação</th>
                </tr>
            </thead>
        `;
        const tbody = document.createElement('tbody');

        contratosDoCliente.forEach((c) => {
            const pagas = c.parcelasPagas || 0;
            const ehUnificado = (c.status || 'ativo') === 'unificado';
            const quitado = pagas >= c.parcelas;
            const infoVenc = calcularProximoVencimento(c.dataPrimeiroVencimento, pagas);
            const atrasado = !ehUnificado && !quitado && infoVenc.atrasado;

            const tr = document.createElement('tr');

            const tdId = document.createElement('td');
            tdId.style.fontWeight = '600';
            tdId.textContent = `#CTR-${String(c.id).padStart(4, '0')}`;
            if (c.contratoOrigemId) {
                const tagOrigem = document.createElement('div');
                tagOrigem.style.fontSize = '0.72rem';
                tagOrigem.style.color = '#2563EB';
                tagOrigem.textContent = `(Unificou #CTR-${String(c.contratoOrigemId).padStart(4, '0')})`;
                tdId.appendChild(tagOrigem);
            }

            const tdPlano = document.createElement('td');
            tdPlano.textContent = `${c.plano} (${c.taxa}% a.m.)`;

            const tdBase = document.createElement('td');
            tdBase.textContent = formatarMoeda(c.valorBase);

            const tdTotal = document.createElement('td');
            tdTotal.textContent = formatarMoeda(c.valorTotal);

            const tdParcelas = document.createElement('td');
            tdParcelas.textContent = `${pagas}/${c.parcelas} (${formatarMoeda(c.valorParcela)})`;

            const tdStatus = document.createElement('td');
            const badge = document.createElement('span');
            if (ehUnificado) {
                badge.className = 'status-badge';
                badge.style.backgroundColor = '#E0E7FF';
                badge.style.color = '#3730A3';
                badge.textContent = 'Unificado';
            } else if (quitado) {
                badge.className = 'status-badge status-quitado';
                badge.textContent = 'Quitado';
            } else if (atrasado) {
                badge.className = 'status-badge status-atrasado';
                badge.textContent = 'Atrasado';
            } else {
                badge.className = 'status-badge status-ativo';
                badge.textContent = 'Em Dia';
            }
            tdStatus.appendChild(badge);

            tr.appendChild(tdId);
            tr.appendChild(tdPlano);
            tr.appendChild(tdBase);
            tr.appendChild(tdTotal);
            tr.appendChild(tdParcelas);
            tr.appendChild(tdStatus);
            tbody.appendChild(tr);
        });

        tabela.appendChild(tbody);
        modalClienteConteudo.appendChild(tabela);
    }

    modalCliente.style.display = 'flex';
}

inputClienteCpf.addEventListener('input', (evento) => {
    let digitos = evento.target.value.replace(/\D/g, '').slice(0, 11);

    if (digitos.length > 9) {
        evento.target.value = `${digitos.slice(0, 3)}.${digitos.slice(3, 6)}.${digitos.slice(6, 9)}.${digitos.slice(9, 11)}`;
    } else if (digitos.length > 6) {
        evento.target.value = `${digitos.slice(0, 3)}.${digitos.slice(3, 6)}.${digitos.slice(6)}`;
    } else if (digitos.length > 3) {
        evento.target.value = `${digitos.slice(0, 3)}.${digitos.slice(3)}`;
    } else {
        evento.target.value = digitos;
    }
});

function aplicarMascaraWhatsapp(valorBruto) {
    let digitos = valorBruto.replace(/\D/g, '');

    if (digitos.length === 0) return '';

    if (!digitos.startsWith('55')) {
        digitos = '55' + digitos;
    }

    digitos = digitos.slice(0, 13);

    const ddd = digitos.slice(2, 4);
    const numero = digitos.slice(4);

    if (digitos.length <= 2) {
        return '+55(';
    } else if (digitos.length <= 4) {
        return `+55(${ddd}`;
    } else {
        return `+55(${ddd})${numero}`;
    }
}

inputClienteWhatsapp.addEventListener('focus', (evento) => {
    if (!evento.target.value) {
        evento.target.value = '+55(';
    }
});

inputClienteWhatsapp.addEventListener('blur', (evento) => {
    if (evento.target.value === '+55(' || evento.target.value === '+55') {
        evento.target.value = '';
    }
});

inputClienteWhatsapp.addEventListener('input', (evento) => {
    evento.target.value = aplicarMascaraWhatsapp(evento.target.value);
});

inputClienteCep.addEventListener('input', async (evento) => {
    const digitos = evento.target.value.replace(/\D/g, '').slice(0, 8);
    evento.target.value = digitos.length > 5
        ? `${digitos.slice(0, 5)}-${digitos.slice(5)}`
        : digitos;

    if (digitos.length === 8) {
        try {
            const resp = await fetch(`https://viacep.com.br/ws/${digitos}/json/`);
            const dados = await resp.json();
            if (!dados.erro) {
                if (dados.logradouro) inputClienteRua.value = dados.logradouro;
                if (dados.bairro) inputClienteBairro.value = dados.bairro;
                if (dados.localidade) inputClienteCidade.value = dados.localidade;
                if (dados.uf) inputClienteUf.value = dados.uf;
                inputClienteNumero.focus();
            }
        } catch (e) {
            // Preenchimento manual caso offline
        }
    }
});

inputClienteUf.addEventListener('input', (evento) => {
    evento.target.value = evento.target.value.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 2);
});

function atualizarClientesNaTela() {
    tabelaClientes.innerHTML = '';
    selectClienteContrato.innerHTML = '';

    const termoBusca = inputBuscaCliente.value.toLowerCase().trim();
    const termoDigitos = termoBusca.replace(/\D/g, '');

    if (clientes.length === 0) {
        const optionVazio = document.createElement('option');
        optionVazio.value = '';
        optionVazio.textContent = 'Nenhum cliente cadastrado (Vá na aba Clientes)';
        selectClienteContrato.appendChild(optionVazio);
    }

    clientes.forEach((cliente) => {
        const option = document.createElement('option');
        option.value = cliente.id;
        option.textContent = `${cliente.nome} (${mascararCPF(cliente.cpf)})`;
        selectClienteContrato.appendChild(option);
    });

    const clientesFiltrados = clientes.filter((cliente) => {
        if (!termoBusca) return true;
        const bateNome = cliente.nome.toLowerCase().includes(termoBusca);
        const bateCpf = termoDigitos.length > 0 && String(cliente.cpf).includes(termoDigitos);
        return bateNome || bateCpf;
    });

    if (clientesFiltrados.length === 0) {
        const trVazio = document.createElement('tr');
        const tdVazio = document.createElement('td');
        tdVazio.colSpan = 5;
        tdVazio.style.textAlign = 'center';
        tdVazio.style.color = 'var(--text-muted)';
        tdVazio.style.padding = '18px';
        tdVazio.textContent = termoBusca
            ? 'Nenhum cliente encontrado com esse nome ou CPF.'
            : 'Nenhum cliente cadastrado ainda.';
        trVazio.appendChild(tdVazio);
        tabelaClientes.appendChild(trVazio);
        return;
    }

    clientesFiltrados.forEach((cliente) => {
        const tr = document.createElement('tr');

        const tdNome = document.createElement('td');
        tdNome.textContent = cliente.nome;

        const tdCpf = document.createElement('td');
        tdCpf.textContent = mascararCPF(cliente.cpf);

        const tdWhatsapp = document.createElement('td');
        tdWhatsapp.textContent = formatarTelefone(cliente.whatsapp);

        const tdEndereco = document.createElement('td');
        tdEndereco.textContent = formatarEnderecoCompleto(cliente);
        tdEndereco.style.fontSize = '0.85rem';

        const tdAcao = document.createElement('td');
        tdAcao.className = 'acoes-cell';

        const btnExtrato = document.createElement('button');
        btnExtrato.className = 'btn-extrato';
        btnExtrato.textContent = 'Extrato';
        btnExtrato.title = 'Ver endereço completo e empréstimos do cliente';
        btnExtrato.onclick = () => abrirExtratoCliente(cliente);

        const btnExcluir = document.createElement('button');
        btnExcluir.className = 'btn-danger';
        btnExcluir.textContent = 'Excluir';
        btnExcluir.onclick = () => excluirCliente(cliente.id);

        tdAcao.appendChild(btnExtrato);
        tdAcao.appendChild(btnExcluir);

        tr.appendChild(tdNome);
        tr.appendChild(tdCpf);
        tr.appendChild(tdWhatsapp);
        tr.appendChild(tdEndereco);
        tr.appendChild(tdAcao);

        tabelaClientes.appendChild(tr);
    });
}

inputBuscaCliente.addEventListener('input', atualizarClientesNaTela);

async function excluirCliente(idCliente) {
    if (!confirm('Deseja realmente excluir este cliente?')) return;
    try {
        await requisicaoAPI(`/clientes/${idCliente}`, { method: 'DELETE' });
        await carregarTodosOsDados();
    } catch (erro) {
        alert(erro.message);
    }
}

formCliente.addEventListener('submit', async (evento) => {
    evento.preventDefault();

    const nome = document.getElementById('cliente-nome').value.trim();
    const cpf = inputClienteCpf.value.replace(/\D/g, '');
    let whatsapp = inputClienteWhatsapp.value.replace(/\D/g, '');

    const cep = inputClienteCep.value.replace(/\D/g, '');
    const rua = inputClienteRua.value.trim();
    const numero = inputClienteNumero.value.trim();
    const complemento = inputClienteComplemento.value.trim();
    const bairro = inputClienteBairro.value.trim();
    const cidade = inputClienteCidade.value.trim();
    const uf = inputClienteUf.value.trim().toUpperCase();

    if (cpf.length !== 11) {
        alert('O CPF deve conter exatamente 11 dígitos (000.000.000.00).');
        inputClienteCpf.focus();
        return;
    }

    if (whatsapp.startsWith('55')) {
        whatsapp = whatsapp.slice(2);
    }

    if (whatsapp.length < 10 || whatsapp.length > 11) {
        alert('O WhatsApp deve seguir o padrão completo +55(DDD)900000000.');
        inputClienteWhatsapp.focus();
        return;
    }

    if (cep.length !== 8 || !rua || !numero || !bairro || !cidade || uf.length !== 2) {
        alert('Preencha o endereço completo (CEP com 8 dígitos, Rua, Número, Bairro, Cidade e UF).');
        inputClienteCep.focus();
        return;
    }

    try {
        await requisicaoAPI('/clientes', {
            method: 'POST',
            body: JSON.stringify({ nome, cpf, whatsapp, cep, rua, numero, complemento, bairro, cidade, uf })
        });
        formCliente.reset();
        await carregarTodosOsDados();
        alert('Cliente salvo no banco de dados com sucesso!');
    } catch (erro) {
        alert(erro.message);
    }
});

// ==========================================
// 4. MÓDULO DE PLANOS E TAXAS
// ==========================================
const formPlano = document.getElementById('form-plano');
const tabelaPlanos = document.getElementById('tabela-planos');
const selectPlanoEmprestimo = document.getElementById('plano-nome');
const inputValorEmprestimo = document.getElementById('valor-emprestimo');
const inputNovoPlanoValor = document.getElementById('novo-plano-valor');

inputNovoPlanoValor.addEventListener('input', (evento) => {
    evento.target.value = aplicarMascaraMoedaInput(evento.target.value);
});

inputValorEmprestimo.addEventListener('input', (evento) => {
    evento.target.value = aplicarMascaraMoedaInput(evento.target.value);
});

function preencherValorDoPlanoSelecionado() {
    const planoId = parseInt(selectPlanoEmprestimo.value);
    const planoEncontrado = planos.find(p => p.id === planoId);
    if (planoEncontrado && planoEncontrado.valor > 0) {
        inputValorEmprestimo.value = formatarMoeda(planoEncontrado.valor);
    }
}

selectPlanoEmprestimo.addEventListener('change', preencherValorDoPlanoSelecionado);

function atualizarPlanosNaTela() {
    tabelaPlanos.innerHTML = '';
    selectPlanoEmprestimo.innerHTML = '';

    planos.forEach((plano) => {
        const valorPlano = Number(plano.valor || 0);
        const option = document.createElement('option');
        option.value = plano.id;
        option.textContent = valorPlano > 0
            ? `${plano.nome} — ${formatarMoeda(valorPlano)} (${plano.taxa}% a.m. em ${plano.parcelas}x)`
            : `${plano.nome} (${plano.taxa}% a.m. em ${plano.parcelas}x)`;
        selectPlanoEmprestimo.appendChild(option);

        const tr = document.createElement('tr');

        const tdNome = document.createElement('td');
        tdNome.textContent = plano.nome;

        const tdValor = document.createElement('td');
        tdValor.textContent = valorPlano > 0 ? formatarMoeda(valorPlano) : 'Livre';

        const tdTaxa = document.createElement('td');
        tdTaxa.textContent = `${plano.taxa}% ao mês`;

        const tdParcelas = document.createElement('td');
        tdParcelas.textContent = `${plano.parcelas}x`;

        const tdAcao = document.createElement('td');
        const btnExcluir = document.createElement('button');
        btnExcluir.className = 'btn-danger';
        btnExcluir.textContent = 'Excluir';
        btnExcluir.onclick = () => excluirPlano(plano.id);

        tdAcao.appendChild(btnExcluir);
        tr.appendChild(tdNome);
        tr.appendChild(tdValor);
        tr.appendChild(tdTaxa);
        tr.appendChild(tdParcelas);
        tr.appendChild(tdAcao);

        tabelaPlanos.appendChild(tr);
    });

    preencherValorDoPlanoSelecionado();
}

async function excluirPlano(idPlano) {
    if (!confirm('Tem certeza que deseja excluir este plano?')) return;
    try {
        await requisicaoAPI(`/planos/${idPlano}`, { method: 'DELETE' });
        await carregarTodosOsDados();
    } catch (erro) {
        alert(erro.message);
    }
}

formPlano.addEventListener('submit', async (evento) => {
    evento.preventDefault();

    const nome = document.getElementById('novo-plano-nome').value.trim();
    const valor = converterMoedaParaNumero(inputNovoPlanoValor.value);
    const taxa = parseFloat(document.getElementById('novo-plano-taxa').value);
    const parcelas = parseInt(document.getElementById('novo-plano-parcelas').value);

    if (isNaN(valor) || valor < 0) {
        alert('Informe um valor válido para o plano (Ex: R$ 1.100,00).');
        inputNovoPlanoValor.focus();
        return;
    }

    try {
        await requisicaoAPI('/planos', {
            method: 'POST',
            body: JSON.stringify({ nome, valor, taxa, parcelas })
        });
        formPlano.reset();
        await carregarTodosOsDados();
        alert('Plano salvo no banco de dados com sucesso!');
    } catch (erro) {
        alert(erro.message);
    }
});

// ==========================================
// 5. MÓDULO DE EMPRÉSTIMOS, UNIFICAÇÃO (VALORES + TAXAS), REVISÃO DE TAXA E RECIBOS
// ==========================================
const formEmprestimo = document.getElementById('form-emprestimo');
const tabelaContratos = document.getElementById('tabela-contratos');
const inputBuscaContrato = document.getElementById('busca-contrato');
const elTotalEmprestado = document.getElementById('total-emprestado');
const elTotalRecebido = document.getElementById('total-recebido');
const elTotalReceber = document.getElementById('total-receber');
const elLucroGeral = document.getElementById('lucro-geral');
const inputDataVencimento = document.getElementById('data-vencimento');

const inputFiltroMesExtrato = document.getElementById('filtro-mes-extrato');
const elMesTotalRecebido = document.getElementById('mes-total-recebido');
const elMesCapitalRecuperado = document.getElementById('mes-capital-recuperado');
const elMesLucroLiquido = document.getElementById('mes-lucro-liquido');
const tabelaExtratoMensal = document.getElementById('tabela-extrato-mensal');

function definirDataPadraoFormulario() {
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = String(hoje.getMonth() + 1).padStart(2, '0');
    const dia = String(hoje.getDate()).padStart(2, '0');
    inputDataVencimento.value = `${ano}-${mes}-${dia}`;

    if (!inputFiltroMesExtrato.value) {
        inputFiltroMesExtrato.value = `${ano}-${mes}`;
    }
}
definirDataPadraoFormulario();

function atualizarExtratoMensal() {
    const mesSelecionado = inputFiltroMesExtrato.value;
    tabelaExtratoMensal.innerHTML = '';

    const movimentacoesDoMes = pagamentosGerais.filter((pag) => {
        if (!pag.dataPagamento) return false;
        return pag.dataPagamento.startsWith(mesSelecionado);
    });

    let recebidoMes = 0;
    let capitalMes = 0;
    let lucroMes = 0;

    if (movimentacoesDoMes.length === 0) {
        const trVazio = document.createElement('tr');
        const tdVazio = document.createElement('td');
        tdVazio.colSpan = 6;
        tdVazio.style.textAlign = 'center';
        tdVazio.style.color = 'var(--text-muted)';
        tdVazio.style.padding = '18px';
        tdVazio.textContent = 'Nenhum pagamento registrado no mês selecionado.';
        trVazio.appendChild(tdVazio);
        tabelaExtratoMensal.appendChild(trVazio);
    } else {
        movimentacoesDoMes.forEach((pag) => {
            const capitalParcela = pag.valorBase / pag.parcelasTotais;
            const lucroParcela = Math.max(0, pag.valorPago - capitalParcela);

            recebidoMes += pag.valorPago;
            capitalMes += capitalParcela;
            lucroMes += lucroParcela;

            const tr = document.createElement('tr');

            const tdData = document.createElement('td');
            tdData.textContent = formatarDataHoraSQLite(pag.dataPagamento);

            const tdContrato = document.createElement('td');
            tdContrato.style.fontWeight = '600';
            tdContrato.textContent = `#CTR-${String(pag.contratoId).padStart(4, '0')}`;

            const tdCliente = document.createElement('td');
            tdCliente.textContent = pag.cliente;

            const tdParcela = document.createElement('td');
            tdParcela.textContent = `${pag.numeroParcela}ª de ${pag.parcelasTotais}`;

            const tdValor = document.createElement('td');
            tdValor.textContent = formatarMoeda(pag.valorPago);

            const tdLucro = document.createElement('td');
            tdLucro.style.color = '#059669';
            tdLucro.style.fontWeight = '600';
            tdLucro.textContent = `+ ${formatarMoeda(lucroParcela)}`;

            tr.appendChild(tdData);
            tr.appendChild(tdContrato);
            tr.appendChild(tdCliente);
            tr.appendChild(tdParcela);
            tr.appendChild(tdValor);
            tr.appendChild(tdLucro);

            tabelaExtratoMensal.appendChild(tr);
        });
    }

    elMesTotalRecebido.textContent = formatarMoeda(recebidoMes);
    elMesCapitalRecuperado.textContent = formatarMoeda(capitalMes);
    elMesLucroLiquido.textContent = formatarMoeda(lucroMes);
}

inputFiltroMesExtrato.addEventListener('change', atualizarExtratoMensal);

function calcularProximoVencimento(dataInicialISO, parcelasPagas) {
    const [ano, mes, dia] = dataInicialISO.split('-').map(Number);
    const data = new Date(ano, mes - 1 + parcelasPagas, dia);

    if (data.getDate() !== dia) {
        data.setDate(0);
    }

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const atrasado = data < hoje;
    const dataFormatada = data.toLocaleDateString('pt-BR');

    return { dataFormatada, atrasado };
}

async function registrarPagamentoParcela(idContrato) {
    try {
        await requisicaoAPI(`/contratos/${idContrato}/pagar-parcela`, { method: 'PATCH' });
        await carregarTodosOsDados();
    } catch (erro) {
        alert(erro.message);
    }
}

// ==========================================
// 5.1 MODAL DE AUDITORIA E EXTRATO DE RECIBOS
// ==========================================
const modalHistorico = document.getElementById('modal-historico');
const modalTituloCliente = document.getElementById('modal-titulo-cliente');
const modalSubtituloContrato = document.getElementById('modal-subtitulo-contrato');
const modalConteudoPagamentos = document.getElementById('modal-conteudo-pagamentos');
const btnEstornarUltima = document.getElementById('btn-estornar-ultima');

let contratoSendoAuditado = null;

function fecharModalHistorico() {
    modalHistorico.style.display = 'none';
    contratoSendoAuditado = null;
}

document.getElementById('btn-fechar-modal').addEventListener('click', fecharModalHistorico);
document.getElementById('btn-fechar-modal-rodape').addEventListener('click', fecharModalHistorico);
modalHistorico.addEventListener('click', (e) => {
    if (e.target === modalHistorico) fecharModalHistorico();
});

async function abrirHistoricoPagamentos(contrato) {
    contratoSendoAuditado = contrato;
    modalTituloCliente.textContent = `Extrato — ${contrato.cliente}`;
    modalSubtituloContrato.textContent = `${contrato.plano} • ${contrato.parcelasPagas} de ${contrato.parcelas} parcelas pagas`;
    modalConteudoPagamentos.innerHTML = '<p style="color: var(--text-muted);">Carregando recibos...</p>';
    btnEstornarUltima.style.display = 'none';
    modalHistorico.style.display = 'flex';

    try {
        const pagamentos = await requisicaoAPI(`/contratos/${contrato.id}/pagamentos`);
        modalConteudoPagamentos.innerHTML = '';

        if (pagamentos.length === 0) {
            const pVazio = document.createElement('p');
            pVazio.style.color = 'var(--text-muted)';
            pVazio.style.textAlign = 'center';
            pVazio.style.padding = '20px 0';
            pVazio.textContent = 'Nenhuma parcela paga registrada neste contrato ainda.';
            modalConteudoPagamentos.appendChild(pVazio);
            return;
        }

        if ((contrato.status || 'ativo') !== 'unificado') {
            btnEstornarUltima.style.display = 'inline-block';
        }

        const tabela = document.createElement('table');
        tabela.innerHTML = `
            <thead>
                <tr>
                    <th>Protocolo</th>
                    <th>Parcela</th>
                    <th>Valor Pago</th>
                    <th>Data/Hora</th>
                </tr>
            </thead>
        `;
        const tbody = document.createElement('tbody');

        pagamentos.forEach((pag) => {
            const tr = document.createElement('tr');
            const protocolo = `#REC-${String(pag.id).padStart(4, '0')}`;
            const dataFormatada = formatarDataHoraSQLite(pag.dataPagamento);

            const tdProt = document.createElement('td');
            tdProt.style.fontWeight = '600';
            tdProt.textContent = protocolo;

            const tdParc = document.createElement('td');
            tdParc.textContent = `${pag.numeroParcela}ª de ${contrato.parcelas}`;

            const tdValor = document.createElement('td');
            tdValor.textContent = formatarMoeda(pag.valorPago);

            const tdData = document.createElement('td');
            tdData.textContent = dataFormatada;

            tr.appendChild(tdProt);
            tr.appendChild(tdParc);
            tr.appendChild(tdValor);
            tr.appendChild(tdData);
            tbody.appendChild(tr);
        });

        tabela.appendChild(tbody);
        modalConteudoPagamentos.appendChild(tabela);
    } catch (erro) {
        modalConteudoPagamentos.textContent = erro.message;
    }
}

btnEstornarUltima.addEventListener('click', async () => {
    if (!contratoSendoAuditado) return;
    if (!confirm(`Deseja realmente estornar (desfazer) a ${contratoSendoAuditado.parcelasPagas}ª parcela de ${contratoSendoAuditado.cliente}?`)) {
        return;
    }

    try {
        await requisicaoAPI(`/contratos/${contratoSendoAuditado.id}/estornar-ultima`, { method: 'DELETE' });
        await carregarTodosOsDados();
        const contratoAtualizado = contratos.find(c => c.id === contratoSendoAuditado.id);
        if (contratoAtualizado) {
            await abrirHistoricoPagamentos(contratoAtualizado);
        } else {
            fecharModalHistorico();
        }
    } catch (erro) {
        alert(erro.message);
    }
});

// ==========================================
// 5.2 MODAL DE REVISÃO MANUAL DE TAXA
// ==========================================
const modalRevisarTaxa = document.getElementById('modal-revisar-taxa');
const modalTaxaTitulo = document.getElementById('modal-taxa-titulo');
const modalTaxaSubtitulo = document.getElementById('modal-taxa-subtitulo');
const inputNovaTaxaContrato = document.getElementById('input-nova-taxa-contrato');
const boxSimulacaoTaxa = document.getElementById('simulacao-nova-taxa');
const formRevisarTaxa = document.getElementById('form-revisar-taxa');

let contratoRevisandoTaxa = null;

function fecharModalRevisarTaxa() {
    modalRevisarTaxa.style.display = 'none';
    contratoRevisandoTaxa = null;
}

document.getElementById('btn-fechar-modal-taxa').addEventListener('click', fecharModalRevisarTaxa);
document.getElementById('btn-cancelar-taxa').addEventListener('click', fecharModalRevisarTaxa);
modalRevisarTaxa.addEventListener('click', (e) => {
    if (e.target === modalRevisarTaxa) fecharModalRevisarTaxa();
});

function atualizarSimulacaoNovaTaxa() {
    if (!contratoRevisandoTaxa) return;
    const novaTaxa = parseFloat(inputNovaTaxaContrato.value);
    if (isNaN(novaTaxa) || novaTaxa < 0) {
        boxSimulacaoTaxa.textContent = 'Digite uma taxa válida para visualizar o recálculo.';
        return;
    }

    const base = contratoRevisandoTaxa.valorBase;
    const parcelas = contratoRevisandoTaxa.parcelas;
    const juros = base * (novaTaxa / 100) * parcelas;
    const total = base + juros;
    const parcela = total / parcelas;

    boxSimulacaoTaxa.innerHTML = `
        <div style="margin-bottom: 4px;"><strong>Capital Base Consolidado:</strong> ${formatarMoeda(base)}</div>
        <div style="margin-bottom: 4px;"><strong>Novo Valor Total (${parcelas}x):</strong> ${formatarMoeda(total)}</div>
        <div style="color: #059669; font-weight: 600;"><strong>Nova Parcela Mensal:</strong> ${formatarMoeda(parcela)}</div>
    `;
}

inputNovaTaxaContrato.addEventListener('input', atualizarSimulacaoNovaTaxa);

function abrirModalRevisarTaxa(contrato) {
    contratoRevisandoTaxa = contrato;
    modalTaxaTitulo.textContent = `Revisar Taxa — #CTR-${String(contrato.id).padStart(4, '0')}`;
    modalTaxaSubtitulo.textContent = `${contrato.cliente} • Taxa atual: ${contrato.taxa}% a.m.`;
    inputNovaTaxaContrato.value = contrato.taxa;
    atualizarSimulacaoNovaTaxa();
    modalRevisarTaxa.style.display = 'flex';
}

formRevisarTaxa.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (!contratoRevisandoTaxa) return;

    const novaTaxa = parseFloat(inputNovaTaxaContrato.value);
    try {
        await requisicaoAPI(`/contratos/${contratoRevisandoTaxa.id}/revisar-taxa`, {
            method: 'PATCH',
            body: JSON.stringify({ novaTaxa })
        });
        fecharModalRevisarTaxa();
        await carregarTodosOsDados();
        alert('Taxa revisada e valores do contrato recalculados com sucesso!');
    } catch (erro) {
        alert(erro.message);
    }
});

// ==========================================
// 5.3 GERADOR DE CONTRATO E DEMONSTRATIVO EM PDF (FORMAL)
// ==========================================
async function gerarContratoPDF(contrato) {
    if (!window.jspdf) {
        alert('Biblioteca de PDF não encontrada. Verifique se o arquivo js/jspdf.umd.min.js existe.');
        return;
    }

    let historicoPagamentos = [];
    try {
        historicoPagamentos = await requisicaoAPI(`/contratos/${contrato.id}/pagamentos`);
    } catch (erro) {
        console.warn('Não foi possível carregar detalhes de pagamento para o PDF:', erro.message);
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    const pagas = contrato.parcelasPagas || 0;
    const valorJaPago = pagas * contrato.valorParcela;
    const saldoRestante = Math.max(0, contrato.valorTotal - valorJaPago);
    const ehUnificado = (contrato.status || 'ativo') === 'unificado';
    const quitado = pagas >= contrato.parcelas;
    const infoVencimento = calcularProximoVencimento(contrato.dataPrimeiroVencimento, pagas);

    // Regra de multa: 10% sobre o valor liberado para planos de 12x ou 18x; 5% para os demais
    const ehPlanoLongaDuracao = Number(contrato.parcelas) === 12 || Number(contrato.parcelas) === 18;
    const percentualMultaAtraso = ehPlanoLongaDuracao ? 10 : 5;
    const percentualMultaExtenso = ehPlanoLongaDuracao ? 'dez por cento' : 'cinco por cento';

    const valorMultaAtraso = contrato.valorBase * (percentualMultaAtraso / 100);
    const valorJurosDiarioAtraso = contrato.valorBase * 0.02;

    const statusTexto = ehUnificado
        ? 'UNIFICADO EM NOVO INSTRUMENTO'
        : (quitado ? 'QUITADO INTEGRALMENTE' : (infoVencimento.atrasado ? 'INADIMPLENTE (EM ATRASO)' : 'REGULAR / EM DIA'));

    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, 210, 28, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text('CREDCONTROL — GESTÃO FINANCEIRA E CRÉDITO', 14, 12);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text('INSTRUMENTO PARTICULAR DE CONFISSÃO DE DÍVIDA E MÚTUO FINANCEIRO', 14, 19);
    doc.text('DOCUMENTO COM FORÇA DE TÍTULO EXECUTIVO EXTRAJUDICIAL', 14, 24);

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.text(`CONTRATO Nº #CTR-${String(contrato.id).padStart(4, '0')}`, 152, 12);
    doc.setFont('helvetica', 'normal');
    doc.text(`Data de Emissão: ${new Date().toLocaleDateString('pt-BR')}`, 152, 18);

    // TÓPICO 1
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('1. QUALIFICAÇÃO DAS PARTES E IDENTIFICAÇÃO DO(A) CONTRATANTE', 14, 36);

    doc.setDrawColor(203, 213, 225);
    doc.line(14, 38, 196, 38);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('CREDORA: CREDCONTROL ADMINISTRAÇÃO E GESTÃO DE CRÉDITO, doravante denominada simplesmente CREDORA.', 14, 43.5);
    doc.text(`MUTUÁRIO(A) / CONTRATANTE: ${contrato.cliente}`, 14, 49);
    doc.text(`CPF (Proteção de Dados - LGPD): ${mascararCPF(contrato.cpf)}`, 14, 54.5);
    doc.text(`Contato Oficial (WhatsApp): ${formatarTelefone(contrato.whatsapp)}`, 115, 54.5);

    const enderecoFormatado = formatarEnderecoCompleto(contrato);
    const linhasEndereco = doc.splitTextToSize(`Domicílio / Endereço Residencial: ${enderecoFormatado}`, 182);
    doc.text(linhasEndereco, 14, 60);

    const offsetEndereco = linhasEndereco.length > 1 ? 5 : 0;

    // TÓPICO 2
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('2. OBJETO E CONDIÇÕES FINANCEIRAS PACTUADAS', 14, 69 + offsetEndereco);
    doc.line(14, 71 + offsetEndereco, 196, 71 + offsetEndereco);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`Modalidade / Plano Contratado: ${contrato.plano} — Taxa Remuneratória: ${contrato.taxa}% ao mês`, 14, 76.5 + offsetEndereco);
    doc.text(`Valor Principal Emprestado: ${formatarMoeda(contrato.valorBase)}`, 14, 82 + offsetEndereco);
    doc.text(`Montante Total Pactuado: ${formatarMoeda(contrato.valorTotal)}`, 115, 82 + offsetEndereco);
    doc.text(`Forma de Amortização: ${contrato.parcelas} parcela(s) mensal(is) e sucessiva(s) de ${formatarMoeda(contrato.valorParcela)} cada.`, 14, 87.5 + offsetEndereco);

    let offsetObs = 0;
    if (contrato.observacao) {
        doc.setFontSize(8.5);
        doc.setTextColor(37, 99, 235);
        const linhasObs = doc.splitTextToSize(`Registro de Novação / Observação: ${contrato.observacao}`, 182);
        doc.text(linhasObs, 14, 92.5 + offsetEndereco);
        doc.setTextColor(15, 23, 42);
        offsetObs = linhasObs.length * 4.5;
    }

    // TÓPICO 3
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('3. DEMONSTRATIVO DE AMORTIZAÇÃO E CRONOGRAMA DE VENCIMENTOS', 14, 97 + offsetEndereco + offsetObs);
    doc.line(14, 99 + offsetEndereco + offsetObs, 196, 99 + offsetEndereco + offsetObs);

    doc.setFillColor(248, 250, 252);
    doc.rect(14, 102 + offsetEndereco + offsetObs, 182, 20, 'F');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`Parcelas Quitadas: ${pagas} de ${contrato.parcelas} (${formatarMoeda(valorJaPago)})`, 18, 108 + offsetEndereco + offsetObs);
    doc.text(`Parcelas Vincendas: ${Math.max(0, contrato.parcelas - pagas)} parcela(s)`, 125, 108 + offsetEndereco + offsetObs);

    doc.setFont('helvetica', 'bold');
    doc.text(`Saldo Devedor Atualizado: ${ehUnificado ? 'R$ 0,00 (Transferido via Unificação)' : formatarMoeda(saldoRestante)}`, 18, 114 + offsetEndereco + offsetObs);
    doc.text(`Status Contratual: ${statusTexto}`, 125, 114 + offsetEndereco + offsetObs);
    doc.setFont('helvetica', 'normal');
    doc.text(`Próximo Vencimento Previsto: ${ehUnificado || quitado ? 'Não aplicável (Encerrado)' : infoVencimento.dataFormatada}`, 18, 119.5 + offsetEndereco + offsetObs);

    let y = 130 + offsetEndereco + offsetObs;

    doc.setFillColor(226, 232, 240);
    doc.rect(14, y - 4.5, 182, 6.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text('PARCELA', 18, y);
    doc.text('VALOR NOMINAL', 52, y);
    doc.text('DATA DE VENCIMENTO / QUITAÇÃO', 95, y);
    doc.text('SITUAÇÃO', 165, y);

    y += 6;

    for (let i = 1; i <= contrato.parcelas; i++) {
        if (y > 272) {
            doc.addPage();
            y = 18;
        }

        const foiPaga = i <= pagas;

        if (foiPaga) {
            const registroPago = historicoPagamentos.find(p => p.numeroParcela === i);
            const dataPgtoTexto = registroPago
                ? `Quitada em ${formatarDataHoraSQLite(registroPago.dataPagamento)}`
                : 'Quitação Confirmada';

            doc.setFont('helvetica', 'normal');
            doc.setTextColor(6, 95, 70);
            doc.text(`${i}ª de ${contrato.parcelas}`, 18, y);
            doc.text(formatarMoeda(contrato.valorParcela), 52, y);
            doc.text(dataPgtoTexto, 95, y);
            doc.setFont('helvetica', 'bold');
            doc.text('Quitada', 165, y);
        } else {
            const vencParcela = calcularProximoVencimento(contrato.dataPrimeiroVencimento, i - 1);
            const statusParcela = ehUnificado ? 'Unificada' : (vencParcela.atrasado ? 'Em Atraso' : 'A Vencer');

            doc.setFont('helvetica', 'normal');
            doc.setTextColor(vencParcela.atrasado && !ehUnificado ? 185 : 30, vencParcela.atrasado && !ehUnificado ? 28 : 41, vencParcela.atrasado && !ehUnificado ? 28 : 59);
            doc.text(`${i}ª de ${contrato.parcelas}`, 18, y);
            doc.text(formatarMoeda(contrato.valorParcela), 52, y);
            doc.text(`Vencimento em ${vencParcela.dataFormatada}`, 95, y);
            doc.setFont('helvetica', 'bold');
            doc.text(statusParcela, 165, y);
        }

        doc.setDrawColor(241, 245, 249);
        doc.line(14, y + 1.5, 196, y + 1.5);
        y += 5.5;
    }

    if (y > 195) {
        doc.addPage();
        y = 18;
    } else {
        y += 6;
    }

    // TÓPICO 4
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('4. CONDIÇÕES E ENCARGOS POR INADIMPLEMENTO (ATRASO)', 14, y);
    doc.setDrawColor(203, 213, 225);
    doc.line(14, y + 2, 196, y + 2);
    y += 7;

    doc.setFillColor(254, 242, 242);
    doc.rect(14, y - 4, 182, 22, 'F');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(30, 41, 59);

    const textoAtraso = `O pontual cumprimento das obrigações nas datas estipuladas constitui condição essencial deste instrumento. Em caso de impontualidade ou atraso no pagamento de qualquer parcela, incidirão automaticamente sobre o débito: (a) Multa moratória irretratável de ${percentualMultaAtraso}% (${percentualMultaExtenso}) calculada sobre o valor emprestado/liberado (${formatarMoeda(valorMultaAtraso)}); acrescida de (b) Juros moratórios de 2% (dois por cento) ao dia sobre o valor emprestado (${formatarMoeda(valorJurosDiarioAtraso)} por dia de atraso), computados desde a data do vencimento até a efetiva e integral quitação da obrigação.`;
    const linhasAtraso = doc.splitTextToSize(textoAtraso, 176);
    doc.text(linhasAtraso, 17, y);

    y += 24;

    // TÓPICO 5
    if (y > 235) {
        doc.addPage();
        y = 18;
    }

    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('5. DISPOSIÇÕES GERAIS, TERMOS E CONCORDÂNCIA', 14, y);
    doc.line(14, y + 2, 196, y + 2);
    y += 7;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(30, 41, 59);
    const termo = 'O(A) CONTRATANTE declara ter lido, compreendido e aceito integralmente todas as cláusulas e condições financeiras estabelecidas neste instrumento, reconhecendo a liquidez, certeza e exigibilidade da obrigação ora assumida, comprometendo-se a honrar rigorosamente os pagamentos pactuados sob pena da incidência dos encargos previstos na Cláusula 4ª e demais medidas legais cabíveis.';
    const linhasTermo = doc.splitTextToSize(termo, 182);
    doc.text(linhasTermo, 14, y);

    y += 24;
    doc.setDrawColor(100, 116, 139);
    doc.line(20, y, 95, y);
    doc.setFont('helvetica', 'bold');
    doc.text('CREDCONTROL — ADMINISTRAÇÃO', 31, y + 4.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text('Credora / Gestão de Crédito', 40, y + 8.5);

    doc.setFontSize(8.5);
    doc.line(115, y, 190, y);
    doc.setFont('helvetica', 'bold');
    doc.text(`${contrato.cliente}`, 120, y + 4.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(`Contratante • CPF: ${mascararCPF(contrato.cpf)}`, 120, y + 8.5);

    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text('Instrumento emitido eletronicamente pelo sistema CredControl • Compromisso, transparência e segurança jurídica.', 14, 288);

    const nomeArquivo = `Contrato_${contrato.cliente.replace(/\s+/g, '_')}_CTR${contrato.id}.pdf`;
    doc.save(nomeArquivo);
}

function atualizarContratosNaTela() {
    tabelaContratos.innerHTML = '';
    const termoBusca = inputBuscaContrato.value.toLowerCase().trim();

    let somaEmprestado = 0;
    let somaRecebido = 0;
    let somaAReceber = 0;
    let somaLucroGeral = 0;

    contratos.forEach((contrato) => {
        const pagas = contrato.parcelasPagas || 0;
        const ehUnificado = (contrato.status || 'ativo') === 'unificado';
        const valorJaPago = pagas * contrato.valorParcela;
        const saldoRestante = ehUnificado ? 0 : Math.max(0, contrato.valorTotal - valorJaPago);

        const capitalPorParcela = contrato.valorBase / contrato.parcelas;
        const lucroPorParcela = Math.max(0, contrato.valorParcela - capitalPorParcela);
        const lucroRealizadoContrato = pagas * lucroPorParcela;

        if (!ehUnificado) {
            somaEmprestado += contrato.valorBase;
        }
        somaRecebido += valorJaPago;
        somaAReceber += saldoRestante;
        somaLucroGeral += lucroRealizadoContrato;

        if (termoBusca && !contrato.cliente.toLowerCase().includes(termoBusca)) {
            return;
        }

        const quitado = pagas >= contrato.parcelas;
        const infoVencimento = calcularProximoVencimento(contrato.dataPrimeiroVencimento, pagas);
        const estaAtrasado = !ehUnificado && !quitado && infoVencimento.atrasado;

        const tr = document.createElement('tr');
        if (ehUnificado) {
            tr.style.opacity = '0.72';
            tr.style.backgroundColor = '#F8FAFC';
        }

        const tdCliente = document.createElement('td');
        const tituloCtr = document.createElement('strong');
        tituloCtr.textContent = `#CTR-${String(contrato.id).padStart(4, '0')} • ${contrato.cliente}`;
        tdCliente.appendChild(tituloCtr);

        if (contrato.contratoOrigemId) {
            const subUnif = document.createElement('div');
            subUnif.style.fontSize = '0.75rem';
            subUnif.style.color = '#2563EB';
            subUnif.textContent = `Unificou #CTR-${String(contrato.contratoOrigemId).padStart(4, '0')} + Novo`;
            tdCliente.appendChild(subUnif);
        }

        const tdPlano = document.createElement('td');
        tdPlano.textContent = `${contrato.plano} (${contrato.taxa}% a.m.)`;

        const tdParcela = document.createElement('td');
        tdParcela.innerHTML = `<strong>${formatarMoeda(contrato.valorTotal)}</strong><div style="font-size:0.78rem; color:#64748B;">${contrato.parcelas}x de ${formatarMoeda(contrato.valorParcela)}</div>`;

        const tdProgresso = document.createElement('td');
        tdProgresso.textContent = `${pagas} de ${contrato.parcelas} pagas`;

        const tdVencimento = document.createElement('td');
        tdVencimento.textContent = (ehUnificado || quitado) ? '—' : infoVencimento.dataFormatada;
        if (estaAtrasado) {
            tdVencimento.style.color = '#B91C1C';
            tdVencimento.style.fontWeight = '600';
        }

        const tdStatus = document.createElement('td');
        const badgeStatus = document.createElement('span');
        if (ehUnificado) {
            badgeStatus.className = 'status-badge';
            badgeStatus.style.backgroundColor = '#E0E7FF';
            badgeStatus.style.color = '#3730A3';
            badgeStatus.textContent = 'Unificado';
        } else if (quitado) {
            badgeStatus.className = 'status-badge status-quitado';
            badgeStatus.textContent = 'Quitado';
        } else if (estaAtrasado) {
            badgeStatus.className = 'status-badge status-atrasado';
            badgeStatus.textContent = 'Atrasado';
        } else {
            badgeStatus.className = 'status-badge status-ativo';
            badgeStatus.textContent = 'Em Dia';
        }
        tdStatus.appendChild(badgeStatus);

        const tdAcao = document.createElement('td');
        tdAcao.className = 'acoes-cell';

        if (!ehUnificado && !quitado) {
            const btnPagar = document.createElement('button');
            btnPagar.className = 'btn-pagar';
            btnPagar.textContent = '+1 Pago';
            btnPagar.title = 'Registrar pagamento de 1 parcela';
            btnPagar.onclick = () => registrarPagamentoParcela(contrato.id);
            tdAcao.appendChild(btnPagar);
        }

        if (!ehUnificado) {
            const btnRevisarTaxa = document.createElement('button');
            btnRevisarTaxa.className = 'btn-extrato';
            btnRevisarTaxa.style.backgroundColor = '#FEF3C7';
            btnRevisarTaxa.style.color = '#92400E';
            btnRevisarTaxa.textContent = 'Revisar Taxa';
            btnRevisarTaxa.title = 'Editar manualmente a taxa de juros deste empréstimo';
            btnRevisarTaxa.onclick = () => abrirModalRevisarTaxa(contrato);
            tdAcao.appendChild(btnRevisarTaxa);
        }

        const btnExtrato = document.createElement('button');
        btnExtrato.className = 'btn-extrato';
        btnExtrato.textContent = 'Extrato';
        btnExtrato.title = 'Ver histórico de recibos e estornar';
        btnExtrato.onclick = () => abrirHistoricoPagamentos(contrato);

        const btnPdf = document.createElement('button');
        btnPdf.className = 'btn-pdf';
        btnPdf.textContent = 'PDF';
        btnPdf.title = 'Baixar Contrato / Demonstrativo em PDF';
        btnPdf.onclick = () => gerarContratoPDF(contrato);

        const linkZap = document.createElement('a');
        linkZap.className = 'btn-whatsapp';
        linkZap.target = '_blank';
        linkZap.rel = 'noopener noreferrer';
        linkZap.textContent = 'WhatsApp';

        const textoStatusZap = ehUnificado
            ? 'UNIFICADO EM NOVO CONTRATO'
            : (quitado ? 'QUITADO ✅' : (estaAtrasado ? `ATRASADO ⚠️ (Venceu em ${infoVencimento.dataFormatada})` : `EM DIA (Próx. vencimento: ${infoVencimento.dataFormatada})`));

        const mensagem = `Olá *${contrato.cliente}*, segue o resumo atualizado do contrato *#CTR-${String(contrato.id).padStart(4, '0')}*:\n\n` +
                         `📋 *Plano:* ${contrato.plano} (${contrato.taxa}% a.m.)\n` +
                         `💳 *Valor da Parcela:* ${formatarMoeda(contrato.valorParcela)}\n` +
                         `📊 *Progresso:* ${pagas} de ${contrato.parcelas} parcelas pagas\n` +
                         `💰 *Saldo Restante:* ${formatarMoeda(saldoRestante)}\n` +
                         `📌 *Situação:* ${textoStatusZap}`;

        linkZap.href = `https://wa.me/55${contrato.whatsapp}?text=${encodeURIComponent(mensagem)}`;

        const btnExcluir = document.createElement('button');
        btnExcluir.className = 'btn-danger';
        btnExcluir.textContent = 'Excluir';
        btnExcluir.onclick = () => excluirContrato(contrato.id);

        tdAcao.appendChild(btnExtrato);
        tdAcao.appendChild(btnPdf);
        tdAcao.appendChild(linkZap);
        tdAcao.appendChild(btnExcluir);

        tr.appendChild(tdCliente);
        tr.appendChild(tdPlano);
        tr.appendChild(tdParcela);
        tr.appendChild(tdProgresso);
        tr.appendChild(tdVencimento);
        tr.appendChild(tdStatus);
        tr.appendChild(tdAcao);

        tabelaContratos.appendChild(tr);
    });

    elTotalEmprestado.textContent = formatarMoeda(somaEmprestado);
    elTotalRecebido.textContent = formatarMoeda(somaRecebido);
    elTotalReceber.textContent = formatarMoeda(somaAReceber);
    elLucroGeral.textContent = formatarMoeda(somaLucroGeral);
}

inputBuscaContrato.addEventListener('input', atualizarContratosNaTela);

async function excluirContrato(idContrato) {
    if (!confirm('Deseja realmente excluir este contrato e todo o seu histórico de pagamentos?')) return;
    try {
        await requisicaoAPI(`/contratos/${idContrato}`, { method: 'DELETE' });
        await carregarTodosOsDados();
    } catch (erro) {
        alert(erro.message);
    }
}

// ==========================================
// 5.4 SUBMISSÃO DE NOVO EMPRÉSTIMO E MODAL DE UNIFICAÇÃO (VALORES + TAXAS)
// ==========================================
const modalUnificacao = document.getElementById('modal-unificacao');
const modalUnificacaoConteudo = document.getElementById('modal-unificacao-conteudo');
let payloadPendenteUnificacao = null;

function fecharModalUnificacao() {
    modalUnificacao.style.display = 'none';
    payloadPendenteUnificacao = null;
}

document.getElementById('btn-fechar-modal-unificacao').addEventListener('click', fecharModalUnificacao);
document.getElementById('btn-cancelar-unificacao').addEventListener('click', fecharModalUnificacao);

async function enviarCriacaoContrato(payload) {
    const resposta = await requisicaoAPI('/contratos', {
        method: 'POST',
        body: JSON.stringify(payload)
    });

    formEmprestimo.reset();
    definirDataPadraoFormulario();
    preencherValorDoPlanoSelecionado();
    await carregarTodosOsDados();

    const novoContrato = contratos.find(c => c.id === resposta.id);
    if (novoContrato) {
        await gerarContratoPDF(novoContrato);

        const infoVenc = calcularProximoVencimento(novoContrato.dataPrimeiroVencimento, 0);
        const msgInicial = `Olá *${novoContrato.cliente}*, seu contrato *#CTR-${String(novoContrato.id).padStart(4, '0')}* foi gerado com sucesso!\n\n` +
                           `📋 *Plano:* ${novoContrato.plano} (${novoContrato.taxa}% a.m.)\n` +
                           `💳 *Parcelas:* ${novoContrato.parcelas}x de ${formatarMoeda(novoContrato.valorParcela)}\n` +
                           `📅 *1º Vencimento:* ${infoVenc.dataFormatada}\n\n` +
                           `Segue em anexo o documento oficial do seu contrato em PDF.`;

        window.open(`https://wa.me/55${novoContrato.whatsapp}?text=${encodeURIComponent(msgInicial)}`, '_blank', 'noopener,noreferrer');
    }
}

document.getElementById('btn-confirmar-unificacao').addEventListener('click', async () => {
    if (!payloadPendenteUnificacao) return;
    const payloadConfirmado = { ...payloadPendenteUnificacao, confirmarUnificacao: true };
    fecharModalUnificacao();

    try {
        await enviarCriacaoContrato(payloadConfirmado);
    } catch (erro) {
        alert(erro.message);
    }
});

formEmprestimo.addEventListener('submit', async (evento) => {
    evento.preventDefault();

    const clienteId = parseInt(selectClienteContrato.value);
    const planoId = parseInt(selectPlanoEmprestimo.value);
    const valorBase = converterMoedaParaNumero(inputValorEmprestimo.value);
    const dataPrimeiroVencimento = inputDataVencimento.value;

    if (!clienteId || !planoId || !dataPrimeiroVencimento) {
        alert('Preencha todos os campos do contrato.');
        return;
    }

    if (isNaN(valorBase) || valorBase < 50) {
        alert('O valor mínimo do empréstimo é R$ 50,00.');
        inputValorEmprestimo.focus();
        return;
    }

    const payload = { clienteId, planoId, valorBase, dataPrimeiroVencimento, confirmarUnificacao: false };

    try {
        await enviarCriacaoContrato(payload);
    } catch (erro) {
        if (erro.status === 409 && erro.dados && erro.dados.requerUnificacao) {
            const info = erro.dados;
            const ant = info.contratoAnterior;
            payloadPendenteUnificacao = payload;

            modalUnificacaoConteudo.innerHTML = `
                <p style="margin-bottom: 12px;">
                    O cliente já possui o contrato ativo <strong>#CTR-${String(ant.id).padStart(4, '0')}</strong> 
                    (${ant.parcelasPagas}/${ant.parcelasTotais} parcelas pagas) com vencimento no mesmo mês e dia selecionado.
                </p>
                <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 12px; margin-bottom: 12px;">
                    <div>• <strong>Saldo de Capital Anterior:</strong> ${formatarMoeda(ant.saldoCapitalRestante)} (Taxa: ${ant.taxaAnterior}% a.m.)</div>
                    <div>• <strong>Novo Valor Solicitado:</strong> ${formatarMoeda(info.novoValorSolicitado)} (Taxa: ${info.taxaNovoPlano}% a.m.)</div>
                    <hr style="border: none; border-top: 1px solid #E2E8F0; margin: 8px 0;">
                    <div style="color: #059669; font-weight: 700;">
                        • Novo Capital Consolidado: ${formatarMoeda(info.valorBaseUnificado)}
                    </div>
                    <div style="color: #2563EB; font-weight: 700; margin-top: 4px;">
                        • Nova Taxa Unificada: ${info.taxaUnificada}% a.m. (${ant.taxaAnterior}% + ${info.taxaNovoPlano}%)
                    </div>
                </div>
                <p style="font-size: 0.84rem; color: #64748B;">
                    Ao confirmar, o contrato <strong>#CTR-${String(ant.id).padStart(4, '0')}</strong> será encerrado no histórico como <strong>Unificado</strong> 
                    e será gerado um novo contrato somando os capitais e as taxas. Caso queira ajustar os juros depois, use o botão <strong>Revisar Taxa</strong>.
                </p>
            `;
            modalUnificacao.style.display = 'flex';
            return;
        }

        alert(erro.message);
    }
});

// ==========================================
// 6. INICIALIZAÇÃO DO SISTEMA FULL STACK
// ==========================================
verificarEstadoAutenticacao();