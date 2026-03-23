// models/VendaItem.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const VendaItem = sequelize.define('VendaItens', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    venda_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'Vendas', key: 'id' }
    },
    produto_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'Produtos', key: 'id' }
    },
    quantidade: {
        type: DataTypes.DECIMAL(10, 3),
        allowNull: false
    },
    preco_unitario: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false
    },
    subtotal: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false
    }
}, {
    tableName: 'VendaItens',
    timestamps: false
});

// VendaItem.sync({ alter: true });
module.exports = VendaItem;
