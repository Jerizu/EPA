// --- REGISTRO DO SERVICE WORKER ---
let swRegistration = null;

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      swRegistration = await navigator.serviceWorker.register('./sw.js');
      console.log("Service Worker ativo!");
    } catch (err) {
      console.warn("Service Worker:", err);
    }
  });
}

// --- ESTADO & CONFIGURAÇÕES ---
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
  modoExclusao: "inativar_dia",
  apiNuvem: "https://script.google.com/macros/s/AKfycbzTk_QPMWBHbNpagrSFKmk2O8r2Wenlm5ECRjK-lQlBJOShoLL9Z1HBusMpDBW0CWJJ/exec"
}));

if (!config.apiNuvem) {
  config.apiNuvem = "https://script.google.com/macros/s/AKfycbzTk_QPMWBHbNpagrSFKmk2O8r2Wenlm5ECRjK-lQlBJOShoLL9Z1HBusMpDBW0CWJJ/exec";
}
if (!config.modoExclusao) {
  config.modoExclusao = "inativar_dia";
}

let notificacoesEnviadas = JSON.parse(localStorage.getItem('ponto_notif_log') || '{}');
let fotoBase64Atual = null;

function carregarValores() {
  document.getElementById('escEntrada').value = escala.entrada || "05:20";
  document.getElementById('escAlmocoSaida').value = escala.almocoSaida || "11:00";
  document.getElementById('escAlmocoVolta').value = escala.almocoVolta || "12:00";
  document.getElementById('escSaida').value = escala.saida || "14:40";
  document.getElementById('escCargaDia').value = escala.cargaDia || 8.0;

  document.getElementById('cfgTipoRemuneracao').value = config.tipoRemuneracao || "mensal";
  document.getElementById('cfgValorSalario').value = config.valorSalario || 3500;
  document.getElementById('cfgCargaMensal').value = config.cargaMensal || 220;
  document.getElementById('cfgAdicionalHE').value = config.adicionalHE || 50;
  document.getElementById('cfgGrauInsalubridade').value = config.grauInsalubridade !== undefined ? config.grauInsalubridade : 20;
  document.getElementById('cfgBaseInsalubridade').value = config.baseInsalubridade || "minimo";
  document.getElementById('cfgSalarioMinimo').value = config.salarioMinimo || 1412;
  document.getElementById('cfgApiNuvem').value = config.apiNuvem;
  document.getElementById('cfgModoExclusao').value = config.modoExclusao || "inativar_dia";

  ajustarExibicaoCargaMensal();
  atualizarStatusBotaoNotif();
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

// --- PRÉ-PROCESSAMENTO ROBUSTO PARA CANHOTO TÉRMICO ---
function processarImagemCanvas(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.getElementById('canvasPreProcess');
        const ctx = canvas.getContext('2d');

        // Escala para resolução otimizada
        const maxDim = 1800;
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

        // Foto guardada para upload no Google Drive
        fotoBase64Atual = canvas.toDataURL('image/jpeg', 0.85);

        // Aumento de contraste e normalização de tons de cinza
        const imgData = ctx.getImageData(0, 0, w, h);
        const d = imgData.data;

        // Calcula média de luminosidade da imagem para binarização adaptativa
        let somaLum = 0;
        const totalPixels = d.length / 4;
        for (let i = 0; i < d.length; i += 4) {
          somaLum += (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
        }
        const mediaLum = somaLum / totalPixels;
        // Limiar ajustado baseado na claridade média da cena
        const threshold = Math.max(95, Math.min(160, mediaLum * 0.88));

        for (let i = 0; i < d.length; i += 4) {
          const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          const v = lum < threshold ? 0 : 255;
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

// --- EXTRATOR ROBUSTO DE DATA E HORA ---
function extrairDataHoraTexto(rawText) {
  // Normaliza o texto e remove quebras no meio de palavras
  let limpo = rawText.toUpperCase();
  
  // Trata a quebra típica do canhoto: 'D' no final da linha e 'ATA:' no início da próxima
  limpo = limpo.replace(/D\s*[\r\n]+\s*ATA/g, "DATA");
  // Substitui caracteres comumente confundidos por OCR em fontes condensadas
  limpo = limpo.replace(/OATA/g, "DATA").replace(/QATA/g, "DATA");

  let dataDetectada = null;
  let horaDetectada = null;

  // 1. Procura DATA: DD/MM/AAAA ou ATA: DD/MM/AAAA
  const regexData = /(?:D?ATA|DATA)?\s*[:\.\-]?\s*(\d{2})[\/\.\-](\d{2})[\/\.\-](20\d{2}|\d{2})/;
  const matchData = limpo.match(regexData);

  if (matchData) {
    let [_, dia, mes, ano] = matchData;
    if (ano.length === 2) ano = "20" + ano;
    dataDetectada = `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
  } else {
    // Procura qualquer sequência DD/MM/AAAA
    const matchDataSolta = limpo.match(/(\d{2})[\/\.-](\d{2})[\/\.-](20\d{2})/);
    if (matchDataSolta) {
      const [_, dia, mes, ano] = matchDataSolta;
      dataDetectada = `${ano}-${mes}-${dia}`;
    }
  }

  // 2. Procura HORA: HH:MM ou HORA. HH.MM
  const regexHora = /HORA\s*[:\.\-]?\s*([0-2]?[0-9])[:\.\-]([0-5][0-9])/;
  const matchHora = limpo.match(regexHora);

  if (matchHora) {
    let [_, h, m] = matchHora;
    horaDetectada = `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
  } else {
    // Busca qualquer padrão HH:MM válido
    const matchesHoras = [...limpo.matchAll(/\b([0-2]?[0-9])[:\.]([0-5][0-9])\b/g)];
    if (matchesHoras.length > 0) {
      // No comprovante Control iD, o horário da batida fica mais para baixo
      const item = matchesHoras.find(m => Number(m[1]) <= 23 && Number(m[2]) <= 59);
      if (item) {
        horaDetectada = `${item[1].padStart(2, '0')}:${item[2].padStart(2, '0')}`;
      }
    }
  }

  return { dataDetectada, horaDetectada };
}

const inputFoto = document.getElementById('inputFoto');
const statusOcr = document.getElementById('statusOcr');

inputFoto.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  statusOcr.innerText = "⏳ Lendo comprovante e preparando imagem...";
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
      statusOcr.innerText = `✅ Reconhecido com sucesso! Data: ${dataDetectada.split('-').reverse().join('/')} | Hora: ${horaDetectada}`;
      statusOcr.style.color = "#15803d";
    } else if (dataDetectada || horaDetectada) {
      statusOcr.innerText = `⚠️ Leitura parcial. Confira data e hora nos campos.`;
      statusOcr.style.color = "#d97706";
    } else {
      statusOcr.innerText = `⚠️ Não conseguimos ler os dados automaticamente. Digite nos campos abaixo.`;
      statusOcr.style.color = "#b91c1c";
    }
  } catch (err) {
    console.error(err);
    statusOcr.innerText = "Erro no leitor de imagem. Digite nos campos manualmente.";
    statusOcr.style.color = "#b91c1c";
  }
});

