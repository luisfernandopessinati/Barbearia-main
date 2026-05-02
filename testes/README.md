# Testes E2E — Barbearia

Testes automatizados com **Playwright**. O robô abre um Chrome real,
navega pelo sistema e verifica cada fluxo.

---

## Instalação (fazer só uma vez)

```bash
# 1. Entre na pasta de testes
cd tests

# 2. Instale as dependências
npm install

# 3. Instale o navegador Chromium do Playwright
npx playwright install chromium
```

---

## Configuração

Edite o arquivo `tests/.env.test` com seus dados reais:

```
ADMIN_EMAIL=admin@teste.com
ADMIN_SENHA=suasenha

PRODUTO_NOME=Produto Teste Playwright
PRODUTO_PRECO=25.00
PRODUTO_ESTOQUE=100
```

---

## Como rodar

> Sempre com o servidor rodando em localhost:3334

### Rodar todos os testes em sequência
```bash
cd tests
npm test
```

### Rodar só um teste específico
```bash
npm run test:login      # só o login
npm run test:produto    # só cadastro de produto
npm run test:agenda     # agendamento barbeiro + cliente
npm run test:venda      # lançamento de venda
npm run test:cancelar   # cancelamento
npm run test:caixa      # despesa no caixa
```

---

## O que cada teste faz

| Arquivo | O que testa |
|---|---|
| `01-login.spec.js` | Login válido + login com senha errada |
| `02-produto.spec.js` | Cadastra o produto usado nos testes de venda |
| `03-agendamento-barbeiro.spec.js` | Cria agendamento pelo painel admin |
| `04-agendamento-cliente.spec.js` | Agendamento pelo link público + alteração de horário |
| `05-venda.spec.js` | PDV completo: busca produto → carrinho → finaliza |
| `06-cancelamento.spec.js` | Cancela a venda criada no teste anterior |
| `07-caixa.spec.js` | Lança despesa, verifica saldo e exclui |

---

## Ajustes que podem ser necessários

Os seletores CSS/HTML dos testes foram escritos de forma genérica
para funcionar na maioria dos casos, mas se o seu sistema usar
nomes de campos diferentes, ajuste os `locator()` nos specs.

Exemplos comuns de ajuste:
- Rota de cadastro de produto: `/admin/produtos/novo`
- Rota de agendamento público: `/agendar`
- Nome dos campos no formulário (`name="descricao"` vs `name="nome"`)

---

## Entendendo um erro

Quando um teste falha, o Playwright:
1. Tira um **screenshot** da tela no momento do erro
2. Grava um **vídeo** de toda a execução
3. Abre o relatório HTML automaticamente

Tudo fica em `playwright-report/` na raiz do projeto.
