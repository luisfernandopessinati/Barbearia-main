const { Sequelize, DataTypes } = require('sequelize');
const sequelize = require('../config/db'); 

const Agendamento = sequelize.define('Agendamentos', {
    idEmpresa: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    barbeiro: {
        type: DataTypes.STRING 
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
        type: DataTypes.DATE,
        allowNull: false
    },
    horario: {
        type: DataTypes.STRING,
        allowNull: false
    },
    servico: {
        type: DataTypes.STRING,
        allowNull: false
    },
    valor: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,   // true para não quebrar agendamentos antigos
        defaultValue: 0
    }
});

// Para adicionar a coluna sem apagar dados existentes, use alter:true
// Agendamento.sync({ alter: true });

module.exports = Agendamento;
