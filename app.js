// --- ESTADO & PERSISTÊNCIA ---
let registros = JSON.parse(localStorage.getItem('ponto_registros') || '[]');
let config = JSON.parse(localStorage.getItem('ponto_config') || JSON.stringify({
  salario: 3000,
  cargaMensal: 220,
  jornadaDiaria: 8,
  adicionalHE: 50,
  grauInsalubridade: 20,
  baseInsalubridade: 'minimo',
  salarioMinimo: 1412
}));

// Preenche configurações no formulário
function carregarCamposConfig() {
  document.getElementById('cfgSalario').value = config.salario;
  document.getElementById('cfgCargaMensal').value = config.cargaMensal;
  document.getElementById('cfgJornadaDiaria').value = config.jornadaDiaria;
  document.getElementById('cfgAdicionalHE').value = config.adicionalHE;
  document.getElementById('cfgGrauInsalubridade').value = config.grauInsalubridade;
  document.getElementById('cfgBaseInsalubridade').value = config.baseInsalubridade;
  document.getElementById('cfgSalarioMinimo').value = config.salarioMinimo;
}

// Salva Configurações
document.getElementById('btnSalvarConfig').addEventListener('click', () => {
  config = {
    salario: parseFloat(document.getElementById('cfgSalario').value) || 0,
    cargaMensal: parseFloat(document.getElementById('cfgCargaMensal').value) || 220,
    jornadaDiaria: parseFloat(document.getElementById('cfgJornadaDiaria').value) || 8,
    adicionalHE: parseFloat(document.getElementById('cfgAdicionalHE').value) || 50,
    grauInsalubridade: parseFloat(document.getElementById('cfgGrauInsalubridade').value) || 0,
    baseInsalubridade: document.getElementById('cfgBaseInsalubridade').value,
    salarioMinimo: parseFloat(document.getElementById('cfgSalarioMinimo').value) || 1412
  };
  localStorage.setItem('ponto_config', JSON.stringify(config));
  calcularMetricas();
  alert("Configurações atualizadas com sucesso!");
});

// --- NAVEGAÇÃO / MENU HAMBÚRGUER ---
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

    document.querySelectorAll('.aba-conteudo').forEach(aba => {
      aba.classList.remove('active');
    });
    document.getElementById(abaAlvo).classList.add('active');

    alternarMenu();
  });
});

// Alternância entre SITU e Rápido Luxo
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

// --- OCR VIA TESSERACT.JS ---
const inputFoto = document.getElementById('inputFoto');
const statusOcr = document.getElementById('statusOcr');

// Preenche a data de hoje por padrão
document.getElementById('regData').value = new Date().toISOString().split('T')[0];

inputFoto.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  statusOcr.innerText = "Lendo canhoto de papel...";

  try {
    const worker = await Tesseract.createWorker('por');
    const resultado = await worker.recognize(file);
    await worker.terminate();

    const texto = resultado.data.text;
    statusOcr.innerText = "Informações extraídas! Revise antes de salvar.";

    // Expressões regulares para achar data e hora no cupom fiscal/térmico
    const regexData = /(\d{2})[\/\.-](\d{2})[\/\.-](\d{4})/;
    const regexHora = /(\d{2}):(\d{2})/;

    const matchData = texto.match(regexData);
    const matchHora = texto.match(regexHora);

    if (matchData) {
      const [_, dia, mes, ano] = matchData;
      document.getElementById('regData').value = `${ano}-${mes}-${dia}`;
    }
    if (matchHora) {
      document.getElementById('regHora').value = `${matchHora[1]}:${matchHora[2]}`;
    }
  } catch (err) {
    console.error(err);
    statusOcr.innerText = "Não foi possível ler com clareza. Digite manualmente.";
  }
});

// --- SALVAR REGISTROS ---
document.getElementById('btnSalvarRegistro').addEventListener('click', () => {
  const data = document.getElementById('regData').value;
  const hora = document.getElementById('regHora').value;
  const tipo = document.getElementById('regTipo').value;

  if (!data || !hora) {
    alert("Informe data e hora.");
    return;
  }

  registros.push({ id: Date.now(), data, hora, tipo });
  registros.sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora));

  localStorage.setItem('ponto_registros', JSON.stringify(registros));
  renderizarTabela();
  calcularMetricas();
  statusOcr.innerText = "Ponto salvo com sucesso!";
});

