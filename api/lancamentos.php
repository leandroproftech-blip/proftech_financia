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
        : 'O banco não está disponível.';
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

function texto(string $valor): string
{
    $valor = trim(preg_replace('/\s+/u', ' ', $valor) ?? '');
    return $valor;
}

function idValido(string $id): bool
{
    return (bool) preg_match('/^[0-9a-zA-Z-]{8,36}$/', $id);
}

function dataValida(string $data): bool
{
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $data)) {
        return false;
    }
    [$ano, $mes, $dia] = array_map('intval', explode('-', $data));
    return checkdate($mes, $dia, $ano);
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

function validar(array $dados, bool $exigirId): array
{
    $id = isset($dados['id']) ? (string) $dados['id'] : '';
    if ($exigirId || $id !== '') {
        if (!idValido($id)) {
            erro(400, 'Identificador do lançamento inválido.');
        }
    } else {
        $id = novoId();
    }

    $tipo = $dados['tipo'] ?? '';
    if ($tipo !== 'entrada' && $tipo !== 'saida') {
        erro(400, 'Escolha entrada ou saída.');
    }

    $descricao = texto((string) ($dados['descricao'] ?? ''));
    if ($descricao === '' || mb_strlen($descricao) > 80) {
        erro(400, 'A descrição precisa ter entre 1 e 80 caracteres.');
    }

    $centavos = $dados['centavos'] ?? null;
    if (!is_int($centavos) && !(is_string($centavos) && preg_match('/^\d+$/', $centavos))) {
        erro(400, 'Informe um valor maior que zero.');
    }
    $centavos = (int) $centavos;
    if ($centavos < 1 || $centavos > 9999999999) {
        erro(400, 'Informe um valor maior que zero.');
    }

    $data = (string) ($dados['data'] ?? '');
    if (!dataValida($data)) {
        erro(400, 'Informe uma data válida.');
    }

    $criadoEm = (string) ($dados['criadoEm'] ?? '');
    if ($criadoEm !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/', $criadoEm)) {
        $criadoEm = '';
    }

    $situacao = null;
    $modalidade = null;
    if ($tipo === 'entrada') {
        $situacao = ($dados['situacao'] ?? 'recebido') === 'a_receber' ? 'a_receber' : 'recebido';
        $modalidade = ($dados['modalidade'] ?? 'avulsa') === 'recorrente' ? 'recorrente' : 'avulsa';
    }

    return [
        'id' => $id,
        'tipo' => $tipo,
        'descricao' => $descricao,
        'centavos' => $centavos,
        'data' => $data,
        'situacao' => $situacao,
        'modalidade' => $modalidade,
        'criadoEm' => $criadoEm,
    ];
}

function comoItem(array $linha, array $pagamentos): array
{
    $criado = str_replace(' ', 'T', $linha['criado_em']);
    $entrada = $linha['tipo'] === 'entrada';
    return [
        'id' => $linha['id'],
        'tipo' => $linha['tipo'],
        'descricao' => $linha['descricao'],
        'centavos' => (int) $linha['centavos'],
        'data' => $linha['data'],
        'situacao' => $entrada ? ($linha['situacao'] === 'a_receber' ? 'a_receber' : 'recebido') : null,
        'modalidade' => $entrada ? ($linha['modalidade'] === 'recorrente' ? 'recorrente' : 'avulsa') : null,
        'pagamentos' => $pagamentos[$linha['id']] ?? [],
        'criadoEm' => $criado,
    ];
}

function mapaPagamentos(mysqli $db): array
{
    $mapa = [];
    $resultado = $db->query('SELECT lancamento_id, competencia FROM recebimentos ORDER BY competencia');
    while ($linha = $resultado->fetch_assoc()) {
        $mapa[$linha['lancamento_id']][] = $linha['competencia'];
    }
    return $mapa;
}

const COLUNAS = 'id, tipo, descricao, centavos, DATE_FORMAT(data, "%Y-%m-%d") AS data, situacao, modalidade, DATE_FORMAT(criado_em, "%Y-%m-%dT%H:%i:%s") AS criado_em';

function sincronizarRecebimento(mysqli $db, string $id, array $item): void
{
    if ($item['tipo'] !== 'entrada' || $item['modalidade'] !== 'recorrente') {
        $apaga = $db->prepare('DELETE FROM recebimentos WHERE lancamento_id = ?');
        $apaga->bind_param('s', $id);
        $apaga->execute();
        $apaga->close();
        return;
    }

    $competencia = substr($item['data'], 0, 7);
    if ($item['situacao'] === 'recebido') {
        $insere = $db->prepare('INSERT IGNORE INTO recebimentos (lancamento_id, competencia) VALUES (?, ?)');
        $insere->bind_param('ss', $id, $competencia);
        $insere->execute();
        $insere->close();
        return;
    }

    $apaga = $db->prepare('DELETE FROM recebimentos WHERE lancamento_id = ? AND competencia = ?');
    $apaga->bind_param('ss', $id, $competencia);
    $apaga->execute();
    $apaga->close();
}

function buscar(mysqli $db, string $id): ?array
{
    $consulta = $db->prepare('SELECT ' . COLUNAS . ' FROM lancamentos WHERE id = ?');
    $consulta->bind_param('s', $id);
    $consulta->execute();
    $linha = $consulta->get_result()->fetch_assoc();
    $consulta->close();
    return $linha ? comoItem($linha, mapaPagamentos($db)) : null;
}

function competenciaValida(string $competencia): bool
{
    if (!preg_match('/^\d{4}-\d{2}$/', $competencia)) {
        return false;
    }
    [$ano, $mes] = array_map('intval', explode('-', $competencia));
    return $mes >= 1 && $mes <= 12 && $ano >= 1900;
}

