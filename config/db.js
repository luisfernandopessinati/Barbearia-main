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

/* */
const Sequelize = require('sequelize')
const sequelize = new Sequelize(
  process.env.MYSQLDATABASE,
  process.env.MYSQLUSER,
  process.env.MYSQLPASSWORD,
  {
    host: process.env.MYSQLHOST,
    port: process.env.MYSQLPORT,
    dialect: 'mysql',
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    }
  }
);

sequelize.authenticate().then(function () {
    console.log("Conectado")
}).catch(function (erro) {
    console.log("Erro ao se conectar" + erro)
}) 

module.exports = sequelize;
