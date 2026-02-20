/* const Sequelize = require('sequelize')
const sequelize = new Sequelize('barbearia', 'root', '123@qwe', {
    host: 'localhost',
    dialect: 'mysql',
    logging: false,
})

sequelize.authenticate().then(function () {
    console.log("Conectado")
}).catch(function (erro) {
    console.log("Erro ao se conectar" + erro)
}) 

module.exports = sequelize;
*/


const Sequelize = require('sequelize')
const sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASS,
    {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        dialect: 'mysql',
        logging: false,
    }
)

sequelize.authenticate().then(function () {
    console.log("Conectado")
}).catch(function (erro) {
    console.log("Erro ao se conectar" + erro)
}) 

module.exports = sequelize;