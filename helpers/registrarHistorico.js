const AgendamentoHistorico = require('../models/AgendamentoHistorico');

async function registrarHistorico(dadosNovos, acao, feito_por, feito_por_id = null, feito_por_nome = null, dadosAntigos = null) {
    try {
        let alteracoes = null;

        if (dadosAntigos && acao === 'editado') {

            const campos = {
                nome: 'Nome',
                telefone: 'Telefone',
                data: 'Data',
                horario: 'Horário',
                servico: 'Serviço',
                barbeiro: 'Profissional',
                observacao: 'Observação',
                status: 'Status'
            };

            // Normaliza datas e valores para string comparável
            function normalizar(campo, valor) {
                if (valor === null || valor === undefined || valor === '') return '—';
                if (campo === 'data') {
                    const d = new Date(valor);
                    if (!isNaN(d)) {
                        d.setMinutes(d.getMinutes() + d.getTimezoneOffset());
                        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
                    }
                }
                if (campo === 'horario' || campo === 'hora_inicio' || campo === 'hora_fim') {
                    return String(valor).trim().substring(0, 5);
                }
                return String(valor).trim();  // ← já estava aqui, mas os dados chegavam com espaço antes
            }

            const linhas = [];
            for (const [campo, label] of Object.entries(campos)) {
                const antes = normalizar(campo, dadosAntigos[campo]);
                const depois = normalizar(campo, dadosNovos[campo]);
                if (antes !== depois) {
                    linhas.push(`${label}: "${antes}" → "${depois}"`);
                }
            }
            alteracoes = linhas.length ? linhas.join('\n') : null;
        }

        await AgendamentoHistorico.create({
            agendamento_id: dadosNovos.id,
            idEmpresa: dadosNovos.idEmpresa,
            acao,
            feito_por,
            feito_por_id,
            feito_por_nome,
            alteracoes,
            profissional_id: dadosNovos.profissional_id,
            barbeiro: dadosNovos.barbeiro,
            nome: dadosNovos.nome,
            telefone: dadosNovos.telefone,
            data: dadosNovos.data,
            hora_inicio: dadosNovos.hora_inicio,
            hora_fim: dadosNovos.hora_fim,
            servico: dadosNovos.servico,
            valor: dadosNovos.valor,
            status: dadosNovos.status,
            observacao: dadosNovos.observacao,
            visto_admin: feito_por === 'cliente' ? 0 : 1
        });
    } catch (err) {
        console.error('[registrarHistorico] Erro ao salvar histórico:', err.message);
    }
}

module.exports = registrarHistorico;