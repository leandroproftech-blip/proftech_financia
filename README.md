# profTech Financeiro

Controle mensal de entradas, saídas e saldo da profTech. Os lançamentos ficam no MySQL e aparecem no celular e no computador. O app pode ser instalado na tela inicial (PWA).

Repositório: [leandroproftech-blip/proftech_financia](https://github.com/leandroproftech-blip/proftech_financia)

## O que o app faz

- Registra entradas e saídas do mês, com valor, descrição e data.
- Nas entradas, marca se o valor já foi recebido ou ainda está a receber, e se a cobrança é avulsa ou recorrente.
- Mantém pendências em aberto mesmo quando o mês vira.
- Mostra o resumo: já recebi, falta receber, previsão, saídas e sobra em caixa.
- Gera um relatório do mês para consulta e impressão.

## Requisitos

- [Laragon](https://laragon.org/) (ou Apache/Nginx com PHP 8+)
- PHP com a extensão `mysqli`
- MySQL na porta `3306`

A conexão local usa o usuário `root` sem senha, no banco `proftech_caixa`, em `127.0.0.1:3306` (`api/conexao.php`). Esse padrão serve para o Laragon nesta máquina.

## Como rodar

1. Coloque esta pasta em `c:\laragon\www\profTech Financeiro`.
2. Ligue o Apache e o MySQL no Laragon.
3. Crie o banco. No HeidiSQL, no terminal do Laragon ou em outro cliente MySQL, execute o script `banco/criar.sql`.
4. Abra [http://proftech-financeiro.test](http://proftech-financeiro.test) ou `http://localhost/profTech%20Financeiro/`.

O script cria o banco `proftech_caixa` e as tabelas `lancamentos` e `recebimentos`.

## Estrutura

```
index.html          tela do app
manifest.json       instalação como PWA
sw.js               cache dos arquivos estáticos
css/app.css         estilos
js/app.js           tela, resumo e chamadas da API
api/conexao.php     conexão com o MySQL
api/lancamentos.php API dos lançamentos
banco/criar.sql     criação do banco e das tabelas
assets/             emblema, ícones e fonte
```

A API em `api/lancamentos.php` responde em JSON:

| Método | Uso |
| --- | --- |
| `GET` | lista os lançamentos |
| `POST` | cria um lançamento |
| `PUT ?id=` | atualiza um lançamento |
| `DELETE ?id=` | exclui um lançamento |

Recebimentos de cobrança recorrente usam `?acao=receber`.

## Subir para o GitHub

Na pasta do projeto:

```bash
git init
git add .
git commit -m "Adiciona o profTech Financeiro."
git branch -M main
git remote add origin https://github.com/leandroproftech-blip/proftech_financia.git
git push -u origin main
```

Se o repositório remoto já tiver commits, use `git pull origin main --rebase` antes do `git push`.
