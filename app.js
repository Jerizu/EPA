// --- ESTADO & CONFIGURAÇÕES INICIAIS ---
let diasPonto = JSON.parse(localStorage.getItem('ponto_dias') || '{}');

let escala = JSON.parse(localStorage.getItem('ponto_escala') || JSON.stringify({
  entrada: "05:20",
  almocoSaida: "11:00",
  almocoVolta: "12:00",
  saida: "14:40",
  cargaDia: 8.0
}));

let config = JSON.parse(localStorage.getItem('ponto_config') || JSON.stringify({
  tipoRemuneracao: "mensal",
  valorSalario: 3500,
  cargaMensal: 220,
  adicionalHE: 50,
  grauInsalubridade: 20,
  baseInsalubridade: "minimo",
  salarioMinimo: 1412,
  apiNuvem: "https://script.google.com/macros/s/AKfycbzTk_QPMWBHbNpagrSFKmk2O8r2Wenlm5ECRjK-lQlBJOShoLL9Z1HBusMpDBW0CWJJ/exec"
}));

// Caso a configuração salva ainda não tenha sua URL configurada
if (!config.apiNuvem) {
  config.apiNuvem = "https://script.google.com/macros/s/AKfycbzTk_QPMWBHbNpagrSFKmk2O8r2Wenlm5ECRjK-lQlBJOShoLL9Z1HBusMpDBW0CWJJ/exec";
}

let notificacoesEnviadas = JSON.parse(localStorage.getItem('ponto_notif_log') || '{}');
let fotoBase64Atual = null;

// --- CARREGAR CONFIGURAÇÕES EM TELA ---
function carregarValores() {
  document.getElementById('escEntrada').value = escala.entrada;
  document.getElementById('escAlmocoSaida').value = escala.almocoSaida;
  document.getElementById('escAlmocoVolta').value = escala.almocoVolta;
  document.getElementById('escSaida').value = escala.saida;
  document.getElementById('escCargaDia').value = escala.cargaDia;

  document.getElementById('cfgTipoRemuneracao').value = config.tipoRemuneracao;
  document.getElementById('cfgValorSalario').value = config.valorSalario;
  document.getElementById('cfgCargaMensal').value = config.cargaMensal;
  document.getElementById('cfgAdicionalHE').value = config.adicionalHE;
  document.getElementById('cfgGrauInsalubridade').value = config.grauInsalubridade;
  document.getElementById('cfgBaseInsalubridade').value = config.baseInsalubridade;
  document.getElementById('cfgSalarioMinimo').value = config.salarioMinimo;
  document.getElementById('cfgApiNuvem').value = config.apiNuvem;

  ajustarExibicaoCargaMensal();
}

function ajustarExibicaoCargaMensal() {
  const tipo = document.getElementById('cfgTipoRemuneracao').value;
  document.getElementById('campoCargaMensal').style.display = (tipo === 'hora') ? 'none' : 'flex';
}

document.getElementById('cfgTipoRemuneracao').addEventListener('change', ajustarExibicaoCargaMensal);
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

