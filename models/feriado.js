// models/Feriado.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Feriado = sequelize.define('Feriados', {
    data: {
        type: DataTypes.DATEONLY,  // só a data, sem horário
        allowNull: false,
        unique: true
    },
    descricao: {
        type: DataTypes.STRING,
        allowNull: false
    }
});

// Feriado.sync({ force: true });
module.exports = Feriado;