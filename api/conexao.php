<?php

mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

function conectar(): mysqli
{
    $mysqli = new mysqli('127.0.0.1', 'root', '', 'proftech_caixa', 3306);
    $mysqli->set_charset('utf8mb4');
    return $mysqli;
}
