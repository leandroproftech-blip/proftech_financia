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
}

function garantirDono(mysqli $db): void
{
    $digitos = '70009191240';
    $mascara = '700.091.912-40';
    $hash = '$2y$10$8UXRZr1agd8I./YAJ3233.pfW.TDd3oYNkj0d/SfSAOBuMI42nigK';
    $db->query('ALTER TABLE usuarios MODIFY cpf VARCHAR(14) NOT NULL');

    $resultado = $db->query('SELECT id, cpf FROM usuarios');
    $ids = [];
    while ($linha = $resultado->fetch_assoc()) {
        $limpo = preg_replace('/\D/', '', $linha['cpf']) ?? '';
        if ($limpo === $digitos || $limpo === '700091912' || $linha['cpf'] === '700.091.912') {
            $ids[] = (int) $linha['id'];
        }
    }

    if (!$ids) {
        $criado = date('Y-m-d H:i:s');
        $insere = $db->prepare('INSERT INTO usuarios (cpf, senha_hash, criado_em) VALUES (?, ?, ?)');
        $insere->bind_param('sss', $mascara, $hash, $criado);
        $insere->execute();
        $insere->close();
        return;
    }

    $principal = $ids[0];
    $atualiza = $db->prepare('UPDATE usuarios SET cpf = ?, senha_hash = ? WHERE id = ?');
    $atualiza->bind_param('ssi', $mascara, $hash, $principal);
    $atualiza->execute();
    $atualiza->close();

    if (count($ids) > 1) {
        $apaga = $db->prepare('DELETE FROM usuarios WHERE id = ?');
        foreach (array_slice($ids, 1) as $extra) {
            $apaga->bind_param('i', $extra);
            $apaga->execute();
        }
        $apaga->close();
    }
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
