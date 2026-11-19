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
        throw new Error(dados.erro || 'Erro na comunicação com o servidor.');
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

async function carregarTodosOsDados() {
    try {
        const [listaClientes, listaPlanos, listaContratos] = await Promise.all([
            requisicaoAPI('/clientes'),
            requisicaoAPI('/planos'),
            requisicaoAPI('/contratos')
        ]);

        clientes = listaClientes;
        planos = listaPlanos;
        contratos = listaContratos;

        atualizarClientesNaTela();
        atualizarPlanosNaTela();
        atualizarContratosNaTela();
    } catch (erro) {
        console.error('Erro ao carregar dados do servidor:', erro.message);
    }
}

function formatarMoeda(valor) {
    return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Máscara monetária em tempo real (ex: digitar 110000 -> R$ 1.100,00)
function aplicarMascaraMoedaInput(valorBruto) {
    const apenasDigitos = String(valorBruto).replace(/\D/g, '');
    if (!apenasDigitos) return '';
    const valorNumerico = parseInt(apenasDigitos, 10) / 100;
    return valorNumerico.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Converte string formatada (ex: "R$ 1.100,00") de volta para número float (1100)
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
        contratos
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
// 3. MÓDULO DE CLIENTES E MÁSCARAS DE ENTRADA
// ==========================================
const formCliente = document.getElementById('form-cliente');
const tabelaClientes = document.getElementById('tabela-clientes');
const selectClienteContrato = document.getElementById('contrato-cliente');
const inputClienteCpf = document.getElementById('cliente-cpf');
const inputClienteWhatsapp = document.getElementById('cliente-whatsapp');

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

function atualizarClientesNaTela() {
    tabelaClientes.innerHTML = '';
    selectClienteContrato.innerHTML = '';

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

        const tr = document.createElement('tr');

        const tdNome = document.createElement('td');
        tdNome.textContent = cliente.nome;

        const tdCpf = document.createElement('td');
        tdCpf.textContent = mascararCPF(cliente.cpf);

        const tdWhatsapp = document.createElement('td');
        tdWhatsapp.textContent = formatarTelefone(cliente.whatsapp);

        const tdAcao = document.createElement('td');
        const btnExcluir = document.createElement('button');
        btnExcluir.className = 'btn-danger';
        btnExcluir.textContent = 'Excluir';
        btnExcluir.onclick = () => excluirCliente(cliente.id);

        tdAcao.appendChild(btnExcluir);
        tr.appendChild(tdNome);
        tr.appendChild(tdCpf);
        tr.appendChild(tdWhatsapp);
        tr.appendChild(tdAcao);

        tabelaClientes.appendChild(tr);
    });
}

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

    try {
        await requisicaoAPI('/clientes', {
            method: 'POST',
            body: JSON.stringify({ nome, cpf, whatsapp })
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

// Aplica máscara monetária automática em ambos os campos de valor
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
// 5. MÓDULO DE EMPRÉSTIMOS, VENCIMENTOS E RECIBOS
// ==========================================
const formEmprestimo = document.getElementById('form-emprestimo');
const tabelaContratos = document.getElementById('tabela-contratos');
const inputBuscaContrato = document.getElementById('busca-contrato');
const elTotalEmprestado = document.getElementById('total-emprestado');
const elTotalRecebido = document.getElementById('total-recebido');
const elTotalReceber = document.getElementById('total-receber');
const inputDataVencimento = document.getElementById('data-vencimento');

function definirDataPadraoFormulario() {
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = String(hoje.getMonth() + 1).padStart(2, '0');
    const dia = String(hoje.getDate()).padStart(2, '0');
    inputDataVencimento.value = `${ano}-${mes}-${dia}`;
}
definirDataPadraoFormulario();

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

        btnEstornarUltima.style.display = 'inline-block';

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
// 5.2 GERADOR DE CONTRATO E DEMONSTRATIVO EM PDF
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
    const quitado = pagas >= contrato.parcelas;
    const infoVencimento = calcularProximoVencimento(contrato.dataPrimeiroVencimento, pagas);

    const statusTexto = quitado
        ? 'QUITADO'
        : (infoVencimento.atrasado ? 'EM ATRASO' : 'EM DIA');

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
    doc.text('1. IDENTIFICAÇÃO DO CONTRATANTE', 14, 35);

    doc.setDrawColor(203, 213, 225);
    doc.line(14, 37, 196, 37);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.text(`Nome Completo: ${contrato.cliente}`, 14, 43);
    doc.text(`CPF (Protegido - LGPD): ${mascararCPF(contrato.cpf)}`, 14, 48.5);
    doc.text(`Telefone / WhatsApp: ${formatarTelefone(contrato.whatsapp)}`, 115, 48.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.text('2. CONDIÇÕES FINANCEIRAS CONTRATADAS', 14, 58);
    doc.line(14, 60, 196, 60);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.text(`Plano Selecionado: ${contrato.plano} (${contrato.taxa}% a.m.)`, 14, 66);
    doc.text(`Capital Liberado: ${formatarMoeda(contrato.valorBase)}`, 115, 66);
    doc.text(`Valor Total do Contrato: ${formatarMoeda(contrato.valorTotal)} (${contrato.parcelas}x de ${formatarMoeda(contrato.valorParcela)})`, 14, 71.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.text('3. DEMONSTRATIVO DE PAGAMENTO E CRONOGRAMA DE PARCELAS', 14, 81);
    doc.line(14, 83, 196, 83);

    doc.setFillColor(248, 250, 252);
    doc.rect(14, 86, 182, 21, 'F');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.text(`Parcelas Pagas até o momento: ${pagas} de ${contrato.parcelas} (${formatarMoeda(valorJaPago)})`, 18, 92);
    doc.text(`Parcelas Restantes: ${Math.max(0, contrato.parcelas - pagas)} parcela(s)`, 125, 92);

    doc.setFont('helvetica', 'bold');
    doc.text(`Saldo Devedor Restante: ${formatarMoeda(saldoRestante)}`, 18, 98);
    doc.text(`Situação Atual: ${statusTexto}`, 125, 98);
    doc.text(`Próximo Vencimento: ${quitado ? 'Contrato Quitado' : infoVencimento.dataFormatada}`, 18, 104);

    let y = 115;

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
            const statusParcela = vencParcela.atrasado ? 'Atrasada' : 'Em Aberto';

            doc.setFont('helvetica', 'normal');
            doc.setTextColor(vencParcela.atrasado ? 185 : 30, vencParcela.atrasado ? 28 : 41, vencParcela.atrasado ? 28 : 59);
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

    contratos.forEach((contrato) => {
        const pagas = contrato.parcelasPagas || 0;
        const valorJaPago = pagas * contrato.valorParcela;
        const saldoRestante = Math.max(0, contrato.valorTotal - valorJaPago);

        somaEmprestado += contrato.valorBase;
        somaRecebido += valorJaPago;
        somaAReceber += saldoRestante;

        if (termoBusca && !contrato.cliente.toLowerCase().includes(termoBusca)) {
            return;
        }

        const quitado = pagas >= contrato.parcelas;
        const infoVencimento = calcularProximoVencimento(contrato.dataPrimeiroVencimento, pagas);
        const estaAtrasado = !quitado && infoVencimento.atrasado;

        const tr = document.createElement('tr');

        const tdCliente = document.createElement('td');
        tdCliente.textContent = contrato.cliente;

        const tdPlano = document.createElement('td');
        tdPlano.textContent = `${contrato.plano} (${contrato.taxa}% a.m.)`;

        const tdParcela = document.createElement('td');
        tdParcela.textContent = formatarMoeda(contrato.valorParcela);

        const tdProgresso = document.createElement('td');
        tdProgresso.textContent = `${pagas} de ${contrato.parcelas} pagas`;

        const tdVencimento = document.createElement('td');
        tdVencimento.textContent = quitado ? '—' : infoVencimento.dataFormatada;
        if (estaAtrasado) {
            tdVencimento.style.color = '#B91C1C';
            tdVencimento.style.fontWeight = '600';
        }

        const tdStatus = document.createElement('td');
        const badgeStatus = document.createElement('span');
        if (quitado) {
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

        if (!quitado) {
            const btnPagar = document.createElement('button');
            btnPagar.className = 'btn-pagar';
            btnPagar.textContent = '+1 Pago';
            btnPagar.title = 'Registrar pagamento de 1 parcela';
            btnPagar.onclick = () => registrarPagamentoParcela(contrato.id);
            tdAcao.appendChild(btnPagar);
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

        const textoStatusZap = quitado
            ? 'QUITADO ✅'
            : (estaAtrasado ? `ATRASADO ⚠️ (Venceu em ${infoVencimento.dataFormatada})` : `EM DIA (Próx. vencimento: ${infoVencimento.dataFormatada})`);

        const mensagem = `Olá *${contrato.cliente}*, segue o resumo atualizado do seu contrato:\n\n` +
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

    try {
        const resposta = await requisicaoAPI('/contratos', {
            method: 'POST',
            body: JSON.stringify({ clienteId, planoId, valorBase, dataPrimeiroVencimento })
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
    } catch (erro) {
        alert(erro.message);
    }
});

// ==========================================
// 6. INICIALIZAÇÃO DO SISTEMA FULL STACK
// ==========================================
verificarEstadoAutenticacao();