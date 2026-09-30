<?php
require_once __DIR__ . '/../includes/paths.php';
session_start();
session_unset();
session_destroy();
$home = function_exists('dropcars_url') ? dropcars_url('/') : '/';
header('Location: ' . $home);
exit;
