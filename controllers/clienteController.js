const Cliente = require('../models/Cliente');
const Agendamento = require('../models/Agendamento');
const Admin = require('../models/Admin');

module.exports = {
    listar: async (req, res) => {
        try {
            const idEmpresa = req.user.idEmpresa;

            // ── Ranking barbeiros com top clientes de cada um ──
            const barbeiros = await Admin.findAll({
                where: { idEmpresa, ativo: 'S' },
                attributes: ['id', 'nome']
            });

            const rankingBarbeiros = await Promise.all(barbeiros.map(async (b) => {
                const agendamentos = await Agendamento.findAll({
                    where: { profissional_id: b.id, idEmpresa },
                    order: [['data', 'DESC']]
                });

                const total = agendamentos.length;
                const faturamento = agendamentos.reduce((sum, a) => sum + parseFloat(a.valor || 0), 0);

                const servicoCount = {};
                agendamentos.forEach(a => {
                    if (a.servico) servicoCount[a.servico] = (servicoCount[a.servico] || 0) + 1;
                });
                const servicoTop = Object.entries(servicoCount).sort((a, b) => b[1] - a[1])[0]?.[0] || '-';

                let ultimoAtendimento = null;
                if (agendamentos[0]) {
                    const d = new Date(agendamentos[0].data);
                    d.setMinutes(d.getMinutes() + d.getTimezoneOffset());
                    ultimoAtendimento = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
                }

                // Top 5 clientes desse barbeiro
                const clienteCount = {};
                const clienteValor = {};
                agendamentos.forEach(a => {
                    const tel = a.telefone;
                    if (!tel) return;
                    clienteCount[tel] = (clienteCount[tel] || 0) + 1;
                    clienteValor[tel] = (clienteValor[tel] || 0) + parseFloat(a.valor || 0);
                });

                const topClientesBarbeiro = Object.entries(clienteCount)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5)
                    .map(([tel, qtd]) => ({ telefone: tel, total: qtd, valor: clienteValor[tel].toFixed(2).replace('.', ',') }));

                // Busca nomes dos clientes
                const topComNome = await Promise.all(topClientesBarbeiro.map(async (c) => {
                    const cliente = await Cliente.findOne({ where: { telefone: c.telefone, idEmpresa } });
                    return { ...c, nome: cliente?.nome || c.telefone };
                }));

                return {
                    id: b.id,
                    nome: b.nome,
                    total,
                    faturamento: faturamento.toFixed(2).replace('.', ','),
                    servicoTop,
                    ultimoAtendimento,
                    topClientes: topComNome
                };
            }));

            rankingBarbeiros.sort((a, b) => b.total - a.total);

            // ── Clientes ──
            const clientes = await Cliente.findAll({ where: { idEmpresa } });

            const clientesComDados = await Promise.all(clientes.map(async (c) => {
                const agendamentos = await Agendamento.findAll({
                    where: { telefone: c.telefone, idEmpresa },
                    order: [['data', 'DESC']]
                });

                const total = agendamentos.length;
                const valorTotal = agendamentos.reduce((sum, a) => sum + parseFloat(a.valor || 0), 0);

                const ultimo = agendamentos[0];
                let ultimoAgendamento = null;
                let ultimoAgendamentoISO = '';
                if (ultimo) {
                    const d = new Date(ultimo.data);
                    d.setMinutes(d.getMinutes() + d.getTimezoneOffset());
                    ultimoAgendamento = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
                    const yyyy = d.getFullYear();
                    const mm = String(d.getMonth()+1).padStart(2,'0');
                    const dd = String(d.getDate()).padStart(2,'0');
                    ultimoAgendamentoISO = `${yyyy}-${mm}-${dd}`;
                }

                const servicoCount = {};
                agendamentos.forEach(a => {
                    if (a.servico) servicoCount[a.servico] = (servicoCount[a.servico] || 0) + 1;
                });
                const servicoFavorito = Object.entries(servicoCount).sort((a, b) => b[1] - a[1])[0]?.[0] || '-';

                return {
                    id: c.id,
                    nome: c.nome,
                    telefone: c.telefone,
                    observacao: c.observacao || '',
                    nascimento: c.nascimento || '',
                    total,
                    valorTotal: valorTotal.toFixed(2).replace('.', ','),
                    ultimoAgendamento,
                    ultimoAgendamentoISO, 
                    servicoFavorito
                };
            }));

            clientesComDados.sort((a, b) => b.total - a.total);
            const topClientes = clientesComDados.slice(0, 5);

            res.render('clientes', {
                rankingBarbeiros,
                topClientes,
                clientes: clientesComDados,
                clientesJson: JSON.stringify(clientesComDados)
            });

        } catch (error) {
            res.status(500).send('Erro: ' + error.message);
        }
    }
};