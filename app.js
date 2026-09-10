// --- ESTADO & CONFIGURAÇÕES ---
// Estrutura do ponto por dias: { "AAAA-MM-DD": { e1: "05:20", s1: "11:00", e2: "12:00", s2: "14:40" } }
let diasPonto = JSON.parse(localStorage.getItem('ponto_dias') || '{}');

let escala = JSON.parse(localStorage.getItem('ponto_escala') || JSON.stringify({
  entrada: "05:20",
  almocoSaida: "11:00",
  almocoVolta: "12:00",
  saida: "14:40",
  cargaDia: 8.0
}));

let config = JSON.parse(localStorage.getItem('ponto_config') || JSON.stringify({
  tipoRemuneracao: "mensal", // "mensal" ou "hora"
  valorSalario: 3500,
  cargaMensal: 220,
  adicionalHE: 50,
  grauInsalubridade: 20,
  baseInsalubridade: "minimo",
  salarioMinimo: 1412
}));

// Rastreamento para não repetir notificações no mesmo dia
let notificacoesEnviadas = JSON.parse(localStorage.getItem('ponto_notif_log') || '{}');

// Preenchimento inicial das telas
function carregarValores() {
  // Escala
  document.getElementById('escEntrada').value = escala.entrada;
  document.getElementById('escAlmocoSaida').value = escala.almocoSaida;
  document.getElementById('escAlmocoVolta').value = escala.almocoVolta;
  document.getElementById('escSaida').value = escala.saida;
  document.getElementById('escCargaDia').value = escala.cargaDia;

  // Parâmetros Financeiros
  document.getElementById('cfgTipoRemuneracao').value = config.tipoRemuneracao;
  document.getElementById('cfgValorSalario').value = config.valorSalario;
  document.getElementById('cfgCargaMensal').value = config.cargaMensal;
  document.getElementById('cfgAdicionalHE').value = config.adicionalHE;
  document.getElementById('cfgGrauInsalubridade').value = config.grauInsalubridade;
  document.getElementById('cfgBaseInsalubridade').value = config.baseInsalubridade;
  document.getElementById('cfgSalarioMinimo').value = config.salarioMinimo;

  ajustarExibicaoCargaMensal();
}

function ajustarExibicaoCargaMensal() {
  const tipo = document.getElementById('cfgTipoRemuneracao').value;
  const campoCarga = document.getElementById('campoCargaMensal');
  if (tipo === 'hora') {
    campoCarga.style.display = 'none';
  } else {
    campoCarga.style.display = 'flex';
  }
}

document.getElementById('cfgTipoRemuneracao').addEventListener('change', ajustarExibicaoCargaMensal);

// Data de hoje como padrão
document.getElementById('regData').value = new Date().toISOString().split('T')[0];

// --- MENU LATERAL (DRAWER) ---
const btnMenu = document.getElementById('btnMenu');
const btnFecharMenu = document.getElementById('btnFecharMenu');
const menuLateral = document.getElementById('menuLateral');
const overlay = document.getElementById('overlay');
const navLinks = document.querySelectorAll('.nav-item');

function alternarMenu() {
  menuLateral.classList.toggle('open');
  overlay.classList.toggle('open');
}

btnMenu.addEventListener('click', alternarMenu);
btnFecharMenu.addEventListener('click', alternarMenu);
overlay.addEventListener('click', alternarMenu);

navLinks.forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const abaAlvo = link.getAttribute('data-aba');

    navLinks.forEach(l => l.classList.remove('active'));
    link.classList.add('active');

    document.querySelectorAll('.aba-conteudo').forEach(aba => aba.classList.remove('active'));
    document.getElementById(abaAlvo).classList.add('active');

    alternarMenu();
  });
});

// --- OCR CONTROL ID (DATA:DD/MM/AAAA HORA:HH:MM) ---
const inputFoto = document.getElementById('inputFoto');
const statusOcr = document.getElementById('statusOcr');