function tratarRecebimento(mysqli $db, string $metodo): void
{
    if ($metodo === 'POST') {
        $dados = lerJson();
        $id = (string) ($dados['id'] ?? '');
        $competencia = (string) ($dados['competencia'] ?? '');
        if (!idValido($id) || !competenciaValida($competencia)) {
            erro(400, 'Não foi possível marcar o recebimento.');
        }
        $item = buscar($db, $id);
        if (!$item || $item['tipo'] !== 'entrada' || $item['modalidade'] !== 'recorrente') {
            erro(404, 'Essa cobrança recorrente não está mais na lista.');
        }
        $insere = $db->prepare('INSERT IGNORE INTO recebimentos (lancamento_id, competencia) VALUES (?, ?)');
        $insere->bind_param('ss', $id, $competencia);
        $insere->execute();
        $insere->close();
        responder(200, buscar($db, $id));
    }

    if ($metodo === 'DELETE') {
        $id = (string) ($_GET['id'] ?? '');
        $competencia = (string) ($_GET['competencia'] ?? '');
        if (!idValido($id) || !competenciaValida($competencia)) {
            erro(400, 'Não foi possível desfazer o recebimento.');
        }
        $apaga = $db->prepare('DELETE FROM recebimentos WHERE lancamento_id = ? AND competencia = ?');
        $apaga->bind_param('ss', $id, $competencia);
        $apaga->execute();
        $apagou = $apaga->affected_rows > 0;
        $apaga->close();
        if (!$apagou) {
            erro(404, 'Esse recebimento não está mais marcado.');
        }
        responder(204);
    }

    erro(405, 'Operação não permitida.');
}

$metodo = $_SERVER['REQUEST_METHOD'] ?? 'GET';

try {
    if (($_GET['acao'] ?? '') === 'receber') {
        tratarRecebimento($db, $metodo);
    }

    if ($metodo === 'GET') {
        $pagamentos = mapaPagamentos($db);
        $resultado = $db->query('SELECT ' . COLUNAS . ' FROM lancamentos ORDER BY data DESC, criado_em DESC');
        $itens = [];
        while ($linha = $resultado->fetch_assoc()) {
            $itens[] = comoItem($linha, $pagamentos);
        }
        responder(200, $itens);
    }

    if ($metodo === 'POST') {
        $item = validar(lerJson(), false);
        $existente = buscar($db, $item['id']);
        if ($existente) {
            erro(409, 'Esse lançamento já está no banco.');
        }
        $criado = $item['criadoEm'] !== ''
            ? str_replace('T', ' ', substr($item['criadoEm'], 0, 19))
            : date('Y-m-d H:i:s');
        $insere = $db->prepare(
            'INSERT INTO lancamentos (id, tipo, descricao, centavos, data, situacao, modalidade, criado_em) VALUES (?, ?, ?, ?, ?, NULLIF(?, \'\'), NULLIF(?, \'\'), ?)'
        );
        $centavos = (string) $item['centavos'];
        $situacao = (string) ($item['situacao'] ?? '');
        $modalidade = (string) ($item['modalidade'] ?? '');
        $insere->bind_param(
            'ssssssss',
            $item['id'],
            $item['tipo'],
            $item['descricao'],
            $centavos,
            $item['data'],
            $situacao,
            $modalidade,
            $criado
        );
        $insere->execute();
        $insere->close();
        sincronizarRecebimento($db, $item['id'], $item);
        responder(201, buscar($db, $item['id']));
    }

    if ($metodo === 'PUT') {
        $id = (string) ($_GET['id'] ?? '');
        if (!idValido($id)) {
            erro(400, 'Identificador do lançamento inválido.');
        }
        $item = validar(lerJson(), false);
        if (!buscar($db, $id)) {
            erro(404, 'Esse lançamento não está mais na lista.');
        }
        $atualiza = $db->prepare(
            'UPDATE lancamentos SET tipo = ?, descricao = ?, centavos = ?, data = ?, situacao = NULLIF(?, \'\'), modalidade = NULLIF(?, \'\') WHERE id = ?'
        );
        $centavos = (string) $item['centavos'];
        $situacao = (string) ($item['situacao'] ?? '');
        $modalidade = (string) ($item['modalidade'] ?? '');
        $atualiza->bind_param(
            'sssssss',
            $item['tipo'],
            $item['descricao'],
            $centavos,
            $item['data'],
            $situacao,
            $modalidade,
            $id
        );
        $atualiza->execute();
        $atualiza->close();
        sincronizarRecebimento($db, $id, $item);
        responder(200, buscar($db, $id));
    }

    if ($metodo === 'DELETE') {
        $id = (string) ($_GET['id'] ?? '');
        if (!idValido($id)) {
            erro(400, 'Identificador do lançamento inválido.');
        }
        $apagaPagamentos = $db->prepare('DELETE FROM recebimentos WHERE lancamento_id = ?');
        $apagaPagamentos->bind_param('s', $id);
        $apagaPagamentos->execute();
        $apagaPagamentos->close();
        $apaga = $db->prepare('DELETE FROM lancamentos WHERE id = ?');
        $apaga->bind_param('s', $id);
        $apaga->execute();
        $apagou = $apaga->affected_rows > 0;
        $apaga->close();
        if (!$apagou) {
            erro(404, 'Esse lançamento não está mais na lista.');
        }
        responder(204);
    }

    erro(405, 'Operação não permitida.');
} catch (mysqli_sql_exception $e) {
    erro(500, 'Não foi possível gravar no banco.');
}
