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

// --- MENU LATERAL ---
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

// --- OCR CALIBRADO PARA O FORMATO CONTROL ID (DATA:DD/MM/AAAA HORA:HH:MM) ---
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
    statusOcr.innerText = "Texto processado! Buscando data e hora...";

    // 1. Busca específica por rótulos presentes no cupom: DATA:DD/MM/AAAA e HORA:HH:MM
    let regexData = /DATA\s*[:\.]?\s*(\d{2})[\/\.-](\d{2})[\/\.-](\d{4})/;
    let regexHora = /HORA\s*[:\.]?\s*(\d{2})[:\.](\d{2})/;

    let matchData = raw.match(regexData);
    let matchHora = raw.match(regexHora);

    // Fallback caso a palavra DATA/HORA esteja ilegível ou apagada na bobina térmica
    if (!matchData) {
      matchData = raw.match(/(\d{2})[\/\.-](\d{2})[\/\.-](\d{4})/);
    }
    if (!matchHora) {
      matchHora = raw.match(/(\d{2})[:\.](\d{2})/);
    }

    if (matchData) {
      const [_, dia, mes, ano] = matchData;
      const dataIso = `${ano}-${mes}-${dia}`;
      document.getElementById('regData').value = dataIso;

      // Sugere automaticamente qual batida é com base no que já existe no dia
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

    statusOcr.innerText = "✅ Leitura concluída! Confira os dados antes de lançar.";
  } catch (err) {
    console.error(err);
    statusOcr.innerText = "⚠️ Dificuldade na leitura automática. Digite a hora manualmente.";
  }
});

// --- LANÇAR BATIDA NO DIA ---
document.getElementById('btnSalvarBatida').addEventListener('click', () => {
  const data = document.getElementById('regData').value;
  const hora = document.getElementById('regHora').value;
  const tipo = document.getElementById('regTipo').value;

  if (!data || !hora) {
    alert("Informe a data e a hora do ponto.");
    return;
  }

  if (!diasPonto[data]) {
    diasPonto[data] = { e1: "", s1: "", e2: "", s2: "" };
  }

  diasPonto[data][tipo] = hora;
  localStorage.setItem('ponto_dias', JSON.stringify(diasPonto));

  renderizarTabela();
  calcularMetricas();
  statusOcr.innerText = `Batida salva para ${data.split('-').reverse().join('/')}!`;
});

// --- SALVAR ESCALA & CONFIGURAÇÕES ---
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
  alert("Horários da escala salvos com sucesso!");
});

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
  alert("Parâmetros salariais atualizados!");
});

// Excluir dia
window.excluirDia = function(data) {
  if (confirm(`Deseja apagar todos os registros do dia ${data.split('-').reverse().join('/')}?`)) {
    delete diasPonto[data];
    localStorage.setItem('ponto_dias', JSON.stringify(diasPonto));
    renderizarTabela();
    calcularMetricas();
  }
};

document.getElementById('btnLimparTudo').addEventListener('click', () => {
  if (confirm("Tem certeza que deseja apagar todos os registros salvos?")) {
    diasPonto = {};
    localStorage.removeItem('ponto_dias');
    renderizarTabela();
    calcularMetricas();
  }
});

// --- RENDERIZAR TABELA DO ESPELHO ---
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

  // Período da Manhã (Entrada até Saída para Almoço)
  if (e1 !== null && s1 !== null && s1 > e1) {
    minutosTrabalhados += (s1 - e1);
  }
  // Período da Tarde (Retorno Almoço até Saída)
  if (e2 !== null && s2 !== null && s2 > e2) {
    minutosTrabalhados += (s2 - e2);
  }
  // Caso só tenha entrada e saída final (sem intervalo registrado)
  if (e1 !== null && s2 !== null && s1 === null && e2 === null && s2 > e1) {
    minutosTrabalhados += (s2 - e1);
  }

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

// --- APURAÇÃO FINANCEIRA ---
function calcularMetricas() {
  let totalMinutosTrabalhados = 0;
  let totalMinutosExtras = 0;

  Object.keys(diasPonto).forEach(data => {
    const { minutosTrabalhados, minutosExtras } = calcularDia(diasPonto[data]);
    totalMinutosTrabalhados += minutosTrabalhados;
    totalMinutosExtras += minutosExtras;
  });

  // Determina valor da hora normal
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

  // Insalubridade
  const baseInsalubridade = (config.baseInsalubridade === 'base') ? config.valorSalario : config.salarioMinimo;
  const valorInsalubridade = baseInsalubridade * (config.grauInsalubridade / 100);

  const totalGeralBruto = valorSalarioBaseExibido + totalValorExtras + valorInsalubridade;

  // Atualização em tela
  document.getElementById('mHorasTrabalhadas').innerText = minToHoursStr(totalMinutosTrabalhados);
  document.getElementById('mHorasExtras').innerText = minToHoursStr(totalMinutosExtras);

  const fmtMoeda = (val) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  document.getElementById('mValorBase').innerText = fmtMoeda(valorSalarioBaseExibido);
  document.getElementById('mValorExtras').innerText = fmtMoeda(totalValorExtras);
  document.getElementById('mValorInsalubridade').innerText = fmtMoeda(valorInsalubridade);
  document.getElementById('mTotalEstimado').innerText = fmtMoeda(totalGeralBruto);
}

// --- ÔNIBUS (ALTERNÂNCIA) ---
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

// --- NOTIFICAÇÕES BASEADAS NA ESCALA ---
document.getElementById('btnPermissaoNotif').addEventListener('click', async () => {
  if (!("Notification" in window)) {
    alert("Seu navegador não suporta notificações.");
    return;
  }
  const perm = await Notification.requestPermission();
  if (perm === 'granted') {
    new Notification("Lembretes Ativados!", {
      body: `Você será lembrado nos horários da sua escala (Entrada: ${escala.entrada}, Saída: ${escala.saida}).`,
      icon: "https://cdn-icons-png.flaticon.com/512/2921/2921222.png"
    });
  }
});

// Inicialização Geral
carregarValores();
renderizarTabela();
calcularMetricas();