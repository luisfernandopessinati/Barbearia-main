const https = require('https');
const fs = require('fs');
const path = require('path');

// =============================================
//   CONFIGURAÇÕES - Preencha com seus dados
// =============================================
const CONFIG = {
  API_TOKEN: '46HVox64RpTeth5kTnKEYfBdcJCZpqyMjVZRfC5R',       // Cloudflare > My Profile > API Tokens
  ZONE_ID: '77b0dcc7c8e930f9a1a904bc3497ebe8',           // Cloudflare > Seu domínio > Zone ID (lado direito)
  REGISTROS: [
    {
      RECORD_ID: 'id_do_registro_A_aqui', // Veja como pegar abaixo
      DOMINIO: 'lpsolutions.com'           // Domínio exato do registro A
    },
    // Adicione mais domínios se precisar:
    // {
    //   RECORD_ID: 'outro_record_id',
    //   DOMINIO: 'empresa2.com'
    // }
  ],
  INTERVALO_MINUTOS: 5,  // Verifica a cada X minutos
  LOG_FILE: path.join(__dirname, 'ddns.log')
};
// =============================================

let ultimoIP = null;

function log(mensagem) {
  const agora = new Date().toLocaleString('pt-BR');
  const linha = `[${agora}] ${mensagem}`;
  console.log(linha);
  fs.appendFileSync(CONFIG.LOG_FILE, linha + '\n');
}

function buscarIPAtual() {
  return new Promise((resolve, reject) => {
    https.get('https://api.ipify.org?format=json', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data).ip);
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

function atualizarRegistro(recordId, dominio, novoIP) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      type: 'A',
      name: dominio,
      content: novoIP,
      ttl: 60,
      proxied: true // false se não quiser proxy do Cloudflare
    });

    const options = {
      hostname: 'api.cloudflare.com',
      path: `/client/v4/zones/${CONFIG.ZONE_ID}/dns_records/${recordId}`,
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${CONFIG.API_TOKEN}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const resposta = JSON.parse(data);
          if (resposta.success) {
            resolve();
          } else {
            reject(new Error(JSON.stringify(resposta.errors)));
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function verificarEAtualizar() {
  try {
    const ipAtual = await buscarIPAtual();

    if (ipAtual === ultimoIP) {
      log(`IP não mudou (${ipAtual}), nenhuma atualização necessária.`);
      return;
    }

    log(`IP mudou! Antigo: ${ultimoIP || 'desconhecido'} → Novo: ${ipAtual}`);

    for (const registro of CONFIG.REGISTROS) {
      try {
        await atualizarRegistro(registro.RECORD_ID, registro.DOMINIO, ipAtual);
        log(`✅ ${registro.DOMINIO} atualizado para ${ipAtual}`);
      } catch (err) {
        log(`❌ Erro ao atualizar ${registro.DOMINIO}: ${err.message}`);
      }
    }

    ultimoIP = ipAtual;

  } catch (err) {
    log(`❌ Erro geral: ${err.message}`);
  }
}

// Roda imediatamente ao iniciar
log('🚀 DDNS iniciado!');
verificarEAtualizar();

// Depois roda a cada X minutos
const intervaloMs = CONFIG.INTERVALO_MINUTOS * 60 * 1000;
setInterval(verificarEAtualizar, intervaloMs);
log(`⏱  Verificando IP a cada ${CONFIG.INTERVALO_MINUTOS} minutos...`);
