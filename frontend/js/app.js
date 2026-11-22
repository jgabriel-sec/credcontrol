const API_URL = 'http://localhost:3000/api';

// ==========================================
// 0. CLIENTE HTTP SEGURO E AUTENTICAÇÃO JWT
// ==========================================
const telaLogin = document.getElementById('tela-login');
const sistemaPrincipal = document.getElementById('sistema-principal');
const formLogin = document.getElementById('form-login');
const loginTitulo = document.getElementById('login-titulo');
const loginInstrucao = document.getElementById('login-instrucao');
const loginErro = document.getElementById('login-erro');
const btnLogin = document.getElementById('btn-login');
const btnLogout = document.getElementById('btn-logout');

let modoSetupInicial = false;

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

    if ((resposta.status === 401 || resposta.status === 403) && !endpoint.startsWith('/auth')) {
        sessionStorage.removeItem('credcontrol_token');
        verificarEstadoAutenticacao();
        throw new Error('Sessão expirada. Faça login novamente.');
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
        telaLogin.style.display = 'none';
        sistemaPrincipal.style.display = 'flex';
        await carregarTodosOsDados();
        return;
    }

    telaLogin.style.display = 'flex';
    sistemaPrincipal.style.display = 'none';

    try {
        const statusSetup = await requisicaoAPI('/auth/verificar-setup');
        modoSetupInicial = !statusSetup.configurado;

        if (modoSetupInicial) {
            loginTitulo.textContent = 'Configuração Inicial';
            loginInstrucao.textContent = 'Crie sua senha de Administrador no servidor (mínimo 6 caracteres).';
            btnLogin.textContent = 'Definir Senha e Entrar';
        } else {
            loginTitulo.textContent = 'Acesso Restrito';
            loginInstrucao.textContent = 'Digite sua senha de administrador para acessar o painel.';
            btnLogin.textContent = 'Entrar no Sistema';
        }
    } catch (erro) {
        loginErro.textContent = 'Servidor offline! Verifique se o backend está rodando na porta 3000.';
        loginErro.style.display = 'block';
    }
}