// --- COMUNICAÇÃO COM A PLANILHA ---
async function enviarParaNuvem(payload) {
  if (!config.apiNuvem) return null;

  try {
    const resposta = await fetch(config.apiNuvem, {
      method: "POST",
      mode: "cors",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    });
    return await resposta.json();
  } catch (err) {
    console.warn("Fallback post:", err);
    try {
      await fetch(config.apiNuvem, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload)
      });
      return { status: "sucesso" };
    } catch (e2) {
      console.error("Falha na nuvem:", e2);
      return null;
    }
  }
}

// Puxar configurações da planilha (com proteção contra valores em branco)
async function puxarConfigsDaPlanilha() {
  if (!config.apiNuvem) return;
  statusOcr.innerText = "⏳ Buscando escala e salário salvos na planilha...";
  statusOcr.style.color = "#0284c7";

  try {
    const res = await fetch(config.apiNuvem);
    const json = await res.json();
    if (json && json.status === "sucesso" && json.configs) {
      let dadosEncontrados = false;

      // Só atualiza campos que realmente tiverem valor válido
      if (json.configs.escala) {
        const escNu = json.configs.escala;
        if (escNu.entrada) { escala.entrada = escNu.entrada; dadosEncontrados = true; }
        if (escNu.almocoSaida) { escala.almocoSaida = escNu.almocoSaida; dadosEncontrados = true; }
        if (escNu.almocoVolta) { escala.almocoVolta = escNu.almocoVolta; dadosEncontrados = true; }
        if (escNu.saida) { escala.saida = escNu.saida; dadosEncontrados = true; }
        if (escNu.cargaDia) { escala.cargaDia = Number(escNu.cargaDia); dadosEncontrados = true; }
        localStorage.setItem('ponto_escala', JSON.stringify(escala));
      }

      if (json.configs.salario) {
        const salNu = json.configs.salario;
        if (salNu.valorSalario) { config.valorSalario = Number(salNu.valorSalario); dadosEncontrados = true; }
        if (salNu.cargaMensal) config.cargaMensal = Number(salNu.cargaMensal);
        if (salNu.adicionalHE) config.adicionalHE = Number(salNu.adicionalHE);
        if (salNu.grauInsalubridade !== undefined) config.grauInsalubridade = Number(salNu.grauInsalubridade);
        if (salNu.baseInsalubridade) config.baseInsalubridade = salNu.baseInsalubridade;
        if (salNu.salarioMinimo) config.salarioMinimo = Number(salNu.salarioMinimo);
        if (salNu.tipoRemuneracao) config.tipoRemuneracao = salNu.tipoRemuneracao;
        localStorage.setItem('ponto_config', JSON.stringify(config));
      }

      carregarValores();
      calcularMetricas();

      if (dadosEncontrados) {
        statusOcr.innerText = "✅ Escala e parâmetros salariais sincronizados da planilha!";
        statusOcr.style.color = "#15803d";
      } else {
        statusOcr.innerText = "ℹ️ A planilha ainda não possui configurações salvas. Salve sua escala primeiro!";
        statusOcr.style.color = "#0284c7";
      }
    }
  } catch (e) {
    console.warn("Não foi possível puxar da nuvem:", e);
    statusOcr.innerText = "⚠️ Não foi possível conectar à planilha no momento.";
    statusOcr.style.color = "#d97706";
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

  statusOcr.innerText = `⏳ Enviando registro e foto para a planilha e Google Drive...`;
  statusOcr.style.color = "#0284c7";

  const fotoParaEnviar = fotoBase64Atual;
  fotoBase64Atual = null;

  if (config.apiNuvem) {
    const resNuvem = await enviarParaNuvem({
      data: data,
      hora: hora,
      tipo: tipoNome,
      fotoBase64: fotoParaEnviar
    });

    if (resNuvem && resNuvem.status === "sucesso") {
      if (resNuvem.fotoUrl && resNuvem.fotoUrl !== "Sem foto") {
        diasPonto[data].linksFotos[tipo] = resNuvem.fotoUrl;
        localStorage.setItem('ponto_dias', JSON.stringify(diasPonto));
        renderizarTabela();
      }
      statusOcr.innerText = `✅ Salvo no aparelho, Google Sheets e Google Drive!`;
      statusOcr.style.color = "#15803d";
    } else {
      statusOcr.innerText = `✅ Salvo no aparelho! (Aguardando sincronização com a nuvem)`;
      statusOcr.style.color = "#d97706";
    }
  } else {
    statusOcr.innerText = `✅ Salvo no aparelho!`;
    statusOcr.style.color = "#15803d";
  }
});

