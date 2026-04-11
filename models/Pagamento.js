// models/Pagamento.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

/**
 * Tabela: Pagamentos
 *
 * Registra cada entrada financeira vinculada a uma venda.
 * Uma venda pode ter N pagamentos (ex: parte em dinheiro, parte em pix).
 * Preparada para crediário futuro (parcela / total_parcelas / saldo / juros).
 *
 * origem:
 *   'pdv'        → venda balcão (fluxo normal)
 *   'crediario'  → parcela de crediário (futuro)
 *   'estorno'    → devolução/cancelamento
 */

const Pagamento = sequelize.define('Pagamentos', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },

    venda_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'Vendas', key: 'id' },
    },

    usuario_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'Admins', key: 'id' },
    },

    forma_pagamento: {
        type: DataTypes.ENUM(
            'dinheiro',
            'cartao_credito',
            'cartao_debito',
            'pix',
            'crediario',   // reservado para uso futuro
            'outro'
        ),
        allowNull: false,
        defaultValue: 'outro',
    },

    /** Valor pago neste registro */
    valor: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
    },

    /**
     * Desconto aplicado neste pagamento.
     * Na maioria dos casos o desconto fica no cabeçalho da venda,
     * mas para crediário pode haver desconto por quitação antecipada.
     */
    desconto: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0,
    },

    /**
     * Juros aplicados (crediário futuro).
     * No PDV normal sempre 0.
     */
    juros: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0,
    },

    /**
     * Saldo devedor após este pagamento.
     * PDV à vista → 0.
     * Crediário   → total_final - soma_paga_até_aqui.
     */
    saldo: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        defaultValue: 0,
    },

    /**
     * Número da parcela (1, 2, 3…).
     * PDV à vista → 1.
     * Crediário   → incrementa a cada recebimento.
     */
    parcela: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 1,
    },

    /**
     * Total de parcelas previstas.
     * PDV à vista  → 1.
     * 2x cartão    → 2 (futuro, se quiser controlar).
     * Crediário    → N definido na criação.
     */
    total_parcelas: {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: 1,
    },

    /**
     * Origem do pagamento:
     *   'pdv'       → balcão
     *   'crediario' → parcela recebida do crediário (futuro)
     *   'estorno'   → devolução
     */
    origem: {
        type: DataTypes.ENUM('pdv', 'crediario', 'estorno'),
        allowNull: false,
        defaultValue: 'pdv',
    },

    /**
     * Código de autorização retornado pela maquininha / gateway.
     * Preenchido manualmente ou via integração futura.
     */
    numero_autorizacao: {
        type: DataTypes.STRING(50),
        allowNull: true,
    },

    /**
     * Bandeira do cartão (Visa, Master, Elo, Amex…).
     * Útil para relatórios e conciliação.
     */
    bandeira: {
        type: DataTypes.STRING(30),
        allowNull: true,
    },

    /** Data de vencimento — útil para crediário futuro */
    data_vencimento: {
        type: DataTypes.DATEONLY,
        allowNull: true,
    },

    /** Data em que o pagamento foi efetivamente recebido */
    data_recebimento: {
        type: DataTypes.DATE,
        allowNull: true,
    },

    observacao: {
        type: DataTypes.STRING(255),
        allowNull: true,
    },
}, {
    tableName: 'Pagamentos',
    timestamps: true,   // createdAt = data do registro
});

// Pagamento.sync({ alter: true });
module.exports = Pagamento;