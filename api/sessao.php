<?php

namespace ProfTechSessao;

use mysqli;
use mysqli_sql_exception;

function iniciarSessao(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    $https = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
    session_name('PROFTECH');
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'httponly' => true,
        'samesite' => 'Lax',
        'secure' => $https,
    ]);
    session_start();
}

function exigirLogin(): void
{
    iniciarSessao();
    if (empty($_SESSION['usuario_id'])) {
        http_response_code(401);
        echo json_encode(['erro' => 'Faça login para continuar.'], JSON_UNESCAPED_UNICODE);
        exit;
    }
}

function garantirUsuarios(mysqli $db): void
{
    $db->query(
        'CREATE TABLE IF NOT EXISTS usuarios (
            id INT UNSIGNED NOT NULL AUTO_INCREMENT,
            cpf VARCHAR(14) NOT NULL,
            senha_hash VARCHAR(255) NOT NULL,
            criado_em DATETIME NOT NULL,
            PRIMARY KEY (id),
            UNIQUE KEY uk_usuarios_cpf (cpf)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );
}

function ehRotaDaSessao(): bool
{
    $script = realpath($_SERVER['SCRIPT_FILENAME'] ?? '');
    $arquivo = realpath(__FILE__);
    return $script !== false && $arquivo !== false && $script === $arquivo;
}

if (!ehRotaDaSessao()) {
    return;
}

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

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

function digitosCpf(string $cpf): string
{
    return preg_replace('/\D/', '', $cpf) ?? '';
}

function cpfValido(string $cpf): bool
{
    if (!preg_match('/^\d{11}$/', $cpf)) {
        return false;
    }
    if (preg_match('/^(\d)\1{10}$/', $cpf)) {
        return false;
    }
    for ($tamanho = 9; $tamanho < 11; $tamanho++) {
        $soma = 0;
        for ($indice = 0; $indice < $tamanho; $indice++) {
            $soma += (int) $cpf[$indice] * (($tamanho + 1) - $indice);
        }
        $digito = ((10 * $soma) % 11) % 10;
        if ((int) $cpf[$tamanho] !== $digito) {
            return false;
        }
    }
    return true;
}

function senhaValida(string $senha): bool
{
    $tamanho = strlen($senha);
    return $tamanho >= 6 && $tamanho <= 72;
}

function buscarPorCpf(mysqli $db, string $cpf): ?array
{
    $consulta = $db->prepare(
        "SELECT id, cpf, senha_hash FROM usuarios
         WHERE REPLACE(REPLACE(REPLACE(cpf, '.', ''), '-', ''), ' ', '') = ?"
    );
    $consulta->bind_param('s', $cpf);
    $consulta->execute();
    $linha = $consulta->get_result()->fetch_assoc();
    $consulta->close();
    return $linha ?: null;
}

function abrirSessao(int $id, string $cpf): void
{
    session_regenerate_id(true);
    $_SESSION['usuario_id'] = $id;
    $_SESSION['cpf'] = $cpf;
    $_SESSION['tentativas'] = 0;
    unset($_SESSION['bloqueado_ate']);
}

function limitarTentativas(): void
{
    $ate = (int) ($_SESSION['bloqueado_ate'] ?? 0);
    if ($ate > time()) {
        erro(429, 'Muitas tentativas. Espere um instante e tente de novo.');
    }
    if ($ate > 0 && $ate <= time()) {
        $_SESSION['tentativas'] = 0;
        unset($_SESSION['bloqueado_ate']);
    }
}

function registrarFalha(): void
{
    $tentativas = (int) ($_SESSION['tentativas'] ?? 0) + 1;
    $_SESSION['tentativas'] = $tentativas;
    if ($tentativas >= 8) {
        $_SESSION['bloqueado_ate'] = time() + 60;
        $_SESSION['tentativas'] = 0;
    }
}

try {
    $db = conectar();
    garantirUsuarios($db);
} catch (mysqli_sql_exception $e) {
    $mensagem = str_starts_with($e->getMessage(), 'Falta')
        ? 'Falta o arquivo de conexão do servidor.'
        : 'O banco não está disponível.';
    erro(503, $mensagem);
}

iniciarSessao();
$metodo = $_SERVER['REQUEST_METHOD'] ?? 'GET';

try {
    if ($metodo === 'GET') {
        responder(200, [
            'autenticado' => !empty($_SESSION['usuario_id']),
        ]);
    }

    if ($metodo === 'DELETE') {
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $params = session_get_cookie_params();
            setcookie(session_name(), '', [
                'expires' => time() - 42000,
                'path' => $params['path'],
                'domain' => $params['domain'],
                'secure' => $params['secure'],
                'httponly' => $params['httponly'],
                'samesite' => 'Lax',
            ]);
        }
        session_destroy();
        responder(204);
    }

    if ($metodo !== 'POST') {
        erro(405, 'Operação não permitida.');
    }

    $bruto = file_get_contents('php://input');
    $dados = json_decode($bruto === false ? '' : $bruto, true);
    if (!is_array($dados)) {
        erro(400, 'Os dados enviados não são válidos.');
    }

    $cpf = digitosCpf((string) ($dados['cpf'] ?? ''));
    $senha = (string) ($dados['senha'] ?? '');
    if (!cpfValido($cpf)) {
        erro(400, 'Informe um CPF válido.');
    }
    if (!senhaValida($senha)) {
        erro(400, 'A senha precisa ter entre 6 e 72 caracteres.');
    }

    limitarTentativas();
    $usuario = buscarPorCpf($db, $cpf);
    $hash = $usuario['senha_hash'] ?? '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi';
    $confere = password_verify($senha, $hash);
    if (!$usuario || !$confere) {
        registrarFalha();
        erro(401, 'CPF ou senha não conferem.');
    }

    abrirSessao((int) $usuario['id'], $usuario['cpf']);
    responder(200, ['autenticado' => true]);
} catch (mysqli_sql_exception $e) {
    erro(500, 'Não foi possível concluir o acesso.');
}
