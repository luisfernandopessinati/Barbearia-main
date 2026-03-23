// models/Venda.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Venda = sequelize.define('Vendas', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    idEmpresa: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    cliente_id: {
        type: DataTypes.INTEGER,
        allowNull: true, // pode vender sem cadastro
        references: { model: 'Clientes', key: 'id' }
    },
    usuario_id: {
        type: DataTypes.INTEGER,
        allowNull: true, // admin/profissional que registrou
        references: { model: 'Admins', key: 'id' }
    },
    total: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0
    },
    desconto: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0
    },
    total_final: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0
    },
    forma_pagamento: {
        type: DataTypes.ENUM('dinheiro', 'cartao_credito', 'cartao_debito', 'pix', 'outro'),
        allowNull: true
    },
    status_pagamento: {
        type: DataTypes.ENUM('pendente', 'pago', 'cancelado'),
        allowNull: false,
        defaultValue: 'pendente'
    },
    observacao: {
        type: DataTypes.TEXT,
        allowNull: true
    }
}, {
    tableName: 'Vendas',
    timestamps: true
});

// Venda.sync({ alter: true });
module.exports = Venda;
