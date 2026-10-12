<?php

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

require __DIR__ . '/sessao.php';
\ProfTechSessao\exigirLogin();

require __DIR__ . '/conexao.php';

function responder(int $status, $dados = null): void
{
    http_response_code($status);
    if ($dados !== null) {
        echo json_encode($dados, JSON_UNESCAPED_UNICODE);
    }
    exit;
}

function erro(int $status, string $mensagem): void
{
    responder($status, ['erro' => $mensagem]);
}

try {
    $db = conectar();
} catch (mysqli_sql_exception $e) {
    $mensagem = str_starts_with($e->getMessage(), 'Falta')
        ? 'Falta o arquivo de conexão do servidor.'
        : 'Não foi possível conectar ao banco.';
    erro(503, $mensagem);
}

function lerJson(): array
{
    $bruto = file_get_contents('php://input');
    if ($bruto === false || $bruto === '') {
        return [];
    }
    $dados = json_decode($bruto, true);
    if (!is_array($dados)) {
        erro(400, 'Os dados enviados não são válidos.');
    }
    return $dados;
}

function idValido(string $id): bool
{
    return (bool) preg_match('/^[0-9a-zA-Z-]{8,36}$/', $id);
}

function novoId(): string
{
    $bytes = random_bytes(16);
    $bytes[6] = chr(ord($bytes[6]) & 0x0f | 0x40);
    $bytes[8] = chr(ord($bytes[8]) & 0x3f | 0x80);
    $hex = bin2hex($bytes);
    return sprintf(
        '%s-%s-%s-%s-%s',
        substr($hex, 0, 8),
        substr($hex, 8, 4),
        substr($hex, 12, 4),
        substr($hex, 16, 4),
        substr($hex, 20, 12)
    );
}

function telefoneFormatado(string $valor): string
{
    $digitos = preg_replace('/\D/', '', $valor) ?? '';
    if (strlen($digitos) === 10) {
        return sprintf('(%s) %s-%s', substr($digitos, 0, 2), substr($digitos, 2, 4), substr($digitos, 6, 4));
    }
    if (strlen($digitos) === 11) {
        return sprintf('(%s) %s-%s', substr($digitos, 0, 2), substr($digitos, 2, 5), substr($digitos, 7, 4));
    }
    erro(400, 'Informe o telefone com DDD.');
}

function validarCliente(array $dados, bool $exigirId): array
{
    $id = isset($dados['id']) ? (string) $dados['id'] : '';
    if ($exigirId || $id !== '') {
        if (!idValido($id)) {
            erro(400, 'Identificador do cliente inválido.');
        }
    } else {
        $id = novoId();
    }

    $nome = trim(preg_replace('/\s+/u', ' ', (string) ($dados['nome'] ?? '')) ?? '');
    if ($nome === '' || mb_strlen($nome) > 80) {
        erro(400, 'O nome precisa ter entre 1 e 80 caracteres.');
    }

    return [
        'id' => $id,
        'nome' => $nome,
        'telefone' => telefoneFormatado((string) ($dados['telefone'] ?? '')),
    ];
}

function comoCliente(array $linha): array
{
    return [
        'id' => $linha['id'],
        'nome' => $linha['nome'],
        'telefone' => $linha['telefone'],
        'criadoEm' => str_replace(' ', 'T', $linha['criado_em']),
    ];
}

function buscarCliente(mysqli $db, string $id): ?array
{
    $consulta = $db->prepare('SELECT id, nome, telefone, DATE_FORMAT(criado_em, "%Y-%m-%dT%H:%i:%s") AS criado_em FROM clientes WHERE id = ?');
    $consulta->bind_param('s', $id);
    $consulta->execute();
    $linha = $consulta->get_result()->fetch_assoc();
    $consulta->close();
    return $linha ? comoCliente($linha) : null;
}

$metodo = $_SERVER['REQUEST_METHOD'] ?? 'GET';

try {
    if ($metodo === 'GET') {
        $resultado = $db->query('SELECT id, nome, telefone, DATE_FORMAT(criado_em, "%Y-%m-%dT%H:%i:%s") AS criado_em FROM clientes ORDER BY nome');
        $itens = [];
        while ($linha = $resultado->fetch_assoc()) {
            $itens[] = comoCliente($linha);
        }
        responder(200, $itens);
    }

    if ($metodo === 'POST') {
        $cliente = validarCliente(lerJson(), false);
        if (buscarCliente($db, $cliente['id'])) {
            erro(409, 'Esse cliente já está cadastrado.');
        }
        $insere = $db->prepare('INSERT INTO clientes (id, nome, telefone, criado_em) VALUES (?, ?, ?, ?)');
        $criado = date('Y-m-d H:i:s');
        $insere->bind_param('ssss', $cliente['id'], $cliente['nome'], $cliente['telefone'], $criado);
        $insere->execute();
        $insere->close();
        responder(201, buscarCliente($db, $cliente['id']));
    }

    if ($metodo === 'PUT') {
        $id = (string) ($_GET['id'] ?? '');
        if (!idValido($id) || !buscarCliente($db, $id)) {
            erro(404, 'Esse cliente não está mais cadastrado.');
        }
        $cliente = validarCliente(lerJson(), false);
        $atualiza = $db->prepare('UPDATE clientes SET nome = ?, telefone = ? WHERE id = ?');
        $atualiza->bind_param('sss', $cliente['nome'], $cliente['telefone'], $id);
        $atualiza->execute();
        $atualiza->close();
        responder(200, buscarCliente($db, $id));
    }

    if ($metodo === 'DELETE') {
        $id = (string) ($_GET['id'] ?? '');
        if (!idValido($id)) {
            erro(400, 'Identificador do cliente inválido.');
        }
        $apaga = $db->prepare('DELETE FROM clientes WHERE id = ?');
        $apaga->bind_param('s', $id);
        $apaga->execute();
        $apagou = $apaga->affected_rows > 0;
        $apaga->close();
        if (!$apagou) {
            erro(404, 'Esse cliente não está mais cadastrado.');
        }
        responder(204);
    }

    erro(405, 'Operação não permitida.');
} catch (mysqli_sql_exception $e) {
    erro(500, 'Não foi possível gravar no banco.');
}