function renderizarTabela() {
  const tbody = document.querySelector('#tabelaRegistros tbody');
  tbody.innerHTML = '';

  registros.forEach(item => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${item.data.split('-').reverse().join('/')}</td>
      <td>${item.hora}</td>
      <td>${item.tipo}</td>
      <td><button onclick="removerRegistro(${item.id})" class="btn-perigo">✕</button></td>
    `;
    tbody.appendChild(tr);
  });
}

window.removerRegistro = function(id) {
  registros = registros.filter(r => r.id !== id);
  localStorage.setItem('ponto_registros', JSON.stringify(registros));
  renderizarTabela();
  calcularMetricas();
};

document.getElementById('btnLimparTudo').addEventListener('click', () => {
  if (confirm("Deseja apagar todos os registros da tabela?")) {
    registros = [];
    localStorage.removeItem('ponto_registros');
    renderizarTabela();
    calcularMetricas();
  }
});

// --- CÁLCULO DE HORAS, EXTRAS E REMUNERAÇÃO ---
function calcularMetricas() {
  const dias = {};
  registros.forEach(r => {
    if (!dias[r.data]) dias[r.data] = [];
    dias[r.data].push(r.hora);
  });

  let minutosTrabalhadosTotal = 0;
  let minutosExtrasTotal = 0;
  const minutosJornadaDiaria = config.jornadaDiaria * 60;

  Object.keys(dias).forEach(data => {
    const batidas = dias[data].sort();
    let minutosDia = 0;

    for (let i = 0; i < batidas.length - 1; i += 2) {
      const [hEnt, mEnt] = batidas[i].split(':').map(Number);
      const [hSai, mSai] = batidas[i + 1].split(':').map(Number);
      const diff = (hSai * 60 + mSai) - (hEnt * 60 + mEnt);
      if (diff > 0) minutosDia += diff;
    }

    minutosTrabalhadosTotal += minutosDia;
    if (minutosDia > minutosJornadaDiaria) {
      minutosExtrasTotal += (minutosDia - minutosJornadaDiaria);
    }
  });

  // Cálculos financeiros
  const valorHora = config.salario / config.cargaMensal;
  const valorHExtraUnit = valorHora * (1 + config.adicionalHE / 100);
  const totalValorExtras = (minutosExtrasTotal / 60) * valorHExtraUnit;

  // Cálculo da Insalubridade
  const baseCalcInsalubridade = (config.baseInsalubridade === 'base') ? config.salario : config.salarioMinimo;
  const valorInsalubridade = baseCalcInsalubridade * (config.grauInsalubridade / 100);

  const totalBrutoEstimado = config.salario + totalValorExtras + valorInsalubridade;

  // Atualização na interface
  const hTrab = Math.floor(minutosTrabalhadosTotal / 60);
  const mTrab = minutosTrabalhadosTotal % 60;
  document.getElementById('mHorasTrabalhadas').innerText = `${hTrab}h ${String(mTrab).padStart(2, '0')}m`;

  const hExt = Math.floor(minutosExtrasTotal / 60);
  const mExt = minutosExtrasTotal % 60;
  document.getElementById('mHorasExtras').innerText = `${hExt}h ${String(mExt).padStart(2, '0')}m`;

  const formatarMoeda = (val) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  document.getElementById('mValorExtras').innerText = formatarMoeda(totalValorExtras);
  document.getElementById('mValorInsalubridade').innerText = formatarMoeda(valorInsalubridade);
  document.getElementById('mTotalEstimado').innerText = formatarMoeda(totalBrutoEstimado);
}

// --- NOTIFICAÇÕES NATIVAS ---
document.getElementById('btnPermissaoNotif').addEventListener('click', async () => {
  if (!("Notification" in window)) {
    alert("Navegador não suporta notificações.");
    return;
  }
  const perm = await Notification.requestPermission();
  if (perm === 'granted') {
    new Notification("Notificações Ativadas!", {
      body: "Você receberá lembretes nos horários da sua jornada.",
      icon: "https://cdn-icons-png.flaticon.com/512/2921/2921222.png"
    });
  }
});

// Inicialização
carregarCamposConfig();
renderizarTabela();
calcularMetricas();