inputFoto.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  statusOcr.innerText = "🔍 Lendo comprovante Control iD...";

  try {
    const worker = await Tesseract.createWorker('por');
    const res = await worker.recognize(file);
    await worker.terminate();

    const raw = res.data.text.toUpperCase();
    statusOcr.innerText = "Texto processado! Extraindo data e hora...";

    let regexData = /DATA\s*[:\.]?\s*(\d{2})[\/\.-](\d{2})[\/\.-](\d{4})/;
    let regexHora = /HORA\s*[:\.]?\s*(\d{2})[:\.](\d{2})/;

    let matchData = raw.match(regexData);
    let matchHora = raw.match(regexHora);

    if (!matchData) matchData = raw.match(/(\d{2})[\/\.-](\d{2})[\/\.-](\d{4})/);
    if (!matchHora) matchHora = raw.match(/(\d{2})[:\.](\d{2})/);

    if (matchData) {
      const [_, dia, mes, ano] = matchData;
      const dataIso = `${ano}-${mes}-${dia}`;
      document.getElementById('regData').value = dataIso;

      const diaObj = diasPonto[dataIso] || {};
      const selectTipo = document.getElementById('regTipo');
      if (!diaObj.e1) selectTipo.value = "e1";
      else if (!diaObj.s1) selectTipo.value = "s1";
      else if (!diaObj.e2) selectTipo.value = "e2";
      else selectTipo.value = "s2";
    }

    if (matchHora) {
      document.getElementById('regHora').value = `${matchHora[1]}:${matchHora[2]}`;
    }

    statusOcr.innerText = "✅ Leitura concluída! Revise antes de lançar.";
  } catch (err) {
    console.error(err);
    statusOcr.innerText = "⚠️ Erro na leitura automática. Digite manualmente.";
  }
});

// --- REGISTRO E GRAVAÇÃO ---
document.getElementById('btnSalvarBatida').addEventListener('click', () => {
  const data = document.getElementById('regData').value;
  const hora = document.getElementById('regHora').value;
  const tipo = document.getElementById('regTipo').value;

  if (!data || !hora) {
    alert("Informe data e hora.");
    return;
  }

  if (!diasPonto[data]) {
    diasPonto[data] = { e1: "", s1: "", e2: "", s2: "" };
  }

  diasPonto[data][tipo] = hora;
  localStorage.setItem('ponto_dias', JSON.stringify(diasPonto));

  renderizarTabela();
  calcularMetricas();
  statusOcr.innerText = `Batida registrada com sucesso!`;
});

// Salvar Escala
document.getElementById('btnSalvarEscala').addEventListener('click', () => {
  escala = {
    entrada: document.getElementById('escEntrada').value,
    almocoSaida: document.getElementById('escAlmocoSaida').value,
    almocoVolta: document.getElementById('escAlmocoVolta').value,
    saida: document.getElementById('escSaida').value,
    cargaDia: parseFloat(document.getElementById('escCargaDia').value) || 8.0
  };
  localStorage.setItem('ponto_escala', JSON.stringify(escala));
  calcularMetricas();
  alert("Horários da escala atualizados! Os lembretes soarão 5 min antes desses horários.");
});

// Salvar Configuração Salarial
document.getElementById('btnSalvarConfig').addEventListener('click', () => {
  config = {
    tipoRemuneracao: document.getElementById('cfgTipoRemuneracao').value,
    valorSalario: parseFloat(document.getElementById('cfgValorSalario').value) || 0,
    cargaMensal: parseFloat(document.getElementById('cfgCargaMensal').value) || 220,
    adicionalHE: parseFloat(document.getElementById('cfgAdicionalHE').value) || 50,
    grauInsalubridade: parseFloat(document.getElementById('cfgGrauInsalubridade').value) || 0,
    baseInsalubridade: document.getElementById('cfgBaseInsalubridade').value,
    salarioMinimo: parseFloat(document.getElementById('cfgSalarioMinimo').value) || 1412
  };
  localStorage.setItem('ponto_config', JSON.stringify(config));
  calcularMetricas();
  alert("Configurações salariais salvas!");
});

window.excluirDia = function(data) {
  if (confirm(`Excluir as batidas do dia ${data.split('-').reverse().join('/')}?`)) {
    delete diasPonto[data];
    localStorage.setItem('ponto_dias', JSON.stringify(diasPonto));
    renderizarTabela();
    calcularMetricas();
  }
};

document.getElementById('btnLimparTudo').addEventListener('click', () => {
  if (confirm("Deseja apagar todos os registros da tabela?")) {
    diasPonto = {};
    localStorage.removeItem('ponto_dias');
    renderizarTabela();
    calcularMetricas();
  }
});

