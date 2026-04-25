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
        allowNull: false
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
        unique: 'dominio'
    },
    segmento: {
        type: DataTypes.STRING,
        allowNull: true
    },
    site: {
        type: DataTypes.STRING,
        allowNull: true
    },
    token_agendamento: {
        type: DataTypes.STRING,
        allowNull: true,
        unique: 'token_agendamento'
    },
    logo: {
        type: DataTypes.STRING,
        allowNull: true
    },
    observacao: {
        type: DataTypes.STRING,
        allowNull: true
    },
    estilo: {
        type: DataTypes.TINYINT,
        allowNull: true,
        defaultValue: 1
    },
    pacote: {
        type: DataTypes.TINYINT,
        allowNull: false,
        defaultValue: 1  // 1=Basico, 2=Produtos, 3=Servicos e Produtos
    },
    dias_cancelamento: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0  // 0 = sem restrição
    }  
}, {
    tableName: 'empresas',
    timestamps: true
});

module.exports = Empresa;