// --- PRÉ-PROCESSAMENTO DE IMAGEM & OCR ---
function processarImagemCanvas(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.getElementById('canvasPreProcess');
        const ctx = canvas.getContext('2d');

        // Redimensiona mantendo a proporção ideal para OCR
        const maxDim = 1600;
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }

        canvas.width = w;
        canvas.height = h;
        ctx.drawImage(img, 0, 0, w, h);

        // Gera Base64 compactada em JPEG para enviar ao Google Drive
        fotoBase64Atual = canvas.toDataURL('image/jpeg', 0.85);

        // Binarização para melhorar contraste das letras térmicas no OCR
        const imgData = ctx.getImageData(0, 0, w, h);
        const d = imgData.data;
        for (let i = 0; i < d.length; i += 4) {
          const cinza = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          const v = cinza < 135 ? 0 : 255;
          d[i] = v;
          d[i + 1] = v;
          d[i + 2] = v;
        }
        ctx.putImageData(imgData, 0, 0);

        resolve(canvas.toDataURL('image/png'));
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function extrairDataHoraTexto(rawText) {
  let limpo = rawText.toUpperCase().replace(/\r\n/g, '\n');
  let dataDetectada = null;
  let horaDetectada = null;

  // Busca específica: DATA:09/09/2026 e variações
  const regexDataComRotulo = /DATA\s*[:\.\-]?\s*(\d{2})[\/\.\-](\d{2})[\/\.\-](\d{4}|\d{2})/i;
  const matchDataRotulo = limpo.match(regexDataComRotulo);

  if (matchDataRotulo) {
    let [_, dia, mes, ano] = matchDataRotulo;
    if (ano.length === 2) ano = "20" + ano;
    dataDetectada = `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
  } else {
    const matchDataSolta = limpo.match(/(\d{2})[\/\.-](\d{2})[\/\.-](20\d{2})/);
    if (matchDataSolta) {
      const [_, dia, mes, ano] = matchDataSolta;
      dataDetectada = `${ano}-${mes}-${dia}`;
    }
  }

  // Busca específica: HORA:05:20 e variações
  const regexHoraComRotulo = /HORA\s*[:\.\-]?\s*([0-2]?[0-9])[:\.\-]([0-5][0-9])/i;
  const matchHoraRotulo = limpo.match(regexHoraComRotulo);

  if (matchHoraRotulo) {
    let [_, h, m] = matchHoraRotulo;
    horaDetectada = `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
  } else {
    const matchesHoras = [...limpo.matchAll(/\b([0-2]?[0-9])[:\.]([0-5][0-9])\b/g)];
    if (matchesHoras.length > 0) {
      const ultimo = matchesHoras[matchesHoras.length - 1];
      horaDetectada = `${ultimo[1].padStart(2, '0')}:${ultimo[2].padStart(2, '0')}`;
    }
  }

  return { dataDetectada, horaDetectada };
}

// Evento ao carregar ou tirar a foto
const inputFoto = document.getElementById('inputFoto');
const statusOcr = document.getElementById('statusOcr');

inputFoto.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  statusOcr.innerText = "⏳ Lendo comprovante e preparando foto...";
  statusOcr.style.color = "#0284c7";

  try {
    const imagemOtimizada = await processarImagemCanvas(file);

    const worker = await Tesseract.createWorker('por');
    const res = await worker.recognize(imagemOtimizada);
    await worker.terminate();

    const raw = res.data.text;
    const { dataDetectada, horaDetectada } = extrairDataHoraTexto(raw);

    if (dataDetectada) {
      document.getElementById('regData').value = dataDetectada;

      // Sugestão da batida seguinte do dia
      const diaObj = diasPonto[dataDetectada] || {};
      const selectTipo = document.getElementById('regTipo');
      if (!diaObj.e1) selectTipo.value = "e1";
      else if (!diaObj.s1) selectTipo.value = "s1";
      else if (!diaObj.e2) selectTipo.value = "e2";
      else selectTipo.value = "s2";
    }

    if (horaDetectada) {
      document.getElementById('regHora').value = horaDetectada;
    }

    if (dataDetectada && horaDetectada) {
      statusOcr.innerText = `✅ Reconhecido! Data (${dataDetectada.split('-').reverse().join('/')}) e Hora (${horaDetectada}).`;
      statusOcr.style.color = "#15803d";
    } else {
      statusOcr.innerText = `⚠️ Leitura parcial. Confira a data e hora nos campos abaixo.`;
      statusOcr.style.color = "#d97706";
    }
  } catch (err) {
    console.error(err);
    statusOcr.innerText = "Erro no leitor. Preencha os campos manualmente.";
    statusOcr.style.color = "#b91c1c";
  }
});

// --- ENVIO PARA A NUVEM (GOOGLE DRIVE + SHEETS) ---
async function enviarParaNuvem(data, hora, tipoNome, fotoBase64) {
  if (!config.apiNuvem) return null;

  try {
    const payload = {
      data: data,
      hora: hora,
      tipo: tipoNome,
      fotoBase64: fotoBase64 || null
    };

    // Google Apps Script com POST requer text/plain para evitar bloqueio por CORS
    const resposta = await fetch(config.apiNuvem, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    });

    const resultado = await resposta.json();
    return resultado;
  } catch (err) {
    console.warn("Aviso ao enviar para nuvem:", err);
    return null;
  }
}

