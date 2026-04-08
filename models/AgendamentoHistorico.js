const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const AgendamentoHistorico = sequelize.define('AgendamentosHistorico', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    agendamento_id: {
        type: DataTypes.INTEGER,
        allowNull: false
        // sem references pois o agendamento pode ter sido deletado
    },
    idEmpresa: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    acao: {
        type: DataTypes.ENUM('criado', 'editado', 'cancelado', 'excluido', 'confirmado', 'concluido', 'pago'),
        allowNull: false
    },
    feito_por: {
        type: DataTypes.ENUM('cliente', 'admin'),
        allowNull: false
    },
    feito_por_id: {
        type: DataTypes.INTEGER,
        allowNull: true  // id do admin se feito por admin, null se cliente
    },
    feito_por_nome: {
        type: DataTypes.STRING,
        allowNull: true  // nome do admin ou nome do cliente
    },

    // Snapshot do agendamento NO MOMENTO da ação
    profissional_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    barbeiro: {
        type: DataTypes.STRING,
        allowNull: true
    },
    nome: {
        type: DataTypes.STRING,
        allowNull: true
    },
    telefone: {
        type: DataTypes.STRING,
        allowNull: true
    },
    data: {
        type: DataTypes.DATEONLY,
        allowNull: true
    },
    hora_inicio: {
        type: DataTypes.TIME,
        allowNull: true
    },
    hora_fim: {
        type: DataTypes.TIME,
        allowNull: true
    },
    servico: {
        type: DataTypes.STRING,
        allowNull: true
    },
    valor: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true
    },
    status: {
        type: DataTypes.STRING,
        allowNull: true
    },
    observacao: {
        type: DataTypes.STRING,
        allowNull: true
    },

    // Para sinalizar no sininho do admin
    visto_admin: {
        type: DataTypes.TINYINT(1),
        defaultValue: 0,
        allowNull: false
    },
    visto_em: {
        type: DataTypes.DATE,
        allowNull: true
    },
    alteracoes: {
        type: DataTypes.TEXT,
        allowNull: true
    },
}, {
    tableName: 'AgendamentosHistorico',  // ← igual ao que está no banco
    freezeTableName: true,
    updatedAt: false // só precisamos do createdAt como "data da ação"
});

// AgendamentoHistorico.sync({ alter: true });

module.exports = AgendamentoHistorico;