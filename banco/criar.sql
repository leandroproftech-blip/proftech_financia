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

CREATE TABLE IF NOT EXISTS usuarios (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  cpf CHAR(11) NOT NULL,
  senha_hash VARCHAR(255) NOT NULL,
  criado_em DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_usuarios_cpf (cpf)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS recebimentos (
  lancamento_id VARCHAR(36) NOT NULL,
  competencia CHAR(7) NOT NULL,
  PRIMARY KEY (lancamento_id, competencia),
  CONSTRAINT fk_recebimentos_lancamento
    FOREIGN KEY (lancamento_id) REFERENCES lancamentos (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO usuarios (cpf, senha_hash, criado_em)
SELECT '70009191240', '$2y$10$8UXRZr1agd8I./YAJ3233.pfW.TDd3oYNkj0d/SfSAOBuMI42nigK', NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM usuarios WHERE cpf = '70009191240'
);
