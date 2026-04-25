// models/Despesa.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

/**
 * Tabela: Despesas
 *
 * Registra saídas de caixa que não são vendas:
 * sangria, pagamento de fornecedor, compras, despesas operacionais, etc.
 * Usada pelo fechamento de caixa para apurar o saldo real do dia.
 */

const Despesa = sequelize.define('Despesas', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },

    idEmpresa: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },

    usuario_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'Admins', key: 'id' },
    },

    categoria: {
        type: DataTypes.ENUM(
            'operacional',   // aluguel, energia, internet, etc.
            'fornecedor',    // pagamento a fornecedor
            'sangria',       // retirada de dinheiro do caixa
            'outros'
        ),
        allowNull: false,
        defaultValue: 'outros',
    },

    descricao: {
        type: DataTypes.STRING(255),
        allowNull: false,
    },

    valor: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
    },

    /**
     * Forma como o dinheiro saiu do caixa.
     * Importante para conciliar o saldo por modalidade no fechamento.
     */
    forma_pagamento: {
        type: DataTypes.ENUM('dinheiro', 'pix', 'cartao_debito', 'cartao_credito', 'outro'),
        allowNull: false,
        defaultValue: 'dinheiro',
    },

    observacao: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
}, {
    tableName: 'Despesas',
    timestamps: true,   // createdAt = data/hora do lançamento
});

// Despesa.sync({ alter: true });
module.exports = Despesa;