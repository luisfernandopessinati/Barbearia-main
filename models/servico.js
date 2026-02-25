const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Servico = sequelize.define('Servicos', {
    idEmpresa: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    nome: {
        type: DataTypes.STRING,
        allowNull: false
    },
    valor: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false
    },
    ativo: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    }
});

//Servico.sync({ force: true });
module.exports = Servico;