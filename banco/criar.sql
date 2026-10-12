CREATE DATABASE IF NOT EXISTS proftech_caixa
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE proftech_caixa;

CREATE TABLE IF NOT EXISTS lancamentos (
  id VARCHAR(36) NOT NULL,
  tipo ENUM('entrada', 'saida') NOT NULL,
  descricao VARCHAR(80) NOT NULL,
  centavos BIGINT UNSIGNED NOT NULL,
  data DATE NOT NULL,
  situacao ENUM('a_receber', 'recebido') NULL,
  modalidade ENUM('avulsa', 'recorrente') NULL,
  criado_em DATETIME NOT NULL,
  PRIMARY KEY (id),
  KEY idx_lancamentos_data (data)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS recebimentos (
  lancamento_id VARCHAR(36) NOT NULL,
  competencia CHAR(7) NOT NULL,
  PRIMARY KEY (lancamento_id, competencia),
  CONSTRAINT fk_recebimentos_lancamento
    FOREIGN KEY (lancamento_id) REFERENCES lancamentos (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
