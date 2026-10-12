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
            cpf CHAR(11) NOT NULL,
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
}

function garantirDono(mysqli $db): void
{
    $cpf = '70009191240';
    $hash = '$2y$10$8UXRZr1agd8I./YAJ3233.pfW.TDd3oYNkj0d/SfSAOBuMI42nigK';
    $consulta = $db->prepare('SELECT id FROM usuarios WHERE cpf = ?');
    $consulta->bind_param('s', $cpf);
    $consulta->execute();
    $existe = $consulta->get_result()->fetch_assoc();
    $consulta->close();
    if ($existe) {
        return;
    }
    $criado = date('Y-m-d H:i:s');
    $insere = $db->prepare('INSERT INTO usuarios (cpf, senha_hash, criado_em) VALUES (?, ?, ?)');
    $insere->bind_param('sss', $cpf, $hash, $criado);
    $insere->execute();
    $insere->close();
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
    garantirDono($mysqli);
    return $mysqli;
}
