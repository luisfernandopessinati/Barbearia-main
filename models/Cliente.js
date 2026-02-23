const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');
const bcrypt = require('bcryptjs');

const Cliente = sequelize.define('Clientes', {
    email: {
        type: DataTypes.STRING,
        allowNull: true,
        unique: true,
    },
    senha: {
        type: DataTypes.STRING,
        allowNull: true
    },
    nome: {
        type: DataTypes.STRING,
        allowNull: false
    },
    cpf: {
        type: DataTypes.STRING,
        allowNull: true,
        unique: true
    },
    telefone: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
    }
});

 Cliente.sync({ force: true });
module.exports = Cliente;
