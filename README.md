
# Barbearia - Projeto Final 

Bem-vindo ao sistema de agendamentos da barbearia! Este projeto foi desenvolvido para gerenciar os agendamentos de uma barbearia, permitindo que os administradores visualizem, atualizem e excluam os agendamentos de maneira eficiente.

## Tecnologias Utilizadas
- Front-end: HTML, CSS, JavaScript, Swiper.js
- Back-end: Node.js, Express, body-parser, Express-handlebars, express-session, passport, bcryptjs, dotenv
- Banco de Dados: MySQL

## Funcionalidades
1. Criar Agendamento:
- Os clientes podem agendar um horário para um serviço na barbearia.
- O formulário de agendamento coleta informações como nome, telefone, data, hora e tipo de serviço.

2. Visualizar Agendamentos:
- Os administradores podem visualizar uma lista de todos os agendamentos.
- A lista inclui detalhes como nome do cliente,telefone, data, hora, e tipo de serviço.

3. Atualizar Agendamento:
- Os administradores podem atualizar as informações de um agendamento existente.
- Isso permite ajustar datas, horários e outros detalhes conforme necessário.

4. Deletar Agendamento:
- Os administradores podem excluir agendamentos que não são mais necessários.
- Isso ajuda a manter o sistema organizado e livre de agendamentos antigos ou cancelados.

5. Autenticação de Administrador
- Somente usuários autenticados como administradores podem acessar a área de gerenciamento de agendamentos.

6. Cadastro de serviços 
- Usuários administradores podem incluir ou alterar serviços conforme precisar

7. inclusão de horários e dias
-  Adnistradores podem colocar dias de folga ou feriados para o cliente não agendar 

8. Interface Intuitiva
- O sistema possui uma interface de usuário simples e intuitiva, facilitando a navegação e uso do sistema.

## commits 
homologacao

git add .
git commit -m "update"
git push origin main

p´roducao
git pull origin main
pm2 restart all

## Pré-requisitos
Antes de começar, certifique-se de ter as seguintes ferramentas instaladas em seu ambiente de desenvolvimento:
- Node.js
- MySQL

## Passos de Instalação
1. Clone o repositório para sua máquina local:
```
git clone git@github.com:Mateusveloso26/Barbearia.git
```
2. Navegue até o diretório do projeto:
```
cd Barbearia
```
3. Instale as dependências do projeto usando npm:
```
npm install

```
4. Configure as variáveis de ambiente no arquivo .env
```
PORT = <sua_porta>
CHAVE = <sua_chave>

```

5. Na pasta config/db, configure a conexão com o banco de dados MySQL utilizando Sequelize. O arquivo de configuração deve ser semelhante ao seguinte:
```
const sequelize = new Sequelize('barbearia', 'root', 'root', {
    host: 'localhost',
    dialect: 'mysql',
    logging: false,
})
```

6. Execute a aplicação:
```
npm run dev
```
npm install multer

npm install jsonwebtoken



7. Abra o navegador e acesse:
```
http://localhost:3333
```

![]()

# Atualizar o projeto #
git pull origin main
npm install   # só se alterou dependências
pm2 reload barbearia


# Cloudflare DDNS - Atualização Automática de IP

Script que monitora seu IP público e atualiza automaticamente os registros DNS no Cloudflare quando ele mudar.

---

## 1. Pré-requisitos

- Node.js instalado
- Domínio configurado no Cloudflare

---

## 2. Pegando os IDs necessários

### API Token
1. Acesse cloudflare.com → **My Profile** → **API Tokens**
2. Clique em **Create Token**
3. Use o template **Edit zone DNS**
4. Copie o token gerado

### Zone ID
1. Acesse cloudflare.com → clique no seu domínio
2. Na página inicial do domínio, role para baixo no lado direito
3. Copie o **Zone ID**

### Record ID (ID do registro A)
Rode este comando no terminal substituindo seus dados:

```bash
curl -X GET "https://api.cloudflare.com/client/v4/zones/SEU_ZONE_ID/dns_records?type=A" \
  -H "Authorization: Bearer SEU_API_TOKEN" \
  -H "Content-Type: application/json"
```

Procure o campo `"id"` do registro com o seu domínio.

---

## 3. Configurar o script

Abra o `ddns.js` e preencha:

```js
const CONFIG = {
  API_TOKEN: 'seu_api_token_aqui',
  ZONE_ID: 'seu_zone_id_aqui',
  REGISTROS: [
    {
      RECORD_ID: 'id_do_registro_A_aqui',
      DOMINIO: 'seudominio.com'
    }
  ],
  INTERVALO_MINUTOS: 5
};
```

Para múltiplos domínios, adicione mais objetos no array `REGISTROS`.

---

## 4. Rodar o script

```bash
node ddns.js
```

---

## 5. Rodar automaticamente com PM2 (recomendado)

Para o script iniciar junto com o servidor e reiniciar se travar:

```bash
# Instalar PM2
npm install -g pm2

# Iniciar o script
pm2 start ddns.js --name "cloudflare-ddns"

# Salvar para iniciar no boot
pm2 save
pm2 startup
```

### Comandos úteis do PM2:
```bash
pm2 status                    # Ver se está rodando
pm2 logs cloudflare-ddns      # Ver logs em tempo real
pm2 restart cloudflare-ddns   # Reiniciar
pm2 stop cloudflare-ddns      # Parar
```

---

## 6. Logs

O script gera um arquivo `ddns.log` na mesma pasta com o histórico de atualizações:

```
[25/02/2026, 10:00:00] 🚀 DDNS iniciado!
[25/02/2026, 10:00:01] IP não mudou (189.x.x.x), nenhuma atualização necessária.
[25/02/2026, 15:32:10] IP mudou! Antigo: 189.x.x.x → Novo: 201.x.x.x
[25/02/2026, 15:32:11] ✅ seudominio.com atualizado para 201.x.x.x
```
