<?php

mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

function ambienteLocal(): bool
{
    $host = strtolower((string) ($_SERVER['HTTP_HOST'] ?? ''));
    $host = preg_replace('/:\d+$/', '', $host) ?? $host;
    if ($host === '' || $host === 'localhost' || $host === '127.0.0.1') {
        return true;
    }
    return str_ends_with($host, '.test');
}

function configuracaoBanco(): array
{
    if (ambienteLocal()) {
        return [
            'host' => '127.0.0.1',
            'usuario' => 'root',
            'senha' => '',
            'banco' => 'proftech_caixa',
            'porta' => 3306,
        ];
    }

    $arquivo = __DIR__ . '/credenciais.php';
    if (!is_file($arquivo)) {
        throw new mysqli_sql_exception('Falta o arquivo de conexão do servidor.');
    }
    $cfg = require $arquivo;
    if (!is_array($cfg)) {
        throw new mysqli_sql_exception('O arquivo de conexão do servidor é inválido.');
    }
    return $cfg;
}

function garantirTabelas(mysqli $db): void
{
    $db->query(
        "CREATE TABLE IF NOT EXISTS lancamentos (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $db->query(
        "CREATE TABLE IF NOT EXISTS usuarios (
            id INT UNSIGNED NOT NULL AUTO_INCREMENT,
            cpf VARCHAR(14) NOT NULL,
            senha_hash VARCHAR(255) NOT NULL,
            criado_em DATETIME NOT NULL,
            PRIMARY KEY (id),
            UNIQUE KEY uk_usuarios_cpf (cpf)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $db->query(
        "CREATE TABLE IF NOT EXISTS recebimentos (
            lancamento_id VARCHAR(36) NOT NULL,
            competencia CHAR(7) NOT NULL,
            PRIMARY KEY (lancamento_id, competencia),
            CONSTRAINT fk_recebimentos_lancamento
                FOREIGN KEY (lancamento_id) REFERENCES lancamentos (id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $db->query(
        "CREATE TABLE IF NOT EXISTS clientes (
            id VARCHAR(36) NOT NULL,
            nome VARCHAR(80) NOT NULL,
            telefone VARCHAR(20) NOT NULL,
            criado_em DATETIME NOT NULL,
            PRIMARY KEY (id),
            KEY idx_clientes_nome (nome)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $coluna = $db->query("SHOW COLUMNS FROM lancamentos LIKE 'cliente_id'");
    if ($coluna && $coluna->num_rows === 0) {
        $db->query('ALTER TABLE lancamentos ADD COLUMN cliente_id VARCHAR(36) NULL');
        $db->query('ALTER TABLE lancamentos ADD KEY idx_lancamentos_cliente (cliente_id)');
    }
    $fk = $db->query(
        "SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lancamentos' AND CONSTRAINT_NAME = 'fk_lancamentos_cliente'"
    );
    if ($fk && $fk->num_rows === 0) {
        $db->query(
            'ALTER TABLE lancamentos
             ADD CONSTRAINT fk_lancamentos_cliente
             FOREIGN KEY (cliente_id) REFERENCES clientes (id) ON DELETE SET NULL'
        );
    }
    $db->query('ALTER TABLE usuarios MODIFY cpf VARCHAR(14) NOT NULL');
}

function conectar(): mysqli
{
    $cfg = configuracaoBanco();
    $mysqli = new mysqli(
        (string) $cfg['host'],
        (string) $cfg['usuario'],
        (string) $cfg['senha'],
        (string) $cfg['banco'],
        (int) $cfg['porta']
    );
    $mysqli->set_charset('utf8mb4');
    garantirTabelas($mysqli);
    return $mysqli;
}
