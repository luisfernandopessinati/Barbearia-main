// models/MovtoEstoque.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/db'); // corrigido de ../config/database

const MovtoEstoque = sequelize.define('MovtoEstoque', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    empresa_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    produto_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    documento_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    tipo_documento: {
        type: DataTypes.ENUM('VENDA', 'AJUSTE', 'COMPRA', 'ENTRADA_MANUAL'),
        allowNull: false
    },
    ent_sai: {
        type: DataTypes.ENUM('E', 'S'),
        allowNull: false,
        comment: 'E=Entrada, S=Saída'
    },
    qtd_anterior: {
        type: DataTypes.DECIMAL(10, 3),
        allowNull: false
    },
    quantidade: {
        type: DataTypes.DECIMAL(10, 3),
        allowNull: false
    },
    qtd_final: {
        type: DataTypes.DECIMAL(10, 3),
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
    }
}, {
    tableName: 'movtoestoque',
    timestamps: false
});

module.exports = MovtoEstoque;
