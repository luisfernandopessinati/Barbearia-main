module.exports = {
  apps: [{
    name: "barbearia",
    script: "app.js",
    node_args: "--env-file=.env",
    watch: false,
    restart_delay: 3000
  }]
}