// --- LANÇAR BATIDA NO DIA ---
document.getElementById('btnSalvarBatida').addEventListener('click', async () => {
  const data = document.getElementById('regData').value;
  const hora = document.getElementById('regHora').value;
  const tipo = document.getElementById('regTipo').value;
  const selectElement = document.getElementById('regTipo');
  const tipoNome = selectElement.options[selectElement.selectedIndex].text;

  if (!data || !hora) {
    alert("Informe data e hora.");
    return;
  }

  // 1. Salva localmente de imediato
  if (!diasPonto[data]) {
    diasPonto[data] = { e1: "", s1: "", e2: "", s2: "", linksFotos: {} };
  }
  if (!diasPonto[data].linksFotos) {
    diasPonto[data].linksFotos = {};
  }

  diasPonto[data][tipo] = hora;
  localStorage.setItem('ponto_dias', JSON.stringify(diasPonto));
  renderizarTabela();
  calcularMetricas();

  statusOcr.innerText = `Salvando no aparelho e enviando para o Google Drive...`;
  statusOcr.style.color = "#0284c7";

  // 2. Envio em nuvem
  const fotoParaEnviar = fotoBase64Atual;
  fotoBase64Atual = null; // limpa buffer

  if (config.apiNuvem) {
    const resNuvem = await enviarParaNuvem(data, hora, tipoNome, fotoParaEnviar);
    if (resNuvem && resNuvem.status === "sucesso") {
      if (resNuvem.fotoUrl && resNuvem.fotoUrl !== "Sem foto") {
        diasPonto[data].linksFotos[tipo] = resNuvem.fotoUrl;
        localStorage.setItem('ponto_dias', JSON.stringify(diasPonto));
        renderizarTabela();
      }
      statusOcr.innerText = `✅ Salvo com sucesso no aparelho, Google Sheets e Google Drive!`;
      statusOcr.style.color = "#15803d";
    } else {
      statusOcr.innerText = `✅ Salvo no aparelho! (Falha temporária ao sincronizar com Google Drive/Planilha)`;
      statusOcr.style.color = "#d97706";
    }
  } else {
    statusOcr.innerText = `✅ Salvo localmente no aparelho!`;
    statusOcr.style.color = "#15803d";
  }
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
    salarioMinimo: parseFloat(document.getElementById('cfgSalarioMinimo').value) || 1412,
    apiNuvem: document.getElementById('cfgApiNuvem').value.trim()
  };
  localStorage.setItem('ponto_config', JSON.stringify(config));
  calcularMetricas();
  alert("Configurações salvas!");
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
  if (confirm("Deseja apagar todos os registros do aparelho?")) {
    diasPonto = {};
    localStorage.removeItem('ponto_dias');
    renderizarTabela();
    calcularMetricas();
  }
});

