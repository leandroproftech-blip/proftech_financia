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

function schemaNaVersao(mysqli $db): bool
{
    try {
        $consulta = $db->query("SELECT valor FROM app_meta WHERE chave = 'schema' LIMIT 1");
    } catch (mysqli_sql_exception $e) {
        if ((int) $e->getCode() !== 1146) {
            throw $e;
        }
        return false;
    }
    $linha = $consulta ? $consulta->fetch_row() : null;
    return $linha && $linha[0] === '3';
}

function garantirTabelas(mysqli $db): void
{
    if (schemaNaVersao($db)) {
        return;
    }

    $trava = $db->query("SELECT GET_LOCK('proftech_schema_v3', 4)");
    $linhaTrava = $trava ? $trava->fetch_row() : null;
    if (!$linhaTrava || (int) $linhaTrava[0] !== 1) {
        return;
    }

    try {
        if (schemaNaVersao($db)) {
            return;
        }
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
    $cpf = $db->query("SHOW COLUMNS FROM usuarios LIKE 'cpf'");
    $colunaCpf = $cpf ? $cpf->fetch_assoc() : null;
    $tipoCpf = strtolower((string) ($colunaCpf['Type'] ?? ''));
    if ($tipoCpf !== '' && !str_contains($tipoCpf, 'varchar(14)')) {
        $db->query('ALTER TABLE usuarios MODIFY cpf VARCHAR(14) NOT NULL');
    }
    $db->query(
        "CREATE TABLE IF NOT EXISTS app_meta (
            chave VARCHAR(32) NOT NULL,
            valor VARCHAR(32) NOT NULL,
            PRIMARY KEY (chave)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    $db->query("INSERT INTO app_meta (chave, valor) VALUES ('schema', '3') ON DUPLICATE KEY UPDATE valor = '3'");
    } finally {
        $db->query("SELECT RELEASE_LOCK('proftech_schema_v3')");
    }
}

function conectar(): mysqli
{
    $cfg = configuracaoBanco();
    $mysqli = mysqli_init();
    $mysqli->options(MYSQLI_OPT_CONNECT_TIMEOUT, 5);
    $mysqli->real_connect(
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