// --- EXCLUIR OU INATIVAR NA PLANILHA E APARELHO ---
window.excluirDia = async function(data) {
  const dataFmt = data.split('-').reverse().join('/');
  const acaoTexto = config.modoExclusao === 'inativar_dia' ? "colocar como STATUS: INATIVO na planilha" : "EXCLUIR a linha da planilha";

  if (!confirm(`Deseja retirar o dia ${dataFmt} do espelho e ${acaoTexto}?`)) {
    return;
  }

  delete diasPonto[data];
  localStorage.setItem('ponto_dias', JSON.stringify(diasPonto));
  renderizarTabela();
  calcularMetricas();

  statusOcr.innerText = `⏳ Atualizando status do dia ${dataFmt} na planilha...`;
  statusOcr.style.color = "#0284c7";

  if (config.apiNuvem) {
    const res = await enviarParaNuvem({ acao: config.modoExclusao, data: data });
    if (res && res.status === "sucesso") {
      statusOcr.innerText = `🗑️ Dia ${dataFmt} removido do espelho e atualizado na planilha!`;
      statusOcr.style.color = "#15803d";
    } else {
      statusOcr.innerText = `Removido do espelho local (verifique a planilha).`;
      statusOcr.style.color = "#d97706";
    }
  }
};

document.getElementById('btnLimparTudo').addEventListener('click', async () => {
  if (!confirm("ATENÇÃO: Deseja apagar TODOS os registros do espelho e limpar as batidas da planilha?")) {
    return;
  }

  diasPonto = {};
  localStorage.removeItem('ponto_dias');
  renderizarTabela();
  calcularMetricas();

  statusOcr.innerText = `⏳ Limpando batidas na planilha...`;
  statusOcr.style.color = "#0284c7";

  if (config.apiNuvem) {
    await enviarParaNuvem({ acao: "limpar_tudo" });
    statusOcr.innerText = `🗑️ Todos os dados foram limpos do aparelho e da planilha!`;
    statusOcr.style.color = "#15803d";
  }
});

