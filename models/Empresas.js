const { DataTypes } = require('sequelize');
const sequelize = require('../config/db'); // ajuste o caminho se necessário

const Empresa = sequelize.define('Empresa', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    nome: {
        type: DataTypes.STRING,
        allowNull: false
    },
    fantasia: {
        type: DataTypes.STRING,
        allowNull: false
    },
    ativo: {
        type: DataTypes.STRING,
        allowNull: false
    }, 
    cnpj: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
    },
    celular: {
        type: DataTypes.STRING,
        allowNull: true
    },
    endereco: {
        type: DataTypes.STRING,
        allowNull: true
    },
    numero: {
        type: DataTypes.STRING,
        allowNull: true
    },
    bairro: {
        type: DataTypes.STRING,
        allowNull: true
    },
    cidade: {
        type: DataTypes.STRING,
        allowNull: true
    },
    dominio: {
        type: DataTypes.STRING,
        allowNull: true,
        unique: true
    }
}, {
    tableName: 'empresas',
    timestamps: true
});

module.exports = Empresa;