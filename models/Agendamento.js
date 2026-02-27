const { Sequelize, DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Agendamento = sequelize.define('Agendamentos', {
    idEmpresa: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    profissional_id: {
        type: DataTypes.INTEGER,
        allowNull: true, // true para não quebrar dados antigos
        references: { model: 'Admins', key: 'id' }
    },
    barbeiro: {
        type: DataTypes.STRING,
        allowNull: true
    },
    nome: {
        type: DataTypes.STRING,
        allowNull: false
    },
    email: {
        type: DataTypes.STRING,
        allowNull: true
    },
    telefone: {
        type: DataTypes.STRING,
        allowNull: false
    },
    data: {
        type: DataTypes.DATEONLY,
        allowNull: false
    },
    hora_inicio: {
        type: DataTypes.TIME,
        allowNull: true // true para não quebrar dados antigos
    },
    hora_fim: {
        type: DataTypes.TIME,
        allowNull: true // true para não quebrar dados antigos
    },
    horario: {
        type: DataTypes.STRING,
        allowNull: true
    },
    servico_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'servicos', key: 'id' }
    },
    servico: {
        type: DataTypes.STRING,
        allowNull: true
    },
    valor: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0
    },
    status: {
        type: DataTypes.ENUM('pendente', 'confirmado', 'cancelado', 'concluido'),
        allowNull: false,
        defaultValue: 'pendente'
    }
});

//Agendamento.sync({ alter: true });

module.exports = Agendamento;