// --- SINCRONIZAR ESCALA & CONFIGURAÇÕES COM A PLANILHA ---
async function sincronizarConfigComPlanilha() {
  if (!config.apiNuvem) return;
  await enviarParaNuvem({
    acao: "salvar_config",
    escala: escala,
    salario: {
      tipoRemuneracao: config.tipoRemuneracao,
      valorSalario: config.valorSalario,
      cargaMensal: config.cargaMensal,
      adicionalHE: config.adicionalHE,
      grauInsalubridade: config.grauInsalubridade,
      baseInsalubridade: config.baseInsalubridade,
      salarioMinimo: config.salarioMinimo
    }
  });
}

document.getElementById('btnSalvarEscala').addEventListener('click', async () => {
  escala = {
    entrada: document.getElementById('escEntrada').value,
    almocoSaida: document.getElementById('escAlmocoSaida').value,
    almocoVolta: document.getElementById('escAlmocoVolta').value,
    saida: document.getElementById('escSaida').value,
    cargaDia: parseFloat(document.getElementById('escCargaDia').value) || 8.0
  };
  localStorage.setItem('ponto_escala', JSON.stringify(escala));
  calcularMetricas();

  statusOcr.innerText = "⏳ Salvando escala na planilha...";
  statusOcr.style.color = "#0284c7";
  await sincronizarConfigComPlanilha();
  statusOcr.innerText = "✅ Escala salva no aparelho e na planilha (aba 'Configuracoes')!";
  statusOcr.style.color = "#15803d";
  alert("Horários da escala salvos no aparelho e na planilha Google!");
});

document.getElementById('btnSalvarConfig').addEventListener('click', async () => {
  config = {
    tipoRemuneracao: document.getElementById('cfgTipoRemuneracao').value,
    valorSalario: parseFloat(document.getElementById('cfgValorSalario').value) || 0,
    cargaMensal: parseFloat(document.getElementById('cfgCargaMensal').value) || 220,
    adicionalHE: parseFloat(document.getElementById('cfgAdicionalHE').value) || 50,
    grauInsalubridade: parseFloat(document.getElementById('cfgGrauInsalubridade').value) || 0,
    baseInsalubridade: document.getElementById('cfgBaseInsalubridade').value,
    salarioMinimo: parseFloat(document.getElementById('cfgSalarioMinimo').value) || 1412,
    modoExclusao: document.getElementById('cfgModoExclusao').value,
    apiNuvem: document.getElementById('cfgApiNuvem').value.trim()
  };
  localStorage.setItem('ponto_config', JSON.stringify(config));
  calcularMetricas();

  statusOcr.innerText = "⏳ Salvando parâmetros na planilha...";
  statusOcr.style.color = "#0284c7";
  await sincronizarConfigComPlanilha();
  statusOcr.innerText = "✅ Parâmetros salvos no aparelho e na planilha!";
  statusOcr.style.color = "#15803d";
  alert("Parâmetros salariais salvos no aparelho e na planilha Google!");
});

