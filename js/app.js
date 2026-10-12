(function () {
  const CHAVE = "proftech.financeiro.v1";
  const CHAVE_MES = "proftech.financeiro.mes";
  const ESPERA_SPLASH = 1100;

  const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const formatoDia = new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "long"
  });

  const $ = (seletor) => document.querySelector(seletor);

  const splash = $("#splash");
  const app = $("#app");
  const formulario = $("#formulario");
  const valorInput = $("#valor");
  const descricaoInput = $("#descricao");
  const dataInput = $("#data");
  const erro = $("#erro");
  const tituloForm = $("#titulo-form");
  const botaoSalvar = $("#salvar");
  const botaoCancelar = $("#cancelar");
  const modalLancamento = $("#modal-lancamento");
  const modalCliente = $("#modal-cliente");
  const listaEntradasMes = $("#lista-entradas-mes");
  const listaSaidasMes = $("#lista-saidas-mes");
  const mesInput = $("#mes");
  const mesRotulo = $("#mes-rotulo");
  const relMesInput = $("#rel-mes");
  const relMesRotulo = $("#rel-mes-rotulo");
  const relListaEntradas = $("#rel-lista-entradas");
  const relListaSaidas = $("#rel-lista-saidas");
  let listaRelatorio = "entrada";
  const relCartaoSobrou = $("#rel-cartao-sobrou");
  const marcaSub = $("#marca-sub");
  const toast = $("#toast");
  const dialogo = $("#dialogo");
  const confirmaTexto = $("#confirma-texto");
  const cartaoSobrou = $("#cartao-sobrou");
  const botaoInstalar = $("#instalar");

  let lancamentos = [];
  let clientes = [];
  let mes = mesSalvo();
  let ocupado = false;
  let dadosProntos = Promise.resolve();
  let editandoId = null;
  let excluindoId = null;
  let editandoClienteId = null;
  let excluindoClienteId = null;
  let toastTimer = 0;
  let instalarEvento = null;
  const inicioSplash = performance.now();

  function locaisSalvos() {
    try {
      const dados = JSON.parse(localStorage.getItem(CHAVE) || "[]");
      if (!Array.isArray(dados)) return [];
      return dados.filter(itemValido);
    } catch (e) {
      return [];
    }
  }

  function itemValido(item) {
    return Boolean(
      item &&
      typeof item.id === "string" &&
      (item.tipo === "entrada" || item.tipo === "saida") &&
      Number.isInteger(item.centavos) &&
      item.centavos > 0 &&
      typeof item.descricao === "string" &&
      item.descricao.trim() &&
      /^\d{4}-\d{2}-\d{2}$/.test(item.data)
    );
  }

  function espera(ms) {
    return new Promise((resolver) => window.setTimeout(resolver, ms));
  }

  async function requisicao(metodo, corpo, id, caminho = "api/lancamentos.php") {
    const url = new URL(caminho, window.location.href);
    if (id) url.searchParams.set("id", id);
    const controle = new AbortController();
    const timer = window.setTimeout(() => controle.abort(), 8000);
    let resposta;
    try {
      resposta = await fetch(url, {
        method: metodo,
        headers: corpo ? { "Content-Type": "application/json" } : undefined,
        body: corpo ? JSON.stringify(corpo) : undefined,
        cache: "no-store",
        credentials: "same-origin",
        signal: controle.signal
      });
    } catch (e) {
      throw new Error("Não foi possível conectar ao banco.");
    } finally {
      window.clearTimeout(timer);
    }

    if (resposta.status === 204) return null;
    let dados = null;
    try {
      dados = await resposta.json();
    } catch (e) {
      dados = null;
    }
    if (resposta.status === 401) {
      window.location.replace("login.html");
      const falha = new Error("Faça login para continuar.");
      falha.status = 401;
      throw falha;
    }
    if (!resposta.ok) {
      const falha = new Error((dados && dados.erro) || "Não foi possível falar com o banco.");
      falha.status = resposta.status;
      throw falha;
    }
    return dados;
  }

  function normalizar(item) {
    if (!item || typeof item !== "object") return null;
    const centavos = Number(item.centavos);
    const entrada = item.tipo === "entrada";
    const normal = {
      id: item.id,
      tipo: item.tipo,
      descricao: typeof item.descricao === "string" ? item.descricao : "",
      centavos: Number.isFinite(centavos) ? Math.round(centavos) : 0,
      data: item.data,
      criadoEm: typeof item.criadoEm === "string" ? item.criadoEm : "",
      situacao: entrada && item.situacao === "a_receber" ? "a_receber" : entrada ? "recebido" : null,
      modalidade: entrada && item.modalidade === "recorrente" ? "recorrente" : entrada ? "avulsa" : null,
      pagamentos: Array.isArray(item.pagamentos)
        ? item.pagamentos.filter((mesPago) => /^\d{4}-\d{2}$/.test(mesPago))
        : [],
      clienteId: item.clienteId ? String(item.clienteId) : "",
      clienteNome: typeof item.clienteNome === "string" ? item.clienteNome : "",
      clienteTelefone: typeof item.clienteTelefone === "string" ? item.clienteTelefone : ""
    };
    return itemValido(normal) ? normal : null;
  }

  async function carregarRemoto() {
    const [dados, listaClientes] = await Promise.all([
      requisicao("GET"),
      requisicao("GET", null, null, "api/clientes.php")
    ]);
    lancamentos = Array.isArray(dados) ? dados.map(normalizar).filter(Boolean) : [];
    clientes = Array.isArray(listaClientes) ? listaClientes.filter((cliente) => cliente && cliente.id && cliente.nome) : [];
    preencherClientes();
    renderClientes();
    await importarLocais();
    render();
  }

  async function importarLocais() {
    const locais = locaisSalvos();
    if (!locais.length) return;
    const ids = new Set(lancamentos.map((item) => item.id));
    let mudou = false;
    for (const item of locais) {
      if (ids.has(item.id)) continue;
      try {
        await requisicao("POST", item);
        mudou = true;
      } catch (e) {
        if (e.status === 409) continue;
        throw e;
      }
    }
    if (!mudou) {
      localStorage.removeItem(CHAVE);
      return;
    }
    const dados = await requisicao("GET");
    lancamentos = Array.isArray(dados) ? dados.map(normalizar).filter(Boolean) : [];
    localStorage.removeItem(CHAVE);
  }

  function mesAtual() {
    const hoje = new Date();
    return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
  }

  function mesSalvo() {
    const salvo = localStorage.getItem(CHAVE_MES);
    return /^\d{4}-\d{2}$/.test(salvo || "") ? salvo : mesAtual();
  }

  function hojeISO() {
    const hoje = new Date();
    return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
  }

  function dataSugerida() {
    if (mes === mesAtual()) return hojeISO();
    return `${mes}-01`;
  }

  function rotuloMes(valor) {
    const [ano, mesNumero] = valor.split("-").map(Number);
    const texto = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(
      new Date(ano, mesNumero - 1, 1)
    );
    return texto.charAt(0).toUpperCase() + texto.slice(1);
  }

  function formatarCentavos(centavos) {
    return moeda.format(centavos / 100);
  }

  function formatarDia(iso) {
    const [ano, mesNumero, dia] = iso.split("-").map(Number);
    return formatoDia.format(new Date(ano, mesNumero - 1, dia)).replace(".", "");
  }

  function contagem(quantidade, singular, plural) {
    return `${quantidade} ${quantidade === 1 ? singular : plural}`;
  }

  function novoId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  }

  function parseValor(texto) {
    let valor = String(texto).trim().replace(/\s/g, "").replace(/^R\$/i, "");
    if (!valor) return NaN;
    if (valor.includes(",")) valor = valor.replace(/\./g, "").replace(",", ".");
    else if (/^\d{1,3}(\.\d{3})+$/.test(valor)) valor = valor.replace(/\./g, "");
    if (!/^\d+(\.\d+)?$/.test(valor)) return NaN;
    const numero = Number(valor);
    if (!Number.isFinite(numero) || numero <= 0) return NaN;
    const centavos = Math.round(numero * 100);
    if (centavos > 9999999999) return NaN;
    return centavos;
  }

  function dataValida(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
    const [ano, mesNumero, dia] = iso.split("-").map(Number);
    const data = new Date(ano, mesNumero - 1, dia);
    return data.getFullYear() === ano && data.getMonth() === mesNumero - 1 && data.getDate() === dia;
  }

  function mostrarErro(texto) {
    erro.textContent = texto;
    erro.hidden = false;
  }

  function limparErro() {
    erro.textContent = "";
    erro.hidden = true;
  }

  function tipoSelecionado() {
    const marcado = formulario.querySelector('input[name="tipo"]:checked');
    return marcado ? marcado.value : "entrada";
  }

  function opcaoMarcada(nome) {
    const marcado = formulario.querySelector(`input[name="${nome}"]:checked`);
    return marcado ? marcado.value : "";
  }

  function atualizarTipo() {
    const entrada = tipoSelecionado() === "entrada";
    formulario.classList.toggle("saida", !entrada);
    $("#opcoes-entrada").hidden = !entrada;
    $("#rotulo-data").textContent = entrada ? "Vencimento" : "Data";
  }

  function limparFormulario() {
    editandoId = null;
    formulario.reset();
    formulario.querySelector('input[name="tipo"][value="entrada"]').checked = true;
    formulario.querySelector('input[name="situacao"][value="a_receber"]').checked = true;
    formulario.querySelector('input[name="modalidade"][value="avulsa"]').checked = true;
    atualizarTipo();
    valorInput.value = "";
    descricaoInput.value = "";
    dataInput.value = dataSugerida();
    preencherClientes("");
    tituloForm.textContent = "Registrar lançamento";
    botaoSalvar.textContent = "Registrar";
    botaoCancelar.hidden = true;
    limparErro();
    if (modalLancamento.open) modalLancamento.close();
  }

  function abrirFormulario() {
    if (modalLancamento.open) return;
    if (typeof modalLancamento.showModal === "function") modalLancamento.showModal();
  }

  function passaFiltro(item) {
    const situacao = $("#filtro-situacao").value;
    if (!situacao) return true;
    if (situacao === "pago") return item.status === "pago" || item.status === "recebido";
    return item.status === situacao;
  }

  function definirMes(novo) {
    if (!/^\d{4}-\d{2}$/.test(novo)) return;
    mes = novo;
    localStorage.setItem(CHAVE_MES, mes);
    const nome = rotuloMes(mes);
    mesInput.value = mes;
    mesRotulo.textContent = nome;
    relMesInput.value = mes;
    relMesRotulo.textContent = nome;
    if (!editandoId) dataInput.value = dataSugerida();
    render();
  }

  function deslocarMes(delta) {
    const [ano, mesNumero] = mes.split("-").map(Number);
    const data = new Date(ano, mesNumero - 1 + delta, 1);
    definirMes(`${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}`);
  }

  function maiorMes(a, b) {
    return a > b ? a : b;
  }

  function mesesEntre(inicio, fim) {
    const lista = [];
    let [ano, mesNumero] = inicio.split("-").map(Number);
    const [anoFim, mesFim] = fim.split("-").map(Number);
    while (ano < anoFim || (ano === anoFim && mesNumero <= mesFim)) {
      lista.push(`${ano}-${String(mesNumero).padStart(2, "0")}`);
      mesNumero += 1;
      if (mesNumero > 12) {
        mesNumero = 1;
        ano += 1;
      }
      if (lista.length > 240) break;
    }
    return lista;
  }

  function vencimentoNoMes(dataBase, competencia) {
    const dia = Number(dataBase.slice(8, 10));
    const [ano, mesNumero] = competencia.split("-").map(Number);
    const ultimo = new Date(ano, mesNumero, 0).getDate();
    return `${competencia}-${String(Math.min(dia, ultimo)).padStart(2, "0")}`;
  }

  function statusCobranca(item, competencia, data) {
    const pago = item.modalidade === "recorrente"
      ? (item.pagamentos || []).includes(competencia)
      : item.situacao === "recebido";
    if (pago) return item.modalidade === "recorrente" ? "pago" : "recebido";
    return data < hojeISO() ? "em_atraso" : "a_receber";
  }

  function gerarCobrancas(item, limite) {
    if (item.tipo !== "entrada") return [];
    const inicio = item.data.slice(0, 7);
    if (item.modalidade !== "recorrente") {
      if (inicio > limite) return [];
      return [visaoEntrada(item, inicio, item.data)];
    }
    if (inicio > limite) return [];
    return mesesEntre(inicio, limite).map((competencia) => {
      const data = vencimentoNoMes(item.data, competencia);
      return visaoEntrada(item, competencia, data);
    });
  }

  function visaoEntrada(item, competencia, data) {
    return {
      id: item.id,
      tipo: "entrada",
      descricao: item.descricao,
      centavos: item.centavos,
      data,
      competencia,
      modalidade: item.modalidade,
      status: statusCobranca(item, competencia, data),
      clienteId: item.clienteId || "",
      clienteNome: item.clienteNome || "",
      clienteTelefone: item.clienteTelefone || ""
    };
  }

  function visaoSaida(item) {
    return {
      id: item.id,
      tipo: "saida",
      descricao: item.descricao,
      centavos: item.centavos,
      data: item.data,
      competencia: item.data.slice(0, 7),
      modalidade: null,
      status: null,
      clienteId: item.clienteId || "",
      clienteNome: item.clienteNome || "",
      clienteTelefone: item.clienteTelefone || ""
    };
  }

  function porData(a, b, recentePrimeiro) {
    if (a.data !== b.data) {
      if (recentePrimeiro) return a.data < b.data ? 1 : -1;
      return a.data < b.data ? -1 : 1;
    }
    return a.descricao.localeCompare(b.descricao, "pt-BR");
  }

  function quadroDoMes() {
    const limite = maiorMes(mes, mesAtual());
    const pendentes = [];
    const doMes = [];
    const abertas = [];
    lancamentos.forEach((item) => {
      if (item.tipo === "saida") {
        if (item.data.startsWith(mes)) doMes.push(visaoSaida(item));
        return;
      }
      gerarCobrancas(item, limite).forEach((cobranca) => {
        const aberta = cobranca.status === "a_receber" || cobranca.status === "em_atraso";
        if (aberta) abertas.push(cobranca);
        if (cobranca.competencia === mes) doMes.push(cobranca);
        else if (aberta) pendentes.push(cobranca);
      });
    });
    pendentes.sort((a, b) => porData(a, b, false));
    doMes.sort((a, b) => porData(a, b, true));
    return { pendentes, doMes, abertas };
  }

  function textoPendencias(abertas) {
    const atraso = abertas.filter((item) => item.status === "em_atraso").length;
    const aguardando = abertas.length - atraso;
    if (!abertas.length) return "nada pendente";
    const partes = [];
    if (atraso) partes.push(contagem(atraso, "em atraso", "em atraso"));
    if (aguardando) partes.push(contagem(aguardando, "a receber", "a receber"));
    return partes.join(" · ");
  }

  function render() {
    const quadro = quadroDoMes();
    const recebido = quadro.doMes
      .filter((item) => item.status === "pago" || item.status === "recebido")
      .reduce((total, item) => total + item.centavos, 0);
    const falta = quadro.abertas.reduce((total, item) => total + item.centavos, 0);
    const previsao = recebido + falta;
    const gastei = quadro.doMes
      .filter((item) => item.tipo === "saida")
      .reduce((total, item) => total + item.centavos, 0);
    const sobrou = recebido - gastei;
    const saidas = quadro.doMes.filter((item) => item.tipo === "saida").length;
    const recebidas = quadro.doMes.filter((item) => item.status === "pago" || item.status === "recebido").length;
    const textoSaidas = contagem(saidas, "saída", "saídas");
    const textoRecebidas = recebidas ? `${contagem(recebidas, "recebida", "recebidas")} neste mês` : "neste mês";
    const textoPendencia = textoPendencias(quadro.abertas);
    const textoAinda = contagem(quadro.pendentes.length, "pendente", "pendentes");
    let legenda = "já recebido menos as saídas";
    if (falta > 0) legenda = `se entrar o pendente: ${formatarCentavos(previsao - gastei)}`;

    $("#total-recebi").textContent = formatarCentavos(recebido);
    $("#total-falta").textContent = formatarCentavos(falta);
    $("#total-previsao").textContent = formatarCentavos(previsao);
    $("#total-gastei").textContent = formatarCentavos(gastei);
    $("#total-sobrou").textContent = formatarCentavos(sobrou);
    $("#qtd-recebi").textContent = textoRecebidas;
    $("#qtd-falta").textContent = textoPendencia;
    $("#qtd-saidas").textContent = textoSaidas;
    $("#legenda-sobrou").textContent = legenda;
    cartaoSobrou.classList.toggle("negativo", sobrou < 0);
    $("#cartao-falta").classList.toggle("tem-atraso", quadro.abertas.some((item) => item.status === "em_atraso"));

    $("#lan-total-recebi").textContent = formatarCentavos(recebido);
    $("#lan-total-falta").textContent = formatarCentavos(falta);
    $("#lan-total-previsao").textContent = formatarCentavos(previsao);
    $("#lan-total-gastei").textContent = formatarCentavos(gastei);
    $("#lan-total-sobrou").textContent = formatarCentavos(sobrou);
    $("#lan-qtd-recebi").textContent = textoRecebidas;
    $("#lan-qtd-falta").textContent = textoPendencia;
    $("#lan-qtd-saidas").textContent = textoSaidas;
    $("#lan-legenda-sobrou").textContent = legenda;
    $("#lan-cartao-sobrou").classList.toggle("negativo", sobrou < 0);
    $("#lan-cartao-falta").classList.toggle("tem-atraso", quadro.abertas.some((item) => item.status === "em_atraso"));

    $("#rel-total-recebi").textContent = formatarCentavos(recebido);
    $("#rel-total-falta").textContent = formatarCentavos(falta);
    $("#rel-total-previsao").textContent = formatarCentavos(previsao);
    $("#rel-total-gastei").textContent = formatarCentavos(gastei);
    $("#rel-total-sobrou").textContent = formatarCentavos(sobrou);
    $("#rel-qtd-recebi").textContent = textoRecebidas;
    $("#rel-qtd-falta").textContent = textoPendencia;
    $("#rel-qtd-saidas").textContent = textoSaidas;
    $("#rel-legenda-sobrou").textContent = legenda;
    relCartaoSobrou.classList.toggle("negativo", sobrou < 0);
    $("#rel-cartao-falta").classList.toggle("tem-atraso", quadro.abertas.some((item) => item.status === "em_atraso"));

    const entradasMes = quadro.doMes.filter((item) => item.tipo === "entrada");
    const saidasMes = quadro.doMes.filter((item) => item.tipo === "saida");
    const entradasVisiveis = entradasMes.filter(passaFiltro);
    const nomeMes = rotuloMes(mes);
    const pendentesFiltrados = quadro.pendentes.filter(passaFiltro);
    const soma = (itens) => itens.reduce((total, item) => total + item.centavos, 0);
    $("#vazio-entradas-mes-texto").textContent = entradasMes.length && !entradasVisiveis.length
      ? `Nenhuma entrada com esse filtro em ${nomeMes}.`
      : `Nenhuma entrada em ${nomeMes}.`;
    $("#vazio-saidas-mes-texto").textContent = `Nenhuma saída em ${nomeMes}.`;
    $("#rel-vazio-entradas-texto").textContent = `Nenhuma entrada em ${nomeMes}.`;
    $("#rel-vazio-saidas-texto").textContent = `Nenhuma saída em ${nomeMes}.`;
    $("#lan-contagem-entradas").textContent = contagem(entradasVisiveis.length, "entrada", "entradas");
    $("#lan-contagem-saidas").textContent = contagem(saidasMes.length, "saída", "saídas");
    $("#lan-soma-entradas").textContent = formatarCentavos(soma(entradasVisiveis));
    $("#lan-soma-saidas").textContent = formatarCentavos(soma(saidasMes));
    $("#rel-contagem-entradas").textContent = contagem(entradasMes.length, "entrada", "entradas");
    $("#rel-contagem-saidas").textContent = textoSaidas;
    $("#contagem-pendencias").textContent = contagem(pendentesFiltrados.length, "pendente", "pendentes");
    $("#rel-contagem-pendencias").textContent = textoAinda;
    $("#vazio-entradas-mes").hidden = entradasVisiveis.length > 0;
    listaEntradasMes.hidden = entradasVisiveis.length === 0;
    $("#vazio-saidas-mes").hidden = saidasMes.length > 0;
    listaSaidasMes.hidden = saidasMes.length === 0;
    $("#rel-vazio-entradas").hidden = entradasMes.length > 0;
    relListaEntradas.hidden = entradasMes.length === 0;
    $("#rel-vazio-saidas").hidden = saidasMes.length > 0;
    relListaSaidas.hidden = saidasMes.length === 0;
    $("#secao-pendencias").hidden = pendentesFiltrados.length === 0;
    $("#rel-secao-pendencias").hidden = quadro.pendentes.length === 0;
    desenharLista(pendentesFiltrados, $("#pendencias"), false);
    desenharLista(entradasVisiveis, listaEntradasMes, false);
    desenharLista(saidasMes, listaSaidasMes, false);
    desenharLista(quadro.pendentes, $("#rel-pendencias"), true);
    desenharLista(entradasMes, relListaEntradas, true);
    desenharLista(saidasMes, relListaSaidas, true);
    $("#rel-filtro-entrada").textContent = `Entradas · ${entradasMes.length}`;
    $("#rel-filtro-saida").textContent = `Saídas · ${saidasMes.length}`;
    mostrarListaRelatorio(listaRelatorio);
    renderVisao();

    document.title = `profTech Financeiro · ${nomeMes}`;
    $("#resumo-vivo").textContent = `${nomeMes}: recebeu ${formatarCentavos(recebido)}, falta receber ${formatarCentavos(falta)}, previsão ${formatarCentavos(previsao)}, saídas ${formatarCentavos(gastei)}, sobra em caixa ${formatarCentavos(sobrou)}.`;
  }

  function itensNoMes(competencia) {
    const itens = [];
    lancamentos.forEach((item) => {
      if (item.tipo === "saida") {
        if (item.data.slice(0, 7) === competencia) itens.push(visaoSaida(item));
        return;
      }
      gerarCobrancas(item, competencia).forEach((cobranca) => {
        if (cobranca.competencia === competencia) itens.push(cobranca);
      });
    });
    return itens;
  }

  function saldoMes(competencia) {
    const itens = itensNoMes(competencia);
    const entradas = itens
      .filter((item) => item.tipo === "entrada" && (item.status === "pago" || item.status === "recebido"))
      .reduce((total, item) => total + item.centavos, 0);
    const saidas = itens
      .filter((item) => item.tipo === "saida")
      .reduce((total, item) => total + item.centavos, 0);
    return { competencia, entradas, saidas, sobra: entradas - saidas, itens };
  }

  function nomeMesCurto(competencia) {
    const [ano, mesNumero] = competencia.split("-").map(Number);
    const texto = new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(new Date(ano, mesNumero - 1, 1));
    return texto.charAt(0).toUpperCase() + texto.slice(1);
  }

  function siglaMes(competencia) {
    const siglas = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
    return siglas[Number(competencia.slice(5, 7)) - 1];
  }

  function renderVisao() {
    const ano = mes.slice(0, 4);
    const mesesAno = [];
    for (let numero = 1; numero <= 12; numero += 1) {
      mesesAno.push(saldoMes(`${ano}-${String(numero).padStart(2, "0")}`));
    }
    const temMovimento = mesesAno.some((item) => item.entradas > 0 || item.saidas > 0);
    $("#visao-ano").textContent = ano;
    $("#legenda-grafico").hidden = !temMovimento;
    $("#grafico").hidden = !temMovimento;
    $("#visao-vazia").hidden = temMovimento;
    desenharGrafico(mesesAno);
    desenharMesesSaldo(mesesAno);
    desenharMaioresSaidas(mesesAno);
  }

  function desenharGrafico(mesesAno) {
    const grafico = $("#grafico");
    grafico.replaceChildren();
    const maximo = Math.max(1, ...mesesAno.map((item) => Math.max(item.entradas, item.saidas)));
    mesesAno.forEach((item) => {
      const botao = document.createElement("button");
      botao.type = "button";
      botao.className = "mes-barra";
      if (item.competencia === mes) botao.classList.add("atual");
      if (item.sobra < 0) botao.classList.add("negativo");
      botao.setAttribute(
        "aria-label",
        `${nomeMesCurto(item.competencia)}: entradas ${formatarCentavos(item.entradas)}, saídas ${formatarCentavos(item.saidas)}`
      );
      const barras = document.createElement("span");
      barras.className = "barras";
      barras.append(barraGrafico(item.entradas, maximo, ""), barraGrafico(item.saidas, maximo, "saida"));
      const sigla = document.createElement("span");
      sigla.textContent = siglaMes(item.competencia);
      botao.append(barras, sigla);
      botao.addEventListener("click", () => definirMes(item.competencia));
      grafico.append(botao);
    });
  }

  function barraGrafico(valor, maximo, classe) {
    const barra = document.createElement("span");
    barra.className = classe ? `barra ${classe}` : "barra";
    barra.style.height = valor > 0 ? `${Math.max(4, Math.round((valor / maximo) * 148))}px` : "0";
    return barra;
  }

  function desenharMesesSaldo(mesesAno) {
    const vermelho = $("#meses-vermelho");
    const sobra = $("#meses-sobra");
    vermelho.replaceChildren();
    sobra.replaceChildren();
    const negativos = mesesAno.filter((item) => item.sobra < 0);
    const positivos = mesesAno.filter((item) => item.sobra > 0);
    negativos.forEach((item) => vermelho.append(linhaMes(item, "negativo")));
    positivos.forEach((item) => sobra.append(linhaMes(item, "positivo")));
    $("#vazio-vermelho").hidden = negativos.length > 0;
    $("#vazio-sobra").hidden = positivos.length > 0;
  }

  function linhaMes(item, classe) {
    const li = document.createElement("li");
    const nome = document.createElement("span");
    nome.textContent = nomeMesCurto(item.competencia);
    const valor = document.createElement("strong");
    valor.className = classe;
    valor.textContent = formatarCentavos(item.sobra);
    li.append(nome, valor);
    return li;
  }

  function desenharMaioresSaidas(mesesAno) {
    const listaGastos = $("#maiores-saidas");
    const saidas = mesesAno
      .flatMap((item) => item.itens.filter((lancamento) => lancamento.tipo === "saida"))
      .sort((a, b) => b.centavos - a.centavos || (a.data < b.data ? 1 : -1))
      .slice(0, 5);
    listaGastos.replaceChildren();
    $("#vazio-gastos").hidden = saidas.length > 0;
    listaGastos.hidden = saidas.length === 0;
    saidas.forEach((item) => {
      const li = document.createElement("li");
      const corpo = document.createElement("div");
      const nome = document.createElement("p");
      nome.textContent = item.descricao;
      const quando = document.createElement("small");
      quando.textContent = nomeMesCurto(item.competencia);
      corpo.append(nome, quando);
      const valor = document.createElement("strong");
      valor.textContent = formatarCentavos(item.centavos);
      li.append(corpo, valor);
      listaGastos.append(li);
    });
  }

  function mostrarListaRelatorio(tipo) {
    listaRelatorio = tipo === "saida" ? "saida" : "entrada";
    const entradas = listaRelatorio === "entrada";
    $("#rel-secao-entradas").classList.toggle("filtro-oculto", !entradas);
    $("#rel-secao-saidas").classList.toggle("filtro-oculto", entradas);
    $("#rel-secao-pendencias").classList.toggle("filtro-oculto", !entradas);
    $("#rel-filtro-entrada").classList.toggle("ativo", entradas);
    $("#rel-filtro-saida").classList.toggle("ativo", !entradas);
    $("#rel-filtro-entrada").setAttribute("aria-pressed", String(entradas));
    $("#rel-filtro-saida").setAttribute("aria-pressed", String(!entradas));
  }

  function desenharLista(itens, destino, leitura) {
    destino.replaceChildren();
    let diaAnterior = "";
    itens.forEach((item) => {
      if (item.data !== diaAnterior) {
        const dia = document.createElement("li");
        dia.className = "dia";
        dia.textContent = formatarDia(item.data);
        destino.append(dia);
        diaAnterior = item.data;
      }
      destino.append(criarItem(item, leitura));
    });
  }

  function criarItem(item, leitura) {
    const li = document.createElement("li");
    li.className = leitura ? "item leitura" : "item";

    const corpo = document.createElement("div");
    corpo.className = "item-corpo";

    const descricao = document.createElement("p");
    descricao.className = "item-desc";
    descricao.textContent = item.descricao;
    corpo.append(descricao);

    if (item.clienteNome) {
      const cliente = document.createElement("p");
      cliente.className = "item-cliente";
      cliente.textContent = item.clienteTelefone
        ? `${item.clienteNome} · ${item.clienteTelefone}`
        : item.clienteNome;
      corpo.append(cliente);
    }

    const meta = document.createElement("p");
    meta.className = "item-meta";
    selosDoItem(item).forEach((dados) => {
      const selo = document.createElement("span");
      selo.className = `selo ${dados.classe}`;
      selo.textContent = dados.texto;
      meta.append(selo);
    });
    corpo.append(meta);

    const valor = document.createElement("p");
    valor.className = `item-valor ${item.tipo}`;
    valor.textContent = `${item.tipo === "entrada" ? "+" : "−"} ${formatarCentavos(item.centavos)}`;

    li.append(corpo, valor);
    if (!leitura) {
      const acoes = document.createElement("div");
      acoes.className = "item-acoes";
      if (item.tipo === "entrada" && (item.status === "a_receber" || item.status === "em_atraso")) {
        acoes.append(criarAcao("Recebi", "receber", item.id, false, item.competencia));
      }
      if (item.tipo === "entrada" && (item.status === "recebido" || item.status === "pago")) {
        acoes.append(criarAcao("Desfazer", "desfazer", item.id, false, item.competencia));
      }
      acoes.append(
        criarAcao("Editar", "editar", item.id),
        criarAcao("Excluir", "excluir", item.id, true)
      );
      li.append(acoes);
    }
    return li;
  }

  function selosDoItem(item) {
    if (item.tipo === "saida") return [{ texto: "Saída", classe: "saida" }];
    const status = {
      recebido: ["Recebido", "pago"],
      pago: ["Pago", "pago"],
      em_atraso: ["Em atraso", "atraso"],
      a_receber: ["A receber", "pendente"]
    }[item.status] || ["Entrada", "entrada"];
    const cobranca = item.modalidade === "recorrente"
      ? ["Recorrente", "neutro"]
      : ["Avulsa", "neutro"];
    return [
      { texto: status[0], classe: status[1] },
      { texto: cobranca[0], classe: cobranca[1] }
    ];
  }

  function criarAcao(texto, acao, id, excluir, competencia) {
    const botao = document.createElement("button");
    botao.type = "button";
    botao.className = excluir ? "acao acao-excluir" : "acao";
    botao.dataset.acao = acao;
    botao.dataset.id = id;
    if (competencia) botao.dataset.competencia = competencia;
    botao.textContent = texto;
    return botao;
  }

  function iniciarEdicao(item) {
    editandoId = item.id;
    const radio = formulario.querySelector(`input[name="tipo"][value="${item.tipo}"]`);
    if (radio) radio.checked = true;
    if (item.tipo === "entrada") {
      const competencia = item.data.slice(0, 7);
      const recebido = item.modalidade === "recorrente"
        ? (item.pagamentos || []).includes(competencia)
        : item.situacao === "recebido";
      formulario.querySelector(`input[name="situacao"][value="${recebido ? "recebido" : "a_receber"}"]`).checked = true;
      formulario.querySelector(`input[name="modalidade"][value="${item.modalidade === "recorrente" ? "recorrente" : "avulsa"}"]`).checked = true;
    }
    atualizarTipo();
    valorInput.value = (item.centavos / 100).toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    descricaoInput.value = item.descricao;
    dataInput.value = item.data;
    preencherClientes(item.clienteId || "");
    tituloForm.textContent = "Editar lançamento";
    botaoSalvar.textContent = "Salvar";
    botaoCancelar.hidden = false;
    limparErro();
    abrirFormulario();
    valorInput.focus();
  }

  function pedirExclusao(item) {
    excluindoId = item.id;
    const extra = item.modalidade === "recorrente" ? " A cobrança recorrente inteira será apagada." : "";
    confirmaTexto.textContent = `${item.descricao} · ${formatarCentavos(item.centavos)}.${extra}`;
    if (typeof dialogo.showModal === "function") dialogo.showModal();
    else if (window.confirm(`Excluir ${item.descricao}?`)) excluirAtual();
  }

  async function excluirAtual() {
    if (!excluindoId || ocupado) return;
    const id = excluindoId;
    ocupado = true;
    try {
      await requisicao("DELETE", null, id);
      if (editandoId === id) limparFormulario();
      lancamentos = lancamentos.filter((item) => item.id !== id);
      excluindoId = null;
      render();
      avisar("Lançamento excluído");
    } catch (e) {
      mostrarErro(e.message);
      avisar("Não foi possível excluir");
    } finally {
      ocupado = false;
    }
  }

  function corpoLancamento(tipo, descricao, centavos, data) {
    const corpo = { tipo, descricao, centavos, data, clienteId: $("#cliente").value || "" };
    if (tipo === "entrada") {
      corpo.situacao = opcaoMarcada("situacao") === "recebido" ? "recebido" : "a_receber";
      corpo.modalidade = opcaoMarcada("modalidade") === "recorrente" ? "recorrente" : "avulsa";
    }
    return corpo;
  }

  function mascaraTelefone(valor) {
    const digitos = String(valor).replace(/\D/g, "").slice(0, 11);
    if (digitos.length <= 10) {
      return digitos
        .replace(/(\d{2})(\d)/, "($1) $2")
        .replace(/(\d{4})(\d)/, "$1-$2");
    }
    return digitos
      .replace(/(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{5})(\d)/, "$1-$2");
  }

  function preencherClientes(selecionado) {
    const select = $("#cliente");
    const atual = selecionado === undefined ? select.value : selecionado;
    const vazio = new Option("Sem cliente", "");
    select.replaceChildren(vazio);
    clientes
      .slice()
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
      .forEach((cliente) => {
        select.append(new Option(`${cliente.nome} · ${cliente.telefone}`, cliente.id));
      });
    select.value = clientes.some((cliente) => cliente.id === atual) ? atual : "";
  }

  function clienteCombina(cliente, busca) {
    const texto = busca.trim().toLocaleLowerCase("pt-BR");
    if (!texto) return true;
    if (cliente.nome.toLocaleLowerCase("pt-BR").includes(texto)) return true;
    if (cliente.telefone.toLocaleLowerCase("pt-BR").includes(texto)) return true;
    const digitos = texto.replace(/\D/g, "");
    return Boolean(digitos) && cliente.telefone.replace(/\D/g, "").includes(digitos);
  }

  function renderClientes() {
    const listaClientes = $("#lista-clientes");
    const vazioClientes = $("#vazio-clientes");
    const busca = $("#busca-cliente").value;
    const ordenados = clientes.slice().sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    const visiveis = ordenados.filter((cliente) => clienteCombina(cliente, busca));
    listaClientes.replaceChildren();
    $("#contagem-clientes").textContent = busca.trim()
      ? `${visiveis.length} de ${ordenados.length}`
      : contagem(ordenados.length, "cliente", "clientes");
    $("#vazio-clientes-texto").textContent = ordenados.length
      ? "Nenhum cliente encontrado."
      : "Nenhum cliente cadastrado.";
    vazioClientes.hidden = visiveis.length > 0;
    listaClientes.hidden = visiveis.length === 0;
    visiveis.forEach((cliente) => {
      const li = document.createElement("li");
      li.className = "item";
      const corpo = document.createElement("div");
      corpo.className = "item-corpo";
      const nome = document.createElement("p");
      nome.className = "item-desc";
      nome.textContent = cliente.nome;
      const telefone = document.createElement("p");
      telefone.className = "item-cliente";
      telefone.textContent = cliente.telefone;
      corpo.append(nome, telefone);
      const acoes = document.createElement("div");
      acoes.className = "item-acoes";
      const editar = document.createElement("button");
      editar.type = "button";
      editar.className = "acao";
      editar.textContent = "Editar";
      editar.addEventListener("click", () => iniciarEdicaoCliente(cliente));
      const excluir = document.createElement("button");
      excluir.type = "button";
      excluir.className = "acao acao-excluir";
      excluir.textContent = "Excluir";
      excluir.addEventListener("click", () => pedirExclusaoCliente(cliente));
      acoes.append(editar, excluir);
      li.append(corpo, acoes);
      listaClientes.append(li);
    });
  }

  function limparCliente() {
    editandoClienteId = null;
    $("#form-cliente").reset();
    $("#titulo-cliente").textContent = "Cadastrar cliente";
    $("#salvar-cliente").textContent = "Cadastrar";
    $("#cancelar-cliente").hidden = true;
    const erroCliente = $("#erro-cliente");
    erroCliente.hidden = true;
    erroCliente.textContent = "";
    if (modalCliente.open) modalCliente.close();
  }

  function abrirCliente() {
    if (modalCliente.open) return;
    if (typeof modalCliente.showModal === "function") modalCliente.showModal();
  }

  function iniciarEdicaoCliente(cliente) {
    editandoClienteId = cliente.id;
    $("#cliente-nome").value = cliente.nome;
    $("#cliente-telefone").value = cliente.telefone;
    $("#titulo-cliente").textContent = "Editar cliente";
    $("#salvar-cliente").textContent = "Salvar";
    $("#cancelar-cliente").hidden = false;
    const erroCliente = $("#erro-cliente");
    erroCliente.hidden = true;
    erroCliente.textContent = "";
    abrirCliente();
    $("#cliente-nome").focus();
  }

  function refletirClienteNosLancamentos(cliente) {
    lancamentos.forEach((item) => {
      if (item.clienteId !== cliente.id) return;
      item.clienteNome = cliente.nome;
      item.clienteTelefone = cliente.telefone;
    });
  }

  function desvincularCliente(id) {
    lancamentos.forEach((item) => {
      if (item.clienteId !== id) return;
      item.clienteId = "";
      item.clienteNome = "";
      item.clienteTelefone = "";
    });
  }

  async function salvarCliente(event) {
    event.preventDefault();
    if (ocupado) return;
    const nome = $("#cliente-nome").value.trim().replace(/\s+/g, " ");
    const telefone = mascaraTelefone($("#cliente-telefone").value);
    const erroCliente = $("#erro-cliente");
    const digitos = telefone.replace(/\D/g, "");
    if (!nome || nome.length > 80) {
      erroCliente.textContent = "Informe o nome do cliente.";
      erroCliente.hidden = false;
      $("#cliente-nome").focus();
      return;
    }
    if (digitos.length < 10) {
      erroCliente.textContent = "Informe o telefone com DDD.";
      erroCliente.hidden = false;
      $("#cliente-telefone").focus();
      return;
    }
    erroCliente.hidden = true;
    ocupado = true;
    $("#salvar-cliente").disabled = true;
    try {
      const eraEdicao = Boolean(editandoClienteId);
      const salvo = eraEdicao
        ? await requisicao("PUT", { nome, telefone }, editandoClienteId, "api/clientes.php")
        : await requisicao("POST", { id: novoId(), nome, telefone }, null, "api/clientes.php");
      if (!salvo) throw new Error("Não foi possível salvar o cliente.");
      const indice = clientes.findIndex((cliente) => cliente.id === salvo.id);
      if (indice >= 0) clientes[indice] = salvo;
      else clientes.push(salvo);
      if (eraEdicao) refletirClienteNosLancamentos(salvo);
      limparCliente();
      preencherClientes();
      renderClientes();
      render();
      avisar(eraEdicao ? "Cliente atualizado" : "Cliente cadastrado");
    } catch (e) {
      erroCliente.textContent = e.message;
      erroCliente.hidden = false;
    } finally {
      ocupado = false;
      $("#salvar-cliente").disabled = false;
    }
  }

  function pedirExclusaoCliente(cliente) {
    excluindoId = null;
    excluindoClienteId = cliente.id;
    $("#dialogo-titulo").textContent = "Excluir cliente";
    confirmaTexto.textContent = `${cliente.nome} · ${cliente.telefone}. Os lançamentos continuam, sem esse vínculo.`;
    if (typeof dialogo.showModal === "function") dialogo.showModal();
  }

  async function excluirClienteAtual() {
    if (!excluindoClienteId || ocupado) return;
    const id = excluindoClienteId;
    ocupado = true;
    try {
      await requisicao("DELETE", null, id, "api/clientes.php");
      clientes = clientes.filter((cliente) => cliente.id !== id);
      desvincularCliente(id);
      if (editandoClienteId === id) limparCliente();
      excluindoClienteId = null;
      preencherClientes();
      renderClientes();
      render();
      avisar("Cliente excluído");
    } catch (e) {
      avisar(e.message || "Não foi possível excluir");
    } finally {
      ocupado = false;
    }
  }

  function substituirLancamento(atualizado) {
    if (!atualizado) throw new Error("Não foi possível atualizar o lançamento.");
    const indice = lancamentos.findIndex((item) => item.id === atualizado.id);
    if (indice >= 0) lancamentos[indice] = atualizado;
    else lancamentos.push(atualizado);
  }

  async function alterarRecebimento(item, competencia, receber) {
    if (ocupado) return;
    ocupado = true;
    try {
      if (item.modalidade === "recorrente") {
        if (receber) {
          substituirLancamento(normalizar(await requisicao(
            "POST",
            { id: item.id, competencia },
            null,
            "api/lancamentos.php?acao=receber"
          )));
        } else {
          await requisicao(
            "DELETE",
            null,
            null,
            `api/lancamentos.php?acao=receber&id=${encodeURIComponent(item.id)}&competencia=${encodeURIComponent(competencia)}`
          );
          item.pagamentos = (item.pagamentos || []).filter((mesPago) => mesPago !== competencia);
        }
      } else {
        substituirLancamento(normalizar(await requisicao("PUT", {
          tipo: item.tipo,
          descricao: item.descricao,
          centavos: item.centavos,
          data: item.data,
          situacao: receber ? "recebido" : "a_receber",
          modalidade: item.modalidade === "recorrente" ? "recorrente" : "avulsa",
          clienteId: item.clienteId || ""
        }, item.id)));
      }
      render();
      avisar(receber ? "Marcado como recebido" : "Recebimento desfeito");
    } catch (e) {
      mostrarErro(e.message);
    } finally {
      ocupado = false;
    }
  }

  async function salvarFormulario() {
    if (ocupado) return;
    limparErro();
    const centavos = parseValor(valorInput.value);
    const descricao = descricaoInput.value.trim().replace(/\s+/g, " ");
    const data = dataInput.value;
    const tipo = tipoSelecionado();

    if (!Number.isInteger(centavos)) {
      mostrarErro("Informe um valor maior que zero. Ex.: 1500,50");
      valorInput.focus();
      return;
    }
    if (!descricao) {
      mostrarErro("Informe uma descrição.");
      descricaoInput.focus();
      return;
    }
    if (descricao.length > 80) {
      mostrarErro("A descrição pode ter no máximo 80 caracteres.");
      descricaoInput.focus();
      return;
    }
    if (!dataValida(data)) {
      mostrarErro("Informe uma data válida.");
      dataInput.focus();
      return;
    }

    const eraEdicao = Boolean(editandoId);
    const idEdicao = editandoId;
    ocupado = true;
    botaoSalvar.disabled = true;
    try {
      if (eraEdicao) {
        const atualizado = normalizar(await requisicao("PUT", corpoLancamento(tipo, descricao, centavos, data), idEdicao));
        if (!atualizado) throw new Error("Não foi possível atualizar o lançamento.");
        const indice = lancamentos.findIndex((item) => item.id === idEdicao);
        if (indice >= 0) lancamentos[indice] = atualizado;
        else lancamentos.push(atualizado);
      } else {
        const criado = normalizar(await requisicao("POST", {
          id: novoId(),
          ...corpoLancamento(tipo, descricao, centavos, data)
        }));
        if (!criado) throw new Error("Não foi possível registrar o lançamento.");
        lancamentos.push(criado);
      }

      const mesLancamento = data.slice(0, 7);
      editandoId = null;
      if (mesLancamento !== mes) definirMes(mesLancamento);
      else render();
      limparFormulario();
      avisar(eraEdicao ? "Lançamento atualizado" : tipo === "entrada" ? "Entrada registrada" : "Saída registrada");
    } catch (e) {
      mostrarErro(e.message);
    } finally {
      ocupado = false;
      botaoSalvar.disabled = false;
    }
  }

  function mostrarAba(nome) {
    const titulos = {
      inicio: "Resumo do mês",
      lancamentos: "Lançamentos",
      relatorios: "Relatório de um mês",
      clientes: "Clientes",
      usuarios: "Usuários",
      configuracoes: "Configurações"
    };
    if (!titulos[nome]) return;
    document.querySelectorAll("main .aba").forEach((secao) => {
      secao.hidden = secao.id !== `aba-${nome}`;
    });
    if (nome !== "lancamentos" && modalLancamento.open) modalLancamento.close();
    if (nome !== "clientes" && modalCliente.open) limparCliente();
    document.body.classList.toggle("sem-mes", nome !== "inicio" && nome !== "lancamentos");
    marcaSub.textContent = titulos[nome];
    document.querySelectorAll("[data-aba]").forEach((botao) => {
      const ativo = botao.dataset.aba === nome;
      botao.classList.toggle("ativo", ativo);
      if (ativo) botao.setAttribute("aria-current", "page");
      else botao.removeAttribute("aria-current");
    });
    window.scrollTo(0, 0);
  }

  function avisar(texto) {
    toast.textContent = texto;
    toast.classList.add("visivel");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("visivel"), 2400);
  }

  function esconderSplash() {
    const restante = Math.max(0, ESPERA_SPLASH - (performance.now() - inicioSplash));
    Promise.all([dadosProntos, espera(restante)]).then(() => {
      splash.classList.add("saindo");
      app.removeAttribute("aria-hidden");
      window.setTimeout(() => splash.remove(), 500);
    });
  }

  function prepararInstalacao() {
    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      instalarEvento = event;
      botaoInstalar.hidden = false;
    });

    botaoInstalar.addEventListener("click", async () => {
      if (!instalarEvento) return;
      instalarEvento.prompt();
      await instalarEvento.userChoice;
      instalarEvento = null;
      botaoInstalar.hidden = true;
    });

    window.addEventListener("appinstalled", () => {
      botaoInstalar.hidden = true;
      instalarEvento = null;
    });
  }

  $("#mes-anterior").addEventListener("click", () => deslocarMes(-1));
  $("#mes-proximo").addEventListener("click", () => deslocarMes(1));
  mesInput.addEventListener("change", () => {
    if (mesInput.value) definirMes(mesInput.value);
  });
  $("#rel-mes-anterior").addEventListener("click", () => deslocarMes(-1));
  $("#rel-mes-proximo").addEventListener("click", () => deslocarMes(1));
  relMesInput.addEventListener("change", () => {
    if (relMesInput.value) definirMes(relMesInput.value);
  });

  document.querySelectorAll("[data-aba]").forEach((botao) => {
    botao.addEventListener("click", () => mostrarAba(botao.dataset.aba));
  });

  $("#imprimir").addEventListener("click", () => {
    document.body.classList.add("imprimir-relatorio");
    window.print();
  });
  window.addEventListener("afterprint", () => {
    document.body.classList.remove("imprimir-relatorio");
  });

  formulario.addEventListener("change", (event) => {
    if (event.target.name === "tipo" || event.target.name === "situacao" || event.target.name === "modalidade") {
      atualizarTipo();
    }
  });
  $("#cliente-telefone").addEventListener("input", () => {
    $("#cliente-telefone").value = mascaraTelefone($("#cliente-telefone").value);
  });
  $("#form-cliente").addEventListener("submit", salvarCliente);
  $("#cancelar-cliente").addEventListener("click", limparCliente);
  $("#busca-cliente").addEventListener("input", renderClientes);
  function abrirNovoCliente() {
    limparCliente();
    abrirCliente();
    $("#cliente-nome").focus();
  }

  $("#abrir-cliente").addEventListener("click", abrirNovoCliente);
  $("#abrir-cliente-movel").addEventListener("click", abrirNovoCliente);
  $("#fechar-cliente").addEventListener("click", limparCliente);
  modalCliente.addEventListener("cancel", (event) => {
    event.preventDefault();
    limparCliente();
  });
  modalCliente.addEventListener("click", (event) => {
    if (event.target === modalCliente) limparCliente();
  });
  formulario.addEventListener("submit", (event) => {
    event.preventDefault();
    salvarFormulario();
  });
  botaoCancelar.addEventListener("click", limparFormulario);
  function abrirNovoLancamento() {
    limparFormulario();
    abrirFormulario();
    valorInput.focus();
  }

  $("#abrir-lancamento").addEventListener("click", abrirNovoLancamento);
  $("#abrir-lancamento-desk").addEventListener("click", abrirNovoLancamento);
  $("#fechar-lancamento").addEventListener("click", limparFormulario);
  modalLancamento.addEventListener("cancel", (event) => {
    event.preventDefault();
    limparFormulario();
  });
  modalLancamento.addEventListener("click", (event) => {
    if (event.target === modalLancamento) limparFormulario();
  });
  $("#filtro-situacao").addEventListener("change", render);
  $("#rel-filtro-entrada").addEventListener("click", () => mostrarListaRelatorio("entrada"));
  $("#rel-filtro-saida").addEventListener("click", () => mostrarListaRelatorio("saida"));

  function alinharMenu() {
    const barra = document.querySelector(".topbar");
    if (barra) document.documentElement.style.setProperty("--topo", `${barra.offsetHeight}px`);
  }

  const iconeRecolher = $("#fechar-menu").innerHTML;
  const iconeExpandir = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

  function definirMenu(aberto) {
    document.body.classList.toggle("menu-fechado", !aberto);
    const botao = $("#fechar-menu");
    botao.setAttribute("aria-label", aberto ? "Fechar menu" : "Abrir menu");
    botao.title = aberto ? "Fechar menu" : "Abrir menu";
    botao.innerHTML = aberto ? iconeRecolher : iconeExpandir;
  }

  $("#fechar-menu").addEventListener("click", () => {
    definirMenu(document.body.classList.contains("menu-fechado"));
  });
  window.addEventListener("resize", alinharMenu);
  alinharMenu();

  function aoClicarLista(event) {
    const botao = event.target.closest("button[data-acao]");
    if (!botao) return;
    const item = lancamentos.find((lancamento) => lancamento.id === botao.dataset.id);
    if (!item) return;
    if (botao.dataset.acao === "editar") iniciarEdicao(item);
    if (botao.dataset.acao === "excluir") pedirExclusao(item);
    if (botao.dataset.acao === "receber") alterarRecebimento(item, botao.dataset.competencia, true);
    if (botao.dataset.acao === "desfazer") alterarRecebimento(item, botao.dataset.competencia, false);
  }

  listaEntradasMes.addEventListener("click", aoClicarLista);
  listaSaidasMes.addEventListener("click", aoClicarLista);
  $("#pendencias").addEventListener("click", aoClicarLista);

  $("#confirma-nao").addEventListener("click", () => {
    excluindoId = null;
    excluindoClienteId = null;
    $("#dialogo-titulo").textContent = "Excluir lançamento";
    dialogo.close();
  });
  $("#confirma-sim").addEventListener("click", () => {
    if (excluindoClienteId) excluirClienteAtual();
    else excluirAtual();
    dialogo.close();
  });
  dialogo.addEventListener("click", (event) => {
    if (event.target === dialogo) {
      excluindoId = null;
      excluindoClienteId = null;
      $("#dialogo-titulo").textContent = "Excluir lançamento";
      dialogo.close();
    }
  });
  dialogo.addEventListener("close", () => {
    excluindoId = null;
    excluindoClienteId = null;
    $("#dialogo-titulo").textContent = "Excluir lançamento";
  });

  mesInput.value = mes;
  mesRotulo.textContent = rotuloMes(mes);
  relMesInput.value = mes;
  relMesRotulo.textContent = rotuloMes(mes);
  dataInput.value = dataSugerida();
  atualizarTipo();
  document.querySelectorAll(".js-sair").forEach((botao) => {
    botao.addEventListener("click", async () => {
      try {
        await fetch(new URL("api/sessao.php", window.location.href), {
          method: "DELETE",
          credentials: "same-origin",
          cache: "no-store"
        });
      } catch (e) {
        /* segue para a tela de login mesmo se a rede falhar */
      }
      window.location.replace("login.html");
    });
  });

  prepararInstalacao();

  fetch(new URL("api/sessao.php", window.location.href), { cache: "no-store", credentials: "same-origin" })
    .then((resposta) => (resposta.ok ? resposta.json() : Promise.reject()))
    .then((sessao) => {
      if (!sessao || !sessao.autenticado) {
        window.location.replace("login.html");
        return;
      }
      dadosProntos = carregarRemoto().catch((e) => {
        if (e.status === 401) return;
        mostrarErro(e.message || "Não foi possível carregar os lançamentos.");
        avisar("Banco indisponível");
        render();
      });
      if (document.readyState === "complete") esconderSplash();
      else window.addEventListener("load", esconderSplash);
    })
    .catch(() => {
      window.location.replace("login.html");
    });
})();