// --- CÁLCULO E RENDERIZAÇÃO DO ESPELHO ---
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

    // Links para as fotos das batidas no Drive
    let fotosHtml = '-';
    if (dia.linksFotos && Object.keys(dia.linksFotos).length > 0) {
      fotosHtml = '<div class="links-fotos-grid">';
      ['e1', 's1', 'e2', 's2'].forEach((k, idx) => {
        if (dia.linksFotos[k]) {
          const rotulos = ['E1', 'S1', 'E2', 'S2'];
          fotosHtml += `<a href="${dia.linksFotos[k]}" target="_blank" class="badge-foto">${rotulos[idx]}</a>`;
        }
      });
      fotosHtml += '</div>';
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${data.split('-').reverse().join('/')}</td>
      <td>${dia.e1 || '-'}</td>
      <td>${dia.s1 || '-'}</td>
      <td>${dia.e2 || '-'}</td>
      <td>${dia.s2 || '-'}</td>
      <td><strong>${minToHoursStr(minutosTrabalhados)}</strong></td>
      <td style="color:${minutosExtras > 0 ? '#16a34a' : '#64748b'}">${minToHoursStr(minutosExtras)}</td>
      <td>${fotosHtml}</td>
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

// --- EXPORTAÇÃO E BACKUP ---
document.getElementById('btnExportarCsv').addEventListener('click', () => {
  const datas = Object.keys(diasPonto).sort();
  if (datas.length === 0) {
    alert("Não há dados para exportar.");
    return;
  }

  let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
  csvContent += "Data;Entrada;Saida Almoco;Retorno Almoco;Saida;Horas Trabalhadas;Horas Extras\n";

  datas.forEach(data => {
    const dia = diasPonto[data];
    const { minutosTrabalhados, minutosExtras } = calcularDia(dia);
    const dataFmt = data.split('-').reverse().join('/');
    const hTrab = (minutosTrabalhados / 60).toFixed(2).replace('.', ',');
    const hExt = (minutosExtras / 60).toFixed(2).replace('.', ',');
    csvContent += `${dataFmt};${dia.e1 || ''};${dia.s1 || ''};${dia.e2 || ''};${dia.s2 || ''};${hTrab};${hExt}\n`;
  });

  const link = document.createElement("a");
  link.setAttribute("href", encodeURI(csvContent));
  link.setAttribute("download", `espelho_ponto_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
});

document.getElementById('btnExportarJson').addEventListener('click', () => {
  const backup = { diasPonto, escala, config, exportadoEm: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `backup_ponto_${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
});

document.getElementById('inputRestaurarJson').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const data = JSON.parse(event.target.result);
      if (data.diasPonto) diasPonto = data.diasPonto;
      if (data.escala) escala = data.escala;
      if (data.config) config = data.config;

      localStorage.setItem('ponto_dias', JSON.stringify(diasPonto));
      localStorage.setItem('ponto_escala', JSON.stringify(escala));
      localStorage.setItem('ponto_config', JSON.stringify(config));

      carregarValores();
      renderizarTabela();
      calcularMetricas();
      alert("Backup restaurado com sucesso!");
    } catch (err) {
      alert("Arquivo inválido.");
    }
  };
  reader.readAsText(file);
});

// --- MOTOR DE NOTIFICAÇÕES ---
document.getElementById('btnPermissaoNotif').addEventListener('click', async () => {
  if (!("Notification" in window)) {
    alert("Navegador não suporta notificações.");
    return;
  }
  const perm = await Notification.requestPermission();
  if (perm === 'granted') {
    dispararNotificacao("🔔 Lembretes Ativados!", "Você será avisado 5 minutos antes da escala e sextas às 15h para a marmita.");
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

function obterMinutosMenosDelta(horarioStr, deltaMinutos = 5) {
  const [h, m] = horarioStr.split(':').map(Number);
  let totalMin = h * 60 + m - deltaMinutos;
  if (totalMin < 0) totalMin += 24 * 60;
  const resH = Math.floor(totalMin / 60);
  const resM = totalMin % 60;
  return `${String(resH).padStart(2, '0')}:${String(resM).padStart(2, '0')}`;
}

function verificarAgendamentosNotificacoes() {
  const agora = new Date();
  const hojeStr = agora.toISOString().split('T')[0];
  const horaAtualStr = `${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}`;
  const diaSemana = agora.getDay();

  if (!notificacoesEnviadas[hojeStr]) {
    notificacoesEnviadas = { [hojeStr]: {} };
  }
  const logsHoje = notificacoesEnviadas[hojeStr];

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
        dispararNotificacao("⏱️ Lembrete de Ponto (5 min)", `Hora prevista de ${ev.rotulo} às ${ev.horario}. Registre seu ponto!`);
        logsHoje[ev.chave] = true;
        localStorage.setItem('ponto_notif_log', JSON.stringify(notificacoesEnviadas));
      }
    }
  });

  if (diaSemana === 5 && agora.getHours() >= 15 && !logsHoje['notif_marmita']) {
    dispararNotificacao("🍱 Lembrete de Marmita!", "Sexta-feira após as 15h: acesse o link e faça o pedido da sua marmita!");
    logsHoje['notif_marmita'] = true;
    localStorage.setItem('ponto_notif_log', JSON.stringify(notificacoesEnviadas));
  }
}

setInterval(verificarAgendamentosNotificacoes, 30000);
verificarAgendamentosNotificacoes();

// Alternância de Ônibus
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

// Inicialização Geral
carregarValores();
renderizarTabela();
calcularMetricas();