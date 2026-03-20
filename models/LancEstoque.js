// models/lancEstoque.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const LancEstoque = sequelize.define('LancEstoque', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    empresa_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    usuario_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    data: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
    },
    tipo: {
        type: DataTypes.ENUM('E', 'S', 'A'),
        allowNull: false
    },
    status: {
        type: DataTypes.ENUM('A', 'F', 'C'),
        allowNull: false,
        defaultValue: 'A'
    },
    observacao: {
        type: DataTypes.TEXT,
        allowNull: true
    }
}, {
    tableName: 'lanc_estoque',
    timestamps: false
});

module.exports = LancEstoque;