document.getElementById('btnPuxarDaNuvem').addEventListener('click', puxarConfigsDaPlanilha);

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
      <td><button onclick="excluirDia('${data}')" class="btn-perigo" title="Retirar e atualizar status na planilha">🗑️</button></td>
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

// --- MOTOR DE NOTIFICAÇÕES (MOBILE, BANNER E SOM) ---
function exibirBannerNaTela(titulo, corpo) {
  const banner = document.getElementById('bannerAlerta');
  document.getElementById('bannerTitulo').innerText = titulo;
  document.getElementById('bannerCorpo').innerText = corpo;
  banner.style.display = 'block';

  if (navigator.vibrate) {
    navigator.vibrate([250, 100, 250, 100, 250]);
  }

  tocarAlertaSonoro();

  setTimeout(() => {
    banner.style.display = 'none';
  }, 7000);
}

function tocarAlertaSonoro() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const audioCtx = new AudioContext();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(587.33, audioCtx.currentTime);
    osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.45);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.45);
  } catch (e) {
    console.log("Áudio bloqueado:", e);
  }
}

function atualizarStatusBotaoNotif() {
  const btn = document.getElementById('btnPermissaoNotif');
  const txt = document.getElementById('txtStatusNotif');

  if (!("Notification" in window)) {
    btn.innerText = "Alertas Ativos";
    btn.style.backgroundColor = "#10b981";
    txt.innerText = "Alertas sonoros e visuais em tela estão ativos!";
    return;
  }

  if (Notification.permission === 'granted') {
    btn.innerText = "Ativado ✓";
    btn.style.backgroundColor = "#10b981";
    txt.innerText = "Lembretes ativos! Avisos 5 min antes da batida e sextas às 15h.";
  } else if (Notification.permission === 'denied') {
    btn.innerText = "Permissão Bloqueada";
    btn.style.backgroundColor = "#d97706";
    txt.innerText = "As notificações de sistema estão bloqueadas. Os alertas soarão em tela.";
  } else {
    btn.innerText = "Ativar";
    btn.style.backgroundColor = "#0284c7";
  }
}

document.getElementById('btnPermissaoNotif').addEventListener('click', async () => {
  tocarAlertaSonoro();

  if (!("Notification" in window)) {
    exibirBannerNaTela("🔔 Alertas Ativados!", "Alertas visuais e sonoros configurados neste aparelho.");
    return;
  }

  try {
    let perm;
    if (Notification.requestPermission.length === 0) {
      perm = await Notification.requestPermission();
    } else {
      perm = await new Promise((resolve) => Notification.requestPermission(resolve));
    }

    atualizarStatusBotaoNotif();

    if (perm === 'granted') {
      dispararNotificacao("🔔 Lembretes Ativados!", "Você receberá avisos 5 minutos antes da escala e para a marmita.");
    } else {
      exibirBannerNaTela("🔔 Alertas em Tela Ativos!", "Como o aviso do sistema foi negado, o app exibirá alertas sonoros e visuais na tela.");
    }
  } catch (err) {
    console.error("Erro ao pedir permissão:", err);
    exibirBannerNaTela("🔔 Alertas Ativos!", "Alertas sonoros configurados com sucesso.");
  }
});

async function dispararNotificacao(titulo, corpo) {
  exibirBannerNaTela(titulo, corpo);

  if (!("Notification" in window) || Notification.permission !== "granted") {
    return;
  }

  const opcoes = {
    body: corpo,
    icon: "https://cdn-icons-png.flaticon.com/512/2921/2921222.png",
    vibrate: [200, 100, 200]
  };

  if (swRegistration && swRegistration.showNotification) {
    try {
      await swRegistration.showNotification(titulo, opcoes);
      return;
    } catch (e) {
      console.warn("Erro no showNotification:", e);
    }
  }

  try {
    new Notification(titulo, opcoes);
  } catch (e) {
    console.warn("Erro no new Notification:", e);
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
        dispararNotificacao("⏱️ Lembrete de Ponto (5 min)", `Hora de ${ev.rotulo} às ${ev.horario}. Registre seu ponto!`);
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

// Alternar Ônibus
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

// Inicialização
carregarValores();
renderizarTabela();
calcularMetricas();