formLogin.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    loginErro.style.display = 'none';

    const senhaDigitada = document.getElementById('admin-senha').value;
    const rotaAuth = modoSetupInicial ? '/auth/setup' : '/auth/login';

    try {
        const resposta = await requisicaoAPI(rotaAuth, {
            method: 'POST',
            body: JSON.stringify({ senha: senhaDigitada })
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
        origem: 'SQLite-API',
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
    alert('No modo Full Stack com banco SQLite, os dados já ficam salvos automaticamente no arquivo database.sqlite na pasta backend/.');
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
// 5. MÓDULO DE EMPRÉSTIMOS, UNIFICAÇÃO, REVISÃO DE TAXA E RECIBOS
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
// 5.3 GERADOR DE CONTRATO E DEMONSTRATIVO EM PDF
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

    const statusTexto = ehUnificado
        ? 'UNIFICADO EM NOVO CONTRATO'
        : (quitado ? 'QUITADO' : (infoVencimento.atrasado ? 'EM ATRASO' : 'EM DIA'));

    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, 210, 26, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('CREDCONTROL', 14, 12);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('CONTRATO DE MÚTUO FINANCEIRO E DEMONSTRATIVO DE PARCELAS', 14, 19);

    doc.setFontSize(8.5);
    doc.text(`Contrato Nº #CTR-${String(contrato.id).padStart(4, '0')}`, 160, 12);
    doc.text(`Emissão: ${new Date().toLocaleDateString('pt-BR')}`, 160, 18);

    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.text('1. IDENTIFICAÇÃO DO CONTRATANTE', 14, 34);

    doc.setDrawColor(203, 213, 225);
    doc.line(14, 36, 196, 36);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.text(`Nome Completo: ${contrato.cliente}`, 14, 42);
    doc.text(`CPF (Protegido - LGPD): ${mascararCPF(contrato.cpf)}`, 14, 47.5);
    doc.text(`Telefone / WhatsApp: ${formatarTelefone(contrato.whatsapp)}`, 115, 47.5);

    const enderecoFormatado = formatarEnderecoCompleto(contrato);
    const linhasEndereco = doc.splitTextToSize(`Endereço: ${enderecoFormatado}`, 182);
    doc.text(linhasEndereco, 14, 53);

    const offsetEndereco = linhasEndereco.length > 1 ? 5 : 0;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.text('2. CONDIÇÕES FINANCEIRAS CONTRATADAS', 14, 62 + offsetEndereco);
    doc.line(14, 64 + offsetEndereco, 196, 64 + offsetEndereco);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.text(`Plano Selecionado: ${contrato.plano} (${contrato.taxa}% a.m.)`, 14, 70 + offsetEndereco);
    doc.text(`Capital Consolidado: ${formatarMoeda(contrato.valorBase)}`, 115, 70 + offsetEndereco);
    doc.text(`Valor Total do Contrato: ${formatarMoeda(contrato.valorTotal)} (${contrato.parcelas}x de ${formatarMoeda(contrato.valorParcela)})`, 14, 75.5 + offsetEndereco);

    let offsetObs = 0;
    if (contrato.observacao) {
        doc.setFontSize(8.5);
        doc.setTextColor(37, 99, 235);
        doc.text(`Observação: ${contrato.observacao}`, 14, 80.5 + offsetEndereco);
        doc.setTextColor(15, 23, 42);
        offsetObs = 5;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.text('3. DEMONSTRATIVO DE PAGAMENTO E CRONOGRAMA DE PARCELAS', 14, 85 + offsetEndereco + offsetObs);
    doc.line(14, 87 + offsetEndereco + offsetObs, 196, 87 + offsetEndereco + offsetObs);

    doc.setFillColor(248, 250, 252);
    doc.rect(14, 90 + offsetEndereco + offsetObs, 182, 21, 'F');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.text(`Parcelas Pagas até o momento: ${pagas} de ${contrato.parcelas} (${formatarMoeda(valorJaPago)})`, 18, 96 + offsetEndereco + offsetObs);
    doc.text(`Parcelas Restantes: ${Math.max(0, contrato.parcelas - pagas)} parcela(s)`, 125, 96 + offsetEndereco + offsetObs);

    doc.setFont('helvetica', 'bold');
    doc.text(`Saldo Devedor Restante: ${ehUnificado ? 'R$ 0,00 (Unificado)' : formatarMoeda(saldoRestante)}`, 18, 102 + offsetEndereco + offsetObs);
    doc.text(`Situação Atual: ${statusTexto}`, 125, 102 + offsetEndereco + offsetObs);
    doc.text(`Próximo Vencimento: ${ehUnificado || quitado ? 'Encerrado' : infoVencimento.dataFormatada}`, 18, 108 + offsetEndereco + offsetObs);

    let y = 119 + offsetEndereco + offsetObs;

    doc.setFillColor(226, 232, 240);
    doc.rect(14, y - 4.5, 182, 6.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text('PARCELA', 18, y);
    doc.text('VALOR', 55, y);
    doc.text('DATA (PAGAMENTO / VENCIMENTO)', 95, y);
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
                ? `Pago em ${formatarDataHoraSQLite(registroPago.dataPagamento)}`
                : 'Pagamento Confirmado';

            doc.setFont('helvetica', 'normal');
            doc.setTextColor(6, 95, 70);
            doc.text(`${i}ª de ${contrato.parcelas}`, 18, y);
            doc.text(formatarMoeda(contrato.valorParcela), 55, y);
            doc.text(dataPgtoTexto, 95, y);
            doc.setFont('helvetica', 'bold');
            doc.text('Paga', 165, y);
        } else {
            const vencParcela = calcularProximoVencimento(contrato.dataPrimeiroVencimento, i - 1);
            const statusParcela = ehUnificado ? 'Unificada' : (vencParcela.atrasado ? 'Atrasada' : 'Em Aberto');

            doc.setFont('helvetica', 'normal');
            doc.setTextColor(vencParcela.atrasado && !ehUnificado ? 185 : 30, vencParcela.atrasado && !ehUnificado ? 28 : 41, vencParcela.atrasado && !ehUnificado ? 28 : 59);
            doc.text(`${i}ª de ${contrato.parcelas}`, 18, y);
            doc.text(formatarMoeda(contrato.valorParcela), 55, y);
            doc.text(`Vence em ${vencParcela.dataFormatada}`, 95, y);
            doc.setFont('helvetica', 'bold');
            doc.text(statusParcela, 165, y);
        }

        doc.setDrawColor(241, 245, 249);
        doc.line(14, y + 1.5, 196, y + 1.5);
        y += 5.5;
    }

    if (y > 240) {
        doc.addPage();
        y = 20;
    } else {
        y += 6;
    }

    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('4. TERMOS E CONCORDÂNCIA', 14, y);
    y += 5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    const termo = 'O(A) CONTRATANTE reconhece a liquidez e certeza do valor acima discriminado, comprometendo-se a efetuar o pagamento das parcelas mensais nas datas de vencimento estipuladas neste instrumento.';
    const linhasTermo = doc.splitTextToSize(termo, 182);
    doc.text(linhasTermo, 14, y);

    y += 20;
    doc.setDrawColor(100, 116, 139);
    doc.line(20, y, 95, y);
    doc.text('CredControl - Administração', 36, y + 4.5);

    doc.line(115, y, 190, y);
    doc.text(`${contrato.cliente}`, 125, y + 4.5);

    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text('Documento gerado eletronicamente pelo sistema CredControl.', 14, 288);

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

        // Evita contar duas vezes o capital que migrou para o contrato unificado
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
// 5.4 SUBMISSÃO DE NOVO EMPRÉSTIMO E MODAL DE UNIFICAÇÃO
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
                    <div>• <strong>Saldo de Capital Anterior Restante:</strong> ${formatarMoeda(ant.saldoCapitalRestante)}</div>
                    <div>• <strong>Novo Valor Solicitado:</strong> ${formatarMoeda(info.novoValorSolicitado)}</div>
                    <div style="margin-top: 6px; color: #059669; font-weight: 700;">
                        • Novo Capital Consolidado: ${formatarMoeda(info.valorBaseUnificado)}
                    </div>
                </div>
                <p style="font-size: 0.84rem; color: #64748B;">
                    Ao confirmar, o contrato <strong>#CTR-${String(ant.id).padStart(4, '0')}</strong> será mantido no histórico como <strong>Unificado</strong> 
                    e será gerado um novo contrato somando os dois valores. Depois você poderá clicar em <strong>Revisar Taxa</strong> se quiser ajustar os juros.
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