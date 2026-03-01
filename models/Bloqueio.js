const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Bloqueio = sequelize.define('Bloqueios', {
    profissional_id: {
        type: DataTypes.INTEGER,
        allowNull: true // null = bloqueia todos
    },
    idEmpresa: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    data: {
        type: DataTypes.DATEONLY,
        allowNull: false
    },
    hora_inicio: {
        type: DataTypes.TIME,
        allowNull: true // null = dia inteiro bloqueado
    },
    hora_fim: {
        type: DataTypes.TIME,
        allowNull: true
    },
    motivo: {
        type: DataTypes.STRING,
        allowNull: true
    }
});

 Bloqueio.sync({ alter: true }); // rodar uma vez
module.exports = Bloqueio;