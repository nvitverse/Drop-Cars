<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Scheduled Maintenance | Drop Cars</title>
<?php if (function_exists('dropcars_render_favicons')) { dropcars_render_favicons(); } ?>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700;800&display=swap" rel="stylesheet">
    <style>
        :root {
            --primary: #ffb703;
            --dark: #023047;
            --text: #333;
        }
        body {
            margin: 0;
            padding: 0;
            font-family: 'Inter', sans-serif;
            background: #f8f9fa;
            color: var(--dark)
            height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            text-align: center;
        }
        .container {
            max-width: 600px;
            padding: 2rem;
        }
        .icon {
            font-size: 4rem;
            margin-bottom: 1.5rem;
            animation: pulse 2s infinite;
        }
        h1 {
            font-size: 2.5rem;
            font-weight: 800;
            margin: 0 0 1rem 0;
            color: var(--dark);
        }
        p {
            font-size: 1.15rem;
            line-height: 1.6;
            color: #666;
            margin-bottom: 2rem;
        }
        .progress-bar {
            width: 100%;
            height: 10px;
            background: #eee;
            border-radius: 10px;
            overflow: hidden;
            margin-bottom: 2rem;
        }
        .progress-line {
            width: 45%;
            height: 100%;
            background: var(--primary);
            border-radius: 10px;
            animation: sliding 3s ease-in-out infinite;
        }
        .contact {
            font-size: 0.9rem;
            color: #999;
        }
        .admin-link {
            display: inline-block;
            margin-top: 3rem;
            font-size: 0.8rem;
            color: #ccc;
            text-decoration: none;
            transition: color 0.3s;
        }
        .admin-link:hover { color: var(--primary); }

        @keyframes pulse {
            0% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.1); opacity: 0.8; }
            100% { transform: scale(1); opacity: 1; }
        }
        @keyframes sliding {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(250%); }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="icon">🚧</div>
        <h1>Under Maintenance</h1>
        <p>We're fine-tuning our ride experience to serve you better. We'll be back online in just a few moments.</p>
        
        <div class="progress-bar">
            <div class="progress-line"></div>
        </div>

        <div class="contact">
            Need an urgent booking? Call us at <strong>+91 70929 59959</strong>
        </div>

        <a href="/admin" class="admin-link">Staff Login</a>
    </div>
</body>
</html>