// --- CÁLCULOS E TABELA ---
function timeToMinutes(t) {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function minToHoursStr(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

function calcularDia(diaObj) {
  let minutosTrabalhados = 0;
  const e1 = timeToMinutes(diaObj.e1);
  const s1 = timeToMinutes(diaObj.s1);
  const e2 = timeToMinutes(diaObj.e2);
  const s2 = timeToMinutes(diaObj.s2);

  if (e1 !== null && s1 !== null && s1 > e1) minutosTrabalhados += (s1 - e1);
  if (e2 !== null && s2 !== null && s2 > e2) minutosTrabalhados += (s2 - e2);
  if (e1 !== null && s2 !== null && s1 === null && e2 === null && s2 > e1) minutosTrabalhados += (s2 - e1);

  const minutosPadrao = (escala.cargaDia || 8) * 60;
  let minutosExtras = 0;
  if (minutosTrabalhados > minutosPadrao) {
    minutosExtras = minutosTrabalhados - minutosPadrao;
  }

  return { minutosTrabalhados, minutosExtras };
}

function renderizarTabela() {
  const tbody = document.querySelector('#tabelaEspelho tbody');
  tbody.innerHTML = '';
  const datas = Object.keys(diasPonto).sort();

  datas.forEach(data => {
    const dia = diasPonto[data];
    const { minutosTrabalhados, minutosExtras } = calcularDia(dia);

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${data.split('-').reverse().join('/')}</td>
      <td>${dia.e1 || '-'}</td>
      <td>${dia.s1 || '-'}</td>
      <td>${dia.e2 || '-'}</td>
      <td>${dia.s2 || '-'}</td>
      <td><strong>${minToHoursStr(minutosTrabalhados)}</strong></td>
      <td style="color:${minutosExtras > 0 ? '#16a34a' : '#64748b'}">${minToHoursStr(minutosExtras)}</td>
      <td><button onclick="excluirDia('${data}')" class="btn-perigo">✕</button></td>
    `;
    tbody.appendChild(tr);
  });
}

function calcularMetricas() {
  let totalMinutosTrabalhados = 0;
  let totalMinutosExtras = 0;

  Object.keys(diasPonto).forEach(data => {
    const { minutosTrabalhados, minutosExtras } = calcularDia(diasPonto[data]);
    totalMinutosTrabalhados += minutosTrabalhados;
    totalMinutosExtras += minutosExtras;
  });

  let valorHora = 0;
  let valorSalarioBaseExibido = 0;

  if (config.tipoRemuneracao === 'hora') {
    valorHora = config.valorSalario;
    valorSalarioBaseExibido = (totalMinutosTrabalhados / 60) * valorHora;
  } else {
    valorHora = config.valorSalario / (config.cargaMensal || 220);
    valorSalarioBaseExibido = config.valorSalario;
  }

  const valorHoraExtra = valorHora * (1 + config.adicionalHE / 100);
  const totalValorExtras = (totalMinutosExtras / 60) * valorHoraExtra;

  const baseInsalubridade = (config.baseInsalubridade === 'base') ? config.valorSalario : config.salarioMinimo;
  const valorInsalubridade = baseInsalubridade * (config.grauInsalubridade / 100);

  const totalGeralBruto = valorSalarioBaseExibido + totalValorExtras + valorInsalubridade;

  document.getElementById('mHorasTrabalhadas').innerText = minToHoursStr(totalMinutosTrabalhados);
  document.getElementById('mHorasExtras').innerText = minToHoursStr(totalMinutosExtras);

  const fmtMoeda = (val) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  document.getElementById('mValorBase').innerText = fmtMoeda(valorSalarioBaseExibido);
  document.getElementById('mValorExtras').innerText = fmtMoeda(totalValorExtras);
  document.getElementById('mValorInsalubridade').innerText = fmtMoeda(valorInsalubridade);
  document.getElementById('mTotalEstimado').innerText = fmtMoeda(totalGeralBruto);
}

// --- ÔNIBUS ---
window.mostrarFrameOnibus = function(tipo) {
  const btnTabs = document.querySelectorAll('.btn-tab-onibus');
  const boxSitu = document.getElementById('boxSitu');
  const boxRlc = document.getElementById('boxRlc');

  if (tipo === 'situ') {
    boxSitu.style.display = 'block';
    boxRlc.style.display = 'none';
    btnTabs[0].classList.add('active');
    btnTabs[1].classList.remove('active');
  } else {
    boxSitu.style.display = 'none';
    boxRlc.style.display = 'block';
    btnTabs[0].classList.remove('active');
    btnTabs[1].classList.add('active');
  }
};

// --- MOTOR DE NOTIFICAÇÕES (5 MIN ANTES + MARMITA SEXTA 15H) ---

// Solicitação de permissão
document.getElementById('btnPermissaoNotif').addEventListener('click', async () => {
  if (!("Notification" in window)) {
    alert("Seu navegador não suporta notificações de área de trabalho/push.");
    return;
  }
  const perm = await Notification.requestPermission();
  if (perm === 'granted') {
    dispararNotificacao("🔔 Notificações Ativadas!", "Você será avisado 5 minutos antes de cada batida e às sextas-feiras às 15h para a marmita.");
  }
});

function dispararNotificacao(titulo, corpo) {
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(titulo, {
      body: corpo,
      icon: "https://cdn-icons-png.flaticon.com/512/2921/2921222.png",
      vibrate: [200, 100, 200]
    });
  }
}

// Converte "HH:MM" e subtrai N minutos
function obterMinutosMenosDelta(horarioStr, deltaMinutos = 5) {
  const [h, m] = horarioStr.split(':').map(Number);
  let totalMin = h * 60 + m - deltaMinutos;
  if (totalMin < 0) totalMin += 24 * 60;
  const resH = Math.floor(totalMin / 60);
  const resM = totalMin % 60;
  return `${String(resH).padStart(2, '0')}:${String(resM).padStart(2, '0')}`;
}

// Rotina checada a cada 30 segundos
function verificarAgendamentosNotificacoes() {
  const agora = new Date();
  const hojeStr = agora.toISOString().split('T')[0];
  const horaAtualStr = `${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}`;
  const diaSemana = agora.getDay(); // 0 = Domingo, 5 = Sexta-feira

  if (!notificacoesEnviadas[hojeStr]) {
    notificacoesEnviadas = { [hojeStr]: {} };
  }
  const logsHoje = notificacoesEnviadas[hojeStr];

  // 1. Lembretes das Batidas de Ponto (5 minutos antes)
  const eventosPonto = [
    { chave: 'notif_e1', horario: escala.entrada, rotulo: 'Entrada na Empresa' },
    { chave: 'notif_s1', horario: escala.almocoSaida, rotulo: 'Saída para Almoço' },
    { chave: 'notif_e2', horario: escala.almocoVolta, rotulo: 'Retorno do Almoço' },
    { chave: 'notif_s2', horario: escala.saida, rotulo: 'Saída da Empresa' }
  ];

  eventosPonto.forEach(ev => {
    if (ev.horario) {
      const horaLembrete = obterMinutosMenosDelta(ev.horario, 5);
      if (horaAtualStr === horaLembrete && !logsHoje[ev.chave]) {
        dispararNotificacao(
          "⏱️ Lembrete de Ponto (Faltam 5 min)",
          `Hora prevista de ${ev.rotulo} às ${ev.horario}. Não esqueça de bater o ponto e pegar o comprovante!`
        );
        logsHoje[ev.chave] = true;
        localStorage.setItem('ponto_notif_log', JSON.stringify(notificacoesEnviadas));
      }
    }
  });

  // 2. Lembrete da Marmita (Sexta-feira a partir das 15:00)
  // diaSemana 5 = Sexta-feira
  if (diaSemana === 5 && agora.getHours() >= 15 && !logsHoje['notif_marmita']) {
    dispararNotificacao(
      "🍱 Lembrete de Marmita!",
      "Já são 15h de sexta-feira! Lembre-se de preencher o formulário para pedir sua marmita da semana."
    );
    logsHoje['notif_marmita'] = true;
    localStorage.setItem('ponto_notif_log', JSON.stringify(notificacoesEnviadas));
  }
}

// Inicia monitor a cada 30 segundos
setInterval(verificarAgendamentosNotificacoes, 30000);
verificarAgendamentosNotificacoes();

// Inicialização Geral
carregarValores();
renderizarTabela();
calcularMetricas();