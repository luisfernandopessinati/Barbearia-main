const { Sequelize, DataTypes } = require('sequelize');
const sequelize = require('../config/db'); 

const Agendamento = sequelize.define('Agendamentos', {
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
    }    
});
//Agendamento.sync ({force:true})
module.exports = Agendamento

