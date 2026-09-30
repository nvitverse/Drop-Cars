<?php
/**
 * 404 Page - Route not found
 */
defined('DROP_CARS_SAFE') || die('Direct access not permitted');
http_response_code(404);
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="robots" content="noindex, follow">
    <title>404 - Route Not Found | Drop Cars</title>
    <style>
        body{font-family:system-ui;max-width:600px;margin:4rem auto;padding:2rem;text-align:center}
        h1{color:#1e3a5f;font-size:2rem}
        a{color:#2563eb}
    </style>
</head>
<body>
    <h1>404 - Route Not Found</h1>
    <p>Sorry, the route you're looking for doesn't exist or has been disabled.</p>
    <p><a href="/">Back to Home</a> | <a href="/#routes">View Popular Routes</a></p>
</body>
</html>
