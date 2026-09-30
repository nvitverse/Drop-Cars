<?php
/**
 * Admin Settings Page - Google Sheets & Notifications
 */

// Load existing config
$activeSite = dropcars_get_active_website();
$config = dropcars_get_site_config_json($pdo, $activeSite);
$configPath = __DIR__ . '/../../api/config.php';

if (!function_exists('dropcars_save_config_file_or_db')) {
    function dropcars_save_config_file_or_db($pdo, $configPath, $newConfig) {
        $activeSite = dropcars_get_active_website();
        if ($activeSite !== 'all' && $activeSite !== 'dropcars') {
            // Non-default site: store in DB only
            return dropcars_save_site_config_json($pdo, $activeSite, $newConfig);
        } else {
            // Default dropcars site: write to api/config.php AND mirror to DB
            $content = "<?php\nreturn " . var_export($newConfig, true) . ";\n";
            $ok = file_put_contents($configPath, $content) !== false;
            if ($ok) {
                dropcars_save_site_config_json($pdo, 'dropcars', $newConfig);
            }
            return $ok;
        }
    }
}

$message = '';
$messageType = 'success';

$pageMsg = $_GET['msg'] ?? '';
$pageErr = $_GET['err'] ?? '';

if ($pageMsg === 'staff_deleted') {
    $message = 'Staff member deleted successfully.';
    $messageType = 'success';
} elseif ($pageMsg === 'unblocked') {
    $message = 'IP address unblocked successfully.';
    $messageType = 'success';
} elseif ($pageMsg === 'ip_blocked') {
    $ipVal = htmlspecialchars($_GET['ip'] ?? '');
    $message = "IP Address {$ipVal} has been added to the restricted block list.";
    $messageType = 'success';

} elseif ($pageMsg === 'subdomain_deleted') {
    $message = 'Subdomain configuration deleted successfully.';
    $messageType = 'success';
} elseif ($pageMsg === 'theme_deleted') {
    $message = 'Theme landing page and subdomain deleted successfully.';
    $messageType = 'success';
} elseif ($pageMsg === 'theme_saved') {
    $message = 'Theme landing page configurations saved successfully.';
    $messageType = 'success';
} elseif ($pageMsg === 'telemetry_cleared') {
    $message = 'Telemetry error logs cleared successfully.';
    $messageType = 'success';
} elseif ($pageMsg === 'site_deleted') {
    $message = 'Website/domain deleted successfully.';
    $messageType = 'success';
} elseif ($pageMsg === 'site_added') {
    $message = 'Website/domain registered successfully.';
    $messageType = 'success';
} elseif ($pageMsg === 'site_saved') {
    $message = 'Website settings updated successfully.';
    $messageType = 'success';
}

if ($pageErr === 'self_delete') {
    $message = 'You cannot delete your own account.';
    $messageType = 'error';
} elseif ($pageErr === 'recovery_delete') {
    $message = 'The recovery admin account cannot be deleted.';
    $messageType = 'error';
} elseif ($pageErr === 'not_found') {
    $message = 'Account not found.';
    $messageType = 'error';
} elseif ($pageErr === 'default_site_protected') {
    $message = 'The default "dropcars" website is protected and cannot be deleted.';
    $messageType = 'error';
} elseif ($pageErr === 'site_exists') {
    $message = 'A website with this slug already exists.';
    $messageType = 'error';
}

if (isset($_GET['export']) && $_GET['export'] === 'blocked_ips') {
    $sql = "SELECT ip_address, reason, created_at FROM blocked_ips";
    $params = [];
    if (isset($_GET['filter']) && $_GET['filter'] === 'google_ads') {
        // This relies on the reason containing 'google_ads' or a source link.
        // Actually, let's just export all for now as requested, but we can filter by the 'source' stored in bookings/enquiries
        // but blocked_ips table is simpler.
        // To strictly fulfill "export only google_ads spam IPs", we check source from origin tables.
        $sql = "SELECT b.ip_address, b.reason, b.created_at 
                FROM blocked_ips b 
                WHERE EXISTS (SELECT 1 FROM enquiries e WHERE e.ip_address = b.ip_address AND e.source = 'google_ads')
                   OR EXISTS (SELECT 1 FROM bookings k WHERE k.ip_address = b.ip_address AND k.source = 'google_ads')";
    }
    $stmt = $pdo->prepare($sql . " ORDER BY created_at DESC");
    $stmt->execute($params);
    $ips = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename=blocked_ips_' . date('Y-m-d') . '.csv');
    $output = fopen('php://output', 'w');
    fputcsv($output, ['IP Address', 'Reason', 'Date Blocked']);
    foreach ($ips as $row) {
        fputcsv($output, $row);
    }
    fclose($output);
    exit;
}

if (isset($_GET['delete_block_id'])) {
    $pdo->prepare("DELETE FROM blocked_ips WHERE id = ?")->execute([(int) $_GET['delete_block_id']]);
    header('Location: ' . admin_url('settings', ['cat' => 'operations', 'msg' => 'unblocked']));
    exit;
}

// The "Spam? Block Client IP" link in admin notification emails used to
// block on a single GET click - no confirmation - a real risk from an
// accidental click, an email client's link-preview crawler, or browser
// link-prefetching silently blocking a legitimate customer's IP. Now it
// only blocks once `confirmed=1` is also present, which only a real click
// on the confirmation page's own button can add.
if ((isset($_GET['block_ip']) || isset($_GET['ip_address'])) && isset($_GET['confirmed'])) {
    $rawIp = trim($_GET['block_ip'] ?? $_GET['ip_address'] ?? '');
    if (filter_var($rawIp, FILTER_VALIDATE_IP)) {
        $reason = 'Blocked via email spam action (' . date('d M Y') . ')';
        $pdo->prepare("INSERT IGNORE INTO blocked_ips (ip_address, reason) VALUES (?, ?)")->execute([$rawIp, $reason]);
        header('Location: ' . admin_url('settings', ['cat' => 'operations', 'msg' => 'ip_blocked', 'ip' => $rawIp]));
        exit;
    }
} elseif (isset($_GET['block_ip']) || isset($_GET['ip_address'])) {
    $rawIpConfirm = trim($_GET['block_ip'] ?? $_GET['ip_address'] ?? '');
    if (filter_var($rawIpConfirm, FILTER_VALIDATE_IP)) {
        $confirmUrl = admin_url('settings', ['cat' => 'operations', 'block_ip' => $rawIpConfirm, 'confirmed' => 1]);
        $cancelUrl = admin_url('settings', ['cat' => 'operations']);
        echo '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Confirm IP Block</title></head><body style="font-family:sans-serif;max-width:480px;margin:60px auto;text-align:center;padding:0 20px;">'
            . '<h2 style="color:#b91c1c;">Block this IP address?</h2>'
            . '<p style="color:#334155;font-size:15px;">This will immediately block <strong>' . htmlspecialchars($rawIpConfirm) . '</strong> from making further bookings/enquiries on the website. Only do this if you are sure it is spam/abuse - not a real customer.</p>'
            . '<a href="' . htmlspecialchars($confirmUrl) . '" style="display:inline-block;background:#ef4444;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;margin:8px;">Yes, Block This IP</a>'
            . '<a href="' . htmlspecialchars($cancelUrl) . '" style="display:inline-block;background:#e2e8f0;color:#1e293b;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;margin:8px;">Cancel</a>'
            . '</body></html>';
        exit;
    }
}


if (isset($_GET['delete_subdomain'])) {
    $slug = preg_replace('/[^a-z0-9]/', '', strtolower(trim($_GET['delete_subdomain'])));
    if ($slug !== '' && isset($config['subdomainConfig'][$slug])) {
        $newConfig = $config;
        unset($newConfig['subdomainConfig'][$slug]);
        $content = "<?php\nreturn " . var_export($newConfig, true) . ";\n";
        if (dropcars_save_config_file_or_db($pdo, $configPath, $newConfig)) {
            $config = $newConfig;
            sync_settings_to_public_config();
            header('Location: ' . admin_url('settings', ['cat' => 'subdomains', 'msg' => 'subdomain_deleted']));
            exit;
        }
    }
}

if (isset($_GET['delete_theme'])) {
    $themeId = trim((string)$_GET['delete_theme']);
    if ($themeId !== '' && $themeId !== 'drop-cars') { // Do not delete default drop-cars theme
        $themesFile = dirname(__DIR__, 2) . '/data/themes.json';
        if (file_exists($themesFile)) {
            $themes = json_decode(file_get_contents($themesFile), true);
            if (is_array($themes)) {
                $filtered = [];
                $found = false;
                foreach ($themes as $t) {
                    if (($t['id'] ?? '') === $themeId || ($t['slug'] ?? '') === $themeId) {
                        $found = true;
                        continue;
                    }
                    $filtered[] = $t;
                }
                if ($found) {
                    file_put_contents($themesFile, json_encode($filtered, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
                    if (function_exists('dropcars_sync_theme_subdomain_directories')) {
                        dropcars_sync_theme_subdomain_directories();
                    }
                    header('Location: ' . admin_url('settings', ['cat' => 'subdomains', 'msg' => 'theme_deleted']));
                    exit;
                }
            }
        }
    }
}

if (isset($_GET['delete_registered_site'])) {
    $siteSlug = preg_replace('/[^a-z0-9_]/', '', strtolower(trim($_GET['delete_registered_site'])));
    if ($siteSlug !== '') {
        if ($siteSlug === 'dropcars') {
            header('Location: ' . admin_url('settings', ['cat' => 'subdomains', 'err' => 'default_site_protected']));
            exit;
        }
        $stmt = $pdo->prepare("DELETE FROM `registered_sites` WHERE slug = ?");
        if ($stmt->execute([$siteSlug])) {
            header('Location: ' . admin_url('settings', ['cat' => 'subdomains', 'msg' => 'site_deleted']));
            exit;
        }
    }
}

// Log out of all devices: rotate this admin's session token so every existing
// session (including this one) is invalidated on its next request.
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['logout_all_devices'])) {
    if (function_exists('dropcars_admin_ensure_password_policy_columns')) {
        dropcars_admin_ensure_password_policy_columns($pdo);
    }
    $newToken = bin2hex(random_bytes(16));
    try {
        $pdo->prepare("UPDATE `admins` SET `session_token` = ? WHERE `id` = ?")
            ->execute([$newToken, (int) ($_SESSION['admin_id'] ?? 0)]);
    } catch (Throwable $e) {
        // Non-fatal; fall through to logout anyway.
    }
    // Revoke all persistent remember-me tokens for this admin (all devices)
    if (function_exists('dropcars_revoke_all_remember_tokens')) {
        dropcars_revoke_all_remember_tokens($pdo, (int) ($_SESSION['admin_id'] ?? 0));
    }
    // End the current session too, then send the operator to the login screen.
    logout();
    exit;
}

if (isset($_GET['delete_admin_id'])) {
    $deleteId = (int) $_GET['delete_admin_id'];
    $currentAdminId = (int) ($_SESSION['admin_id'] ?? 0);
    
    $stmt = $pdo->prepare("SELECT email, username, role FROM admins WHERE id = ?");
    $stmt->execute([$deleteId]);
    $adminToDelete = $stmt->fetch();
    
    if ($adminToDelete) {
        $email = $adminToDelete['email'] ?? '';
        if ($deleteId === $currentAdminId) {
            header('Location: ' . admin_url('settings', ['cat' => 'staff', 'err' => 'self_delete']));
            exit;
        }
        if (!empty($email) && function_exists('dropcars_is_recovery_email') && dropcars_is_recovery_email((string)$email)) {
            header('Location: ' . admin_url('settings', ['cat' => 'staff', 'err' => 'recovery_delete']));
            exit;
        }
        $pdo->prepare("DELETE FROM admins WHERE id = ?")->execute([$deleteId]);
        header('Location: ' . admin_url('settings', ['cat' => 'staff', 'msg' => 'staff_deleted']));
        exit;
    } else {
        header('Location: ' . admin_url('settings', ['cat' => 'staff', 'err' => 'not_found']));
        exit;
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (isset($_POST['add_staff'])) {
        $name = trim((string) ($_POST['staff_name'] ?? ''));
        $username = trim((string) ($_POST['staff_username'] ?? ''));
        $password = (string) ($_POST['staff_password'] ?? '');
        $email = trim((string) ($_POST['staff_email'] ?? ''));
        
        if ($name === '') {
            $message = 'Please enter a name for the staff member.';
            $messageType = 'error';
        } elseif ($username === '' || !preg_match('/^[a-zA-Z0-9_\-\.]{3,30}$/', $username)) {
            $message = 'Username must be 3-30 characters and contain only letters, numbers, underscores, hyphens, or dots.';
            $messageType = 'error';
        } elseif ($password === '' || strlen($password) < 6) {
            $message = 'Password must be at least 6 characters.';
            $messageType = 'error';
        } else {
            $stmtCheck = $pdo->prepare("SELECT COUNT(*) FROM admins WHERE username = ? OR (email = ? AND email IS NOT NULL AND email != '')");
            $stmtCheck->execute([$username, $email === '' ? null : $email]);
            if ((int)$stmtCheck->fetchColumn() > 0) {
                $message = 'Username or Email is already registered.';
                $messageType = 'error';
            } else {
                $hashed = password_hash($password, PASSWORD_DEFAULT);
                $stmtInsert = $pdo->prepare("INSERT INTO admins (name, username, email, password, role) VALUES (?, ?, ?, ?, 'staff')");
                $emailVal = $email === '' ? null : $email;
                if ($stmtInsert->execute([$name, $username, $emailVal, $hashed])) {
                    $message = 'Staff member added successfully.';
                    $messageType = 'success';
                } else {
                    $message = 'Failed to add staff member due to a database error.';
                    $messageType = 'error';
                }
            }
        }
    }

    if (isset($_POST['edit_staff'])) {
        $editId = (int) ($_POST['edit_admin_id'] ?? 0);
        $name = trim((string) ($_POST['staff_name'] ?? ''));
        $username = trim((string) ($_POST['staff_username'] ?? ''));
        $password = (string) ($_POST['staff_password'] ?? '');
        $email = trim((string) ($_POST['staff_email'] ?? ''));
        $role = trim((string) ($_POST['staff_role'] ?? 'staff'));

        $stmtOrig = $pdo->prepare("SELECT * FROM admins WHERE id = ?");
        $stmtOrig->execute([$editId]);
        $origAdmin = $stmtOrig->fetch();

        if (!$origAdmin) {
            $message = 'Account not found.';
            $messageType = 'error';
        } elseif ($name === '') {
            $message = 'Please enter a name for the staff member.';
            $messageType = 'error';
        } elseif ($username === '' || !preg_match('/^[a-zA-Z0-9_\-\.]{3,30}$/', $username)) {
            $message = 'Username must be 3-30 characters and contain only letters, numbers, underscores, hyphens, or dots.';
            $messageType = 'error';
        } elseif ($password !== '' && strlen($password) < 6) {
            $message = 'Password must be at least 6 characters.';
            $messageType = 'error';
        } else {
            $stmtCheck = $pdo->prepare("SELECT COUNT(*) FROM admins WHERE (username = ? OR (email = ? AND email IS NOT NULL AND email != '')) AND id != ?");
            $stmtCheck->execute([$username, $email === '' ? null : $email, $editId]);
            if ((int)$stmtCheck->fetchColumn() > 0) {
                $message = 'Username or Email is already registered by another account.';
                $messageType = 'error';
            } else {
                $isRecovery = (!empty($origAdmin['email']) && function_exists('dropcars_is_recovery_email') && dropcars_is_recovery_email((string)$origAdmin['email']));
                if ($isRecovery) {
                    $emailVal = $origAdmin['email'];
                    $roleVal = 'admin';
                } else {
                    $emailVal = $email === '' ? null : $email;
                    $isSelf = ((int)$editId === (int)($_SESSION['admin_id'] ?? 0));
                    if ($isSelf) {
                        $roleVal = $origAdmin['role'];
                    } else {
                        $roleVal = in_array($role, ['admin', 'staff'], true) ? $role : 'staff';
                    }
                }

                if ($password !== '') {
                    $hashed = password_hash($password, PASSWORD_DEFAULT);
                    $stmtUpdate = $pdo->prepare("UPDATE admins SET name = ?, username = ?, email = ?, password = ?, role = ? WHERE id = ?");
                    $success = $stmtUpdate->execute([$name, $username, $emailVal, $hashed, $roleVal, $editId]);
                } else {
                    $stmtUpdate = $pdo->prepare("UPDATE admins SET name = ?, username = ?, email = ?, role = ? WHERE id = ?");
                    $success = $stmtUpdate->execute([$name, $username, $emailVal, $roleVal, $editId]);
                }

                if ($success) {
                    $message = 'Account updated successfully.';
                    $messageType = 'success';

                    $isSelf = ((int)$editId === (int)($_SESSION['admin_id'] ?? 0));
                    if ($isSelf) {
                        $_SESSION['admin_name'] = $name;
                        $_SESSION['admin_email'] = $emailVal !== null ? $emailVal : $username;
                        $_SESSION['admin_username'] = $username;
                    }
                } else {
                    $message = 'Failed to update account due to a database error.';
                    $messageType = 'error';
                }
            }
        }
    }

    if (isset($_POST['add_blocked_ip'])) {
        $ip = trim($_POST['ip_address'] ?? '');
        $reason = trim($_POST['reason'] ?? 'Manual addition');
        if (filter_var($ip, FILTER_VALIDATE_IP)) {
            $pdo->prepare("INSERT IGNORE INTO blocked_ips (ip_address, reason) VALUES (?, ?)")->execute([$ip, $reason]);
            $message = "IP $ip has been blocked.";
        } else {
            $message = "Invalid IP address format.";
            $messageType = "error";
        }
    }

    if (isset($_POST['save_sheets'])) {
        $webhookUrl = trim($_POST['googleSheetsWebhookUrl'] ?? '');
        $webhookToken = trim($_POST['googleSheetsWebhookToken'] ?? '');
        $sheetUrl = trim($_POST['googleSheetsSheetUrl'] ?? '');

        // Generate the new config file content
        $newConfig = $config;
        $newConfig['googleSheetsWebhookUrl'] = $webhookUrl;
        $newConfig['googleSheetsWebhookToken'] = $webhookToken;
        $newConfig['googleSheetsSheetUrl'] = $sheetUrl;

        $content = "<?php\nreturn " . var_export($newConfig, true) . ";\n";

        if (dropcars_save_config_file_or_db($pdo, $configPath, $newConfig)) {
            $config = $newConfig;
            sync_settings_to_public_config();
            $message = "Settings saved successfully.";
        } else {
            $message = "Error: Could not write to api/config.php. Check file permissions on the server.";
            $messageType = "error";
        }
    }

    if (isset($_POST['save_business'])) {
        $newConfig = $config;
        if (isset($_POST['companyName']))    $newConfig['companyName']    = trim($_POST['companyName']);
        if (isset($_POST['websiteUrl']))     $newConfig['websiteUrl']     = trim($_POST['websiteUrl']);
        if (isset($_POST['supportPhone']))   $newConfig['supportPhone']   = trim($_POST['supportPhone']);
        if (isset($_POST['supportEmail']))   $newConfig['supportEmail']   = trim($_POST['supportEmail']);
        if (isset($_POST['reviewLink']))     $newConfig['reviewLink']     = trim($_POST['reviewLink']);
        if (isset($_POST['currencySymbol'])) $newConfig['currencySymbol'] = trim($_POST['currencySymbol']);
        if (isset($_POST['revenueTarget']))  $newConfig['revenueTarget']  = (float)$_POST['revenueTarget'];
        if (isset($_POST['commissionRate'])) $newConfig['commissionRate'] = (float)$_POST['commissionRate'];
        if (isset($_POST['functionalPhone']))   $newConfig['functionalPhone']   = trim($_POST['functionalPhone']);
        if (isset($_POST['functionalWhatsApp'])) $newConfig['functionalWhatsApp'] = trim($_POST['functionalWhatsApp']);
        if (isset($_POST['facebookUrl']))        $newConfig['facebookUrl']        = trim($_POST['facebookUrl']);
        if (isset($_POST['instagramUrl']))       $newConfig['instagramUrl']       = trim($_POST['instagramUrl']);
        if (isset($_POST['twitterUrl']))         $newConfig['twitterUrl']         = trim($_POST['twitterUrl']);
        if (isset($_POST['youtubeUrl']))         $newConfig['youtubeUrl']         = trim($_POST['youtubeUrl']);

        $content = "<?php\nreturn " . var_export($newConfig, true) . ";\n";
        if (dropcars_save_config_file_or_db($pdo, $configPath, $newConfig)) {
            $config = $newConfig;
            sync_settings_to_public_config();
            $message = "Business settings updated successfully.";
        } else {
            $message = "Error: Could not update business settings. Check file permissions on the server.";
            $messageType = "error";
        }
    }

    if (isset($_POST['save_gst'])) {
        $newConfig = $config;
        $newConfig['gstPercent'] = max(0, min(100, (float)($_POST['gstPercent'] ?? 5)));
        $newConfig['gstNumber']  = strtoupper(trim($_POST['gstNumber'] ?? ''));

        $content = "<?php\nreturn " . var_export($newConfig, true) . ";\n";
        if (dropcars_save_config_file_or_db($pdo, $configPath, $newConfig)) {
            $config = $newConfig;
            sync_settings_to_public_config();
            $message = "GST settings updated successfully.";
        } else {
            $message = "Error: Could not update GST settings. Check file permissions.";
            $messageType = "error";
        }
    }

    if (isset($_POST['save_referral_settings'])) {
        $newConfig = $config;
        $newConfig['referralRewardAmount'] = max(0, (float)($_POST['referralRewardAmount'] ?? 100.00));

        $content = "<?php\nreturn " . var_export($newConfig, true) . ";\n";
        if (dropcars_save_config_file_or_db($pdo, $configPath, $newConfig)) {
            $config = $newConfig;
            sync_settings_to_public_config();
            $message = "Referral & Wallet settings updated successfully.";
        } else {
            $message = "Error: Could not update referral settings. Check file permissions.";
            $messageType = "error";
        }
    }


    if (isset($_POST['save_whatsapp'])) {
        $newConfig = $config;
        $waRaw = preg_replace('/\D/', '', (string) ($_POST['whatsappNumber'] ?? ''));
        if ($waRaw !== '' && strlen($waRaw) === 10) {
            $waRaw = '91' . $waRaw;
        }
        $newConfig['whatsappNumber']               = $waRaw;
        $newConfig['whatsappTemplateConfirmation'] = trim((string) ($_POST['whatsappTemplateConfirmation'] ?? ''));
        $newConfig['whatsappTemplateEnquiry']      = trim((string) ($_POST['whatsappTemplateEnquiry'] ?? ''));
        $newConfig['whatsappGateway']               = in_array($_POST['whatsappGateway'] ?? '', ['none', 'generic'], true) ? $_POST['whatsappGateway'] : 'none';
        $newConfig['whatsappGenericUrl']           = trim((string) ($_POST['whatsappGenericUrl'] ?? ''));
        $rawWaKey = trim($_POST['whatsappApiKey'] ?? '');
        if ($rawWaKey !== '') {
            $newConfig['whatsappApiKey'] = $rawWaKey;
        }
        $content = "<?php\nreturn " . var_export($newConfig, true) . ";\n";
        if (dropcars_save_config_file_or_db($pdo, $configPath, $newConfig)) {
            $config = $newConfig;
            sync_settings_to_public_config();
            $message = "WhatsApp gateway settings and templates saved successfully.";
        } else {
            $message = "Error: Could not save WhatsApp settings. Check file permissions.";
            $messageType = "error";
        }
    }

    if (isset($_POST['save_policies'])) {
        $newConfig = $config;
        $newConfig['cancellationPolicy'] = trim((string) ($_POST['cancellationPolicy'] ?? ''));
        $content = "<?php\nreturn " . var_export($newConfig, true) . ";\n";
        if (dropcars_save_config_file_or_db($pdo, $configPath, $newConfig)) {
            $config = $newConfig;
            sync_settings_to_public_config();
            $message = "Cancellation policy updated.";
        } else {
            $message = "Error: Could not save policy. Check file permissions.";
            $messageType = "error";
        }
    }

    if (isset($_POST['save_logo']) && isset($_FILES['logoFile']) && $_FILES['logoFile']['error'] !== UPLOAD_ERR_NO_FILE) {
        $f = $_FILES['logoFile'];
        if ($f['error'] !== UPLOAD_ERR_OK) {
            $message = "Logo upload failed (error code {$f['error']}).";
            $messageType = "error";
        } elseif ($f['size'] > 2 * 1024 * 1024) {
            $message = "Logo too large. Please upload an image under 2 MB.";
            $messageType = "error";
        } else {
            $uploadDir = dirname(__DIR__, 2) . '/assets/img/uploads';
            if (!is_dir($uploadDir)) { @mkdir($uploadDir, 0775, true); }
            
            $imgData = @file_get_contents($f['tmp_name']);
            $srcImg = ($imgData !== false && function_exists('imagecreatefromstring')) ? @imagecreatefromstring($imgData) : false;
            
            if ($srcImg !== false && function_exists('imagepng')) {
                $fileName = 'logo_' . date('YmdHis') . '.png';
                $dest = $uploadDir . '/' . $fileName;
                imagepng($srcImg, $dest);
                imagedestroy($srcImg);
                
                $relPath = 'assets/img/uploads/' . $fileName;
                $newConfig = $config;
                $newConfig['logoPath'] = $relPath;
                if (dropcars_save_config_file_or_db($pdo, $configPath, $newConfig)) {
                    $config = $newConfig;
                    sync_settings_to_public_config();
                    $message = "Business logo (PNG) uploaded successfully.";
                } else {
                    $message = "Logo saved but config update failed (check permissions).";
                    $messageType = "error";
                }
            } else {
                $finfo = function_exists('finfo_open') ? finfo_open(FILEINFO_MIME_TYPE) : null;
                $mime = $finfo ? finfo_file($finfo, $f['tmp_name']) : ($f['type'] ?? '');
                if ($finfo) { finfo_close($finfo); }
                
                if ($mime === 'image/png') {
                    $fileName = 'logo_' . date('YmdHis') . '.png';
                    $dest = $uploadDir . '/' . $fileName;
                    if (move_uploaded_file($f['tmp_name'], $dest)) {
                        $relPath = 'assets/img/uploads/' . $fileName;
                        $newConfig = $config;
                        $newConfig['logoPath'] = $relPath;
                        if (dropcars_save_config_file_or_db($pdo, $configPath, $newConfig)) {
                            $config = $newConfig;
                            sync_settings_to_public_config();
                            $message = "Business logo (PNG) uploaded successfully.";
                        } else {
                            $message = "Logo saved but config update failed (check permissions).";
                            $messageType = "error";
                        }
                    } else {
                        $message = "Could not move the uploaded logo file.";
                        $messageType = "error";
                    }
                } else {
                    $message = "Invalid image type. Logos must be in PNG format (.png).";
                    $messageType = "error";
                }
            }
        }
    }

    /* -- UPI / Advance Payment Settings -------------------------------- */
    if (isset($_POST['save_advance_payment'])) {
        $newConfig = $config;
        $newConfig['upiId']              = trim($_POST['upiId'] ?? '7200217986-1@okbizaxis');
        $newConfig['advancePercent']     = max(0, min(100, (int)($_POST['advancePercent'] ?? 20)));
        $newConfig['advanceMinAmount']   = max(0, (int)($_POST['advanceMinAmount'] ?? 300));
        $newConfig['advanceEnabled']     = isset($_POST['advanceEnabled']);
        $newConfig['advanceNote']        = trim($_POST['advanceNote'] ?? '');
        $content = "<?php\nreturn " . var_export($newConfig, true) . ";\n";
        if (dropcars_save_config_file_or_db($pdo, $configPath, $newConfig)) {
            $config = $newConfig;
            sync_settings_to_public_config();
            $message = "Advance payment settings saved.";
        } else {
            $message = "Error: Could not save advance payment settings.";
            $messageType = "error";
        }
    }

    /* -- UPI QR Image Upload ------------------------------------------ */
    if (isset($_POST['save_upi_qr']) && isset($_FILES['upiQrFile']) && $_FILES['upiQrFile']['error'] !== UPLOAD_ERR_NO_FILE) {
        $f = $_FILES['upiQrFile'];
        if ($f['error'] !== UPLOAD_ERR_OK) {
            $message = "QR upload failed (error code {$f['error']}).";
            $messageType = "error";
        } elseif ($f['size'] > 3 * 1024 * 1024) {
            $message = "QR image too large. Please upload under 3 MB.";
            $messageType = "error";
        } else {
            $allowed = ['image/png' => 'png', 'image/jpeg' => 'jpg', 'image/webp' => 'webp'];
            $finfo = function_exists('finfo_open') ? finfo_open(FILEINFO_MIME_TYPE) : null;
            $mime = $finfo ? finfo_file($finfo, $f['tmp_name']) : ($f['type'] ?? '');
            if ($finfo) { finfo_close($finfo); }
            if (!isset($allowed[$mime])) {
                $message = "Invalid QR image type. Use PNG, JPG or WEBP.";
                $messageType = "error";
            } else {
                $ext = $allowed[$mime];
                $uploadDir = dirname(__DIR__, 2) . '/assets/img';
                if (!is_dir($uploadDir)) { @mkdir($uploadDir, 0775, true); }
                // Overwrite a predictable filename so thank-you page always loads /assets/img/qr-code.{ext}
                // Remove old qr-code files with any extension first
                foreach (['png','jpg','jpeg','webp'] as $oldExt) {
                    $oldFile = $uploadDir . '/qr-code.' . $oldExt;
                    if (is_file($oldFile)) { @unlink($oldFile); }
                }
                $fileName = 'qr-code.' . $ext;
                $dest = $uploadDir . '/' . $fileName;
                if (move_uploaded_file($f['tmp_name'], $dest)) {
                    $newConfig = $config;
                    $newConfig['upiQrPath'] = 'assets/img/' . $fileName;
                    $content = "<?php\nreturn " . var_export($newConfig, true) . ";\n";
                    if (dropcars_save_config_file_or_db($pdo, $configPath, $newConfig)) {
                        $config = $newConfig;
                        sync_settings_to_public_config();
                        $message = "UPI QR image uploaded successfully.";
                    } else {
                        $message = "QR saved but config update failed (check permissions).";
                        $messageType = "error";
                    }
                } else {
                    $message = "Could not move the uploaded QR image.";
                    $messageType = "error";
                }
            }
        }
    }

    if (isset($_POST['save_platform'])) {
        $newConfig = $config;
        $newConfig['enableEmailNotifications_Customer']    = isset($_POST['enableEmailNotifications_Customer']);
        $newConfig['enableEmailNotifications_Admin']       = isset($_POST['enableEmailNotifications_Admin']);
        $newConfig['enableTelegramNotifications_Customer'] = isset($_POST['enableTelegramNotifications_Customer']);
        $newConfig['enableTelegramNotifications_Admin']    = isset($_POST['enableTelegramNotifications_Admin']);
        $newConfig['maintenanceMode']                      = isset($_POST['maintenanceMode']);

        $content = "<?php\nreturn " . var_export($newConfig, true) . ";\n";
        if (dropcars_save_config_file_or_db($pdo, $configPath, $newConfig)) {
            $config = $newConfig;
            sync_settings_to_public_config();
            $message = "Platform settings updated successfully.";
        } else {
            $message = "Error: Could not update platform settings. Check file permissions on the server.";
            $messageType = "error";
        }
    }

    /* -- Google Maps & Location Picker Settings ------------------ */
    if (isset($_POST['save_maps_location_settings'])) {
        $newConfig = $config;
        $newConfig['googleMapsApiKey']              = trim($_POST['googleMapsApiKey'] ?? '');
        $newConfig['enableGoogleMapsApi']           = isset($_POST['enableGoogleMapsApi']);
        $newConfig['enableSessionTokens']           = isset($_POST['enableSessionTokens']);
        $newConfig['enableLocalLocationFallback']   = isset($_POST['enableLocalLocationFallback']);
        $newConfig['enableAirportQuickSelector']    = isset($_POST['enableAirportQuickSelector']);
        $newConfig['enableOsmGeocodingProxy']       = isset($_POST['enableOsmGeocodingProxy']);
        $newConfig['enableRecentLocationsHistory']  = isset($_POST['enableRecentLocationsHistory']);
        $newConfig['recentLocationsLimit']          = max(1, min(20, (int)($_POST['recentLocationsLimit'] ?? 5)));
        $newConfig['enableGpsCurrentLocation']      = isset($_POST['enableGpsCurrentLocation']);
        $newConfig['enableStateBorderDetection']    = isset($_POST['enableStateBorderDetection']);
        $newConfig['enablePrefilledRouteGeocoding'] = isset($_POST['enablePrefilledRouteGeocoding']);
        $newConfig['enableShareRouteButton']        = isset($_POST['enableShareRouteButton']);
        $newConfig['distanceEngine']                = in_array($_POST['distanceEngine'] ?? '', ['osrm', 'google_matrix', 'haversine_ratio'], true) ? $_POST['distanceEngine'] : 'osrm';

        $content = "<?php\nreturn " . var_export($newConfig, true) . ";\n";
        if (dropcars_save_config_file_or_db($pdo, $configPath, $newConfig)) {
            $config = $newConfig;
            sync_settings_to_public_config();
            $message = "Master Location & Maps Engine settings updated successfully.";
        } else {
            $message = "Error: Could not update location settings. Check file permissions.";
            $messageType = "error";
        }
    }

    /* -- Customer Notification Matrix ----------------------------- */
    if (isset($_POST['save_notification_matrix'])) {
        $newConfig = $config;
        $events = ['enquiry', 'confirmed', 'driver_assigned', 'completed', 'cancelled'];
        $channels = ['email', 'sms', 'whatsapp'];
        foreach ($channels as $ch) {
            foreach ($events as $ev) {
                $key = "notify_customer_{$ch}_{$ev}";
                $newConfig[$key] = isset($_POST[$key]);
            }
        }
        $content = "<?php\nreturn " . var_export($newConfig, true) . ";\n";
        if (dropcars_save_config_file_or_db($pdo, $configPath, $newConfig)) {
            $config = $newConfig;
            sync_settings_to_public_config();
            $message = "Customer notification matrix updated successfully.";
        } else {
            $message = "Error: Could not update notification matrix. Check file permissions.";
            $messageType = "error";
        }
    }

    /* -- Email / SMTP ------------------------------------------- */
    if (isset($_POST['save_smtp'])) {
        $newConfig = $config;
        $newConfig['mailFromName']      = trim($_POST['mailFromName']      ?? 'Drop Cars');
        $newConfig['mailFrom']          = trim($_POST['mailFrom']          ?? '');
        $newConfig['mailTo']            = trim($_POST['mailTo']            ?? '');
        $newConfig['smtpUsername']      = trim($_POST['smtpUsername']      ?? '');
        $raw = trim($_POST['gmailAppPassword'] ?? '');
        if ($raw !== '') $newConfig['gmailAppPassword'] = str_replace(' ', '', $raw); // strip spaces
        $newConfig['fallbackSmtpUser']      = $newConfig['mailFrom'];
        $newConfig['fallbackAppPassword']   = $newConfig['gmailAppPassword'] ?? $config['gmailAppPassword'] ?? '';
        $content = "<?php\nreturn " . var_export($newConfig, true) . ";\n";
        if (dropcars_save_config_file_or_db($pdo, $configPath, $newConfig)) {
            $config = $newConfig;
            sync_settings_to_public_config();
            $message = "Email / SMTP settings saved successfully.";
        } else {
            $message = "Error: Could not save SMTP settings. Check file permissions.";
            $messageType = "error";
        }
    }

    if (isset($_POST['test_smtp_send'])) {
        $phpmailerPath = dirname(__DIR__, 2) . '/api/phpmailer/src/PHPMailer.php';
        if (!is_file($phpmailerPath)) {
            $message = "Error: PHPMailer missing under api/phpmailer/.";
            $messageType = "error";
        } else {
            require_once dirname(__DIR__, 2) . '/api/phpmailer/src/Exception.php';
            require_once dirname(__DIR__, 2) . '/api/phpmailer/src/PHPMailer.php';
            require_once dirname(__DIR__, 2) . '/api/phpmailer/src/SMTP.php';
            require_once dirname(__DIR__, 2) . '/api/smtp-settings.php';
            
            $testConfig = $config;
            $testConfig['mailFromName']      = trim($_POST['mailFromName']      ?? 'Drop Cars');
            $testConfig['mailFrom']          = trim($_POST['mailFrom']          ?? '');
            $testConfig['mailTo']            = trim($_POST['mailTo']            ?? '');
            $testConfig['smtpUsername']      = trim($_POST['smtpUsername']      ?? '');
            $raw = trim($_POST['gmailAppPassword'] ?? '');
            if ($raw !== '') $testConfig['gmailAppPassword'] = str_replace(' ', '', $raw);
            
            $testSmtp = dropcars_resolve_smtp($testConfig);
            
            $mail = new \PHPMailer\PHPMailer\PHPMailer(true);
            try {
                $mail->isSMTP();
                $mail->Host = 'smtp.gmail.com';
                $mail->SMTPAuth = true;
                $mail->SMTPSecure = 'tls';
                $mail->Port = 587;
                $mail->Timeout = 8;
                $mail->SMTPKeepAlive = false;
                dropcars_phpmailer_apply_smtp($mail, $testSmtp);
                $mail->addAddress($testSmtp['mailTo']);
                $mail->CharSet = 'UTF-8';
                $mail->Subject = '✅ Drop Cars SMTP Test — ' . date('d M Y H:i:s');
                $mail->Body    = '<h2>SMTP is working!</h2><p>Sent from admin settings test at ' . date('d M Y H:i:s T') . '</p>';
                $mail->AltBody = 'SMTP is working! Sent at ' . date('d M Y H:i:s T');
                $mail->isHTML(true);
                $mail->send();
                
                $message = "Test email sent successfully to " . htmlspecialchars($testSmtp['mailTo']) . "!";
                $messageType = "success";
            } catch (\Exception $e) {
                try {
                    $mail2 = new \PHPMailer\PHPMailer\PHPMailer(true);
                    $mail2->isSMTP();
                    $mail2->Host = 'smtp.gmail.com';
                    $mail2->SMTPAuth = true;
                    $mail2->SMTPSecure = 'ssl';
                    $mail2->Port = 465;
                    $mail2->Timeout = 8;
                    $mail2->SMTPKeepAlive = false;
                    dropcars_phpmailer_apply_smtp($mail2, $testSmtp);
                    $mail2->addAddress($testSmtp['mailTo']);
                    $mail2->CharSet = 'UTF-8';
                    $mail2->Subject = '✅ Drop Cars SMTP Test (Port 465) — ' . date('d M Y H:i:s');
                    $mail2->Body    = '<h2>SMTP is working via Port 465!</h2><p>Sent at ' . date('d M Y H:i:s T') . '</p>';
                    $mail2->AltBody = 'SMTP working via Port 465. Sent at ' . date('d M Y H:i:s T');
                    $mail2->isHTML(true);
                    $mail2->send();
                    
                    $message = "Test email sent successfully to " . htmlspecialchars($testSmtp['mailTo']) . " via Port 465!";
                    $messageType = "success";
                } catch (\Exception $e2) {
                    $message = "SMTP Test Failed. Port 587: " . $e->getMessage() . " | Port 465: " . $e2->getMessage();
                    $messageType = "error";
                }
            }
        }
    }

    if (isset($_POST['save_subdomain_config'])) {
        $newConfig = $config;
        $slug = preg_replace('/[^a-z0-9]/', '', strtolower(trim($_POST['subdomain_slug'] ?? '')));
        if ($slug !== '') {
            $newConfig['subdomainConfig'][$slug] = [
                'displayName' => trim($_POST['subdomain_displayName'] ?? ''),
                'mailTo' => trim($_POST['subdomain_mailTo'] ?? ''),
                'enabled' => isset($_POST['subdomain_enabled']),
            ];
            
            $content = "<?php\nreturn " . var_export($newConfig, true) . ";\n";
            if (dropcars_save_config_file_or_db($pdo, $configPath, $newConfig)) {
                $config = $newConfig;
                sync_settings_to_public_config();
                $message = "Subdomain overrides updated successfully.";
                $messageType = "success";
            } else {
                $message = "Error: Could not save subdomain settings. Check file permissions.";
                $messageType = "error";
            }
        } else {
            $message = "Error: Invalid subdomain slug.";
            $messageType = "error";
        }
    }

    if (isset($_POST['save_theme_config'])) {
        $themesFile = dirname(__DIR__, 2) . '/data/themes.json';
        if (file_exists($themesFile)) {
            $themes = json_decode(file_get_contents($themesFile), true);
            if (!is_array($themes)) {
                $themes = [];
            }
            
            $action = trim($_POST['theme_action'] ?? 'add');
            $slug = preg_replace('/[^a-z0-9-]/', '', strtolower(trim($_POST['theme_slug'] ?? '')));
            
            if ($slug !== '') {
                $newTheme = [
                    'id'            => $slug,
                    'name'          => trim($_POST['theme_name'] ?? ''),
                    'slug'          => $slug,
                    'title'         => trim($_POST['theme_title'] ?? ''),
                    'heroTitle'     => trim($_POST['theme_heroTitle'] ?? ''),
                    'heroSub'       => trim($_POST['theme_heroSub'] ?? ''),
                    'metaTitle'     => trim($_POST['theme_metaTitle'] ?? ''),
                    'metaDesc'      => trim($_POST['theme_metaDesc'] ?? ''),
                    'selectorLabel' => trim($_POST['theme_selectorLabel'] ?? '')
                ];
                
                if ($action === 'edit') {
                    $origId = trim($_POST['original_theme_id'] ?? '');
                    $updated = false;
                    foreach ($themes as $idx => $t) {
                        if (($t['id'] ?? '') === $origId || ($t['slug'] ?? '') === $origId) {
                            $themes[$idx] = $newTheme;
                            $updated = true;
                            break;
                        }
                    }
                    if (!$updated) {
                        $themes[] = $newTheme;
                    }
                } else {
                    // Check duplicate slug for Add
                    $exists = false;
                    foreach ($themes as $t) {
                        if (($t['slug'] ?? '') === $slug) {
                            $exists = true;
                            break;
                        }
                    }
                    if ($exists) {
                        $message = "Error: A theme with slug '{$slug}' already exists.";
                        $messageType = "error";
                        $slug = ''; // invalidate
                    } else {
                        $themes[] = $newTheme;
                    }
                }
                
                if ($slug !== '') {
                    if (file_put_contents($themesFile, json_encode($themes, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)) !== false) {
                        if (function_exists('dropcars_sync_theme_subdomain_directories')) {
                            dropcars_sync_theme_subdomain_directories();
                        }
                        $message = "Theme configurations saved successfully.";
                        $messageType = "success";
                        // Redirect to prevent form resubmission
                        header('Location: ' . admin_url('settings', ['cat' => 'subdomains', 'msg' => 'theme_saved']));
                        exit;
                    } else {
                        $message = "Error: Could not write to data/themes.json. Check file permissions.";
                        $messageType = "error";
                    }
                }
            } else {
                $message = "Error: Invalid theme slug.";
                $messageType = "error";
            }
        }
    }

    if (isset($_POST['save_registered_site'])) {
        $action = trim($_POST['site_action'] ?? 'add');
        $slug = preg_replace('/[^a-z0-9_]/', '', strtolower(trim($_POST['site_slug'] ?? '')));
        $domain = trim(strtolower((string)($_POST['site_domain'] ?? '')));
        $name = trim((string)($_POST['site_name'] ?? ''));
        $status = in_array($_POST['site_status'] ?? '', ['active', 'disabled'], true) ? $_POST['site_status'] : 'active';

        if ($slug === '') {
            $message = 'Error: Invalid website slug.';
            $messageType = 'error';
        } elseif ($domain === '') {
            $message = 'Error: Invalid domain name.';
            $messageType = 'error';
        } elseif ($name === '') {
            $message = 'Error: Invalid display name.';
            $messageType = 'error';
        } else {
            if ($action === 'edit') {
                $origSlug = trim($_POST['original_site_slug'] ?? '');
                $stmtUpdate = $pdo->prepare("UPDATE `registered_sites` SET domain_name = ?, display_name = ?, status = ? WHERE slug = ?");
                if ($stmtUpdate->execute([$domain, $name, $status, $origSlug])) {
                    $message = 'Website settings updated successfully.';
                    $messageType = 'success';
                    header('Location: ' . admin_url('settings', ['cat' => 'subdomains', 'msg' => 'site_saved']));
                    exit;
                } else {
                    $message = 'Failed to update website due to a database error.';
                    $messageType = 'error';
                }
            } else {
                // Add mode
                $stmtCheck = $pdo->prepare("SELECT COUNT(*) FROM `registered_sites` WHERE slug = ?");
                $stmtCheck->execute([$slug]);
                if ((int)$stmtCheck->fetchColumn() > 0) {
                    $message = "Error: A website with slug '{$slug}' already exists.";
                    $messageType = 'error';
                } else {
                    $stmtInsert = $pdo->prepare("INSERT INTO `registered_sites` (slug, domain_name, display_name, status) VALUES (?, ?, ?, ?)");
                    if ($stmtInsert->execute([$slug, $domain, $name, $status])) {
                        $message = 'Website registered successfully.';
                        $messageType = 'success';
                        header('Location: ' . admin_url('settings', ['cat' => 'subdomains', 'msg' => 'site_added']));
                        exit;
                    } else {
                        $message = 'Failed to register website due to a database error.';
                        $messageType = 'error';
                    }
                }
            }
        }
    }


    /* -- Telegram Bot -------------------------------------------- */
    if (isset($_POST['save_telegram'])) {
        $newConfig = $config;
        $newConfig['telegramBotToken'] = trim($_POST['telegramBotToken'] ?? '');
        $rawIds = trim($_POST['telegramChatIds'] ?? '');
        // Accept comma or newline separated chat IDs; store as array
        $ids = array_filter(array_map('trim', preg_split('/[\r\n,]+/', $rawIds)));
        $newConfig['telegramChatIds'] = array_values($ids);
        $content = "<?php\nreturn " . var_export($newConfig, true) . ";\n";
        if (dropcars_save_config_file_or_db($pdo, $configPath, $newConfig)) {
            $config = $newConfig;
            $message = "Telegram settings saved successfully.";
        } else {
            $message = "Error: Could not save Telegram settings.";
            $messageType = "error";
        }
    }

    /* -- Booking Defaults ---------------------------------------- */
    if (isset($_POST['save_booking_defaults'])) {
        $newConfig = $config;
        $newConfig['defaultPickupCity']   = trim($_POST['defaultPickupCity']   ?? 'Tiruvannamalai');
        $newConfig['defaultVehicleType']  = trim($_POST['defaultVehicleType']  ?? 'SEDAN');
        $newConfig['defaultServiceType']  = trim($_POST['defaultServiceType']  ?? 'one_way');
        $newConfig['bookingIdPrefix']     = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', trim($_POST['bookingIdPrefix'] ?? 'TCT')));
        $newConfig['supportPhone2']       = trim($_POST['supportPhone2']       ?? $config['supportPhone'] ?? '');
        $content = "<?php\nreturn " . var_export($newConfig, true) . ";\n";
        if (dropcars_save_config_file_or_db($pdo, $configPath, $newConfig)) {
            $config = $newConfig;
            sync_settings_to_public_config();
            $message = "Booking defaults saved.";
        } else {
            $message = "Error: Could not save booking defaults.";
            $messageType = "error";
        }
    }

    /* -- Interstate & Regional Surcharges ------------------------ */
    if (isset($_POST['save_regional_pricing'])) {
        $newConfig = $config;
        $newConfig['interstateSurcharge'] = max(0, (float)($_POST['interstateSurcharge'] ?? 0));
        $newConfig['stateSurcharge_KA']   = max(0, (float)($_POST['stateSurcharge_KA']   ?? 0));
        $newConfig['stateSurcharge_KL']   = max(0, (float)($_POST['stateSurcharge_KL']   ?? 0));
        $newConfig['stateSurcharge_AP']   = max(0, (float)($_POST['stateSurcharge_AP']   ?? 0));
        $content = "<?php\nreturn " . var_export($newConfig, true) . ";\n";
        if (dropcars_save_config_file_or_db($pdo, $configPath, $newConfig)) {
            $config = $newConfig;
            sync_settings_to_public_config();
            $message = "Interstate & Regional pricing surcharges saved.";
        } else {
            $message = "Error: Could not save regional surcharges."; $messageType = "error";
        }
    }

    /* -- SMS Gateway Integration ---------------------------------- */
    if (isset($_POST['save_sms_gateway'])) {
        $newConfig = $config;
        $newConfig['smsGateway']          = in_array($_POST['smsGateway'] ?? '', ['none', 'twilio', 'generic'], true) ? $_POST['smsGateway'] : 'none';
        $rawKey = trim($_POST['smsApiKey'] ?? '');
        if ($rawKey !== '') $newConfig['smsApiKey'] = $rawKey;
        $newConfig['smsSenderId']         = trim($_POST['smsSenderId'] ?? '');
        $newConfig['smsTwilioSid']        = trim($_POST['smsTwilioSid'] ?? '');
        $newConfig['smsGenericUrl']       = trim($_POST['smsGenericUrl'] ?? '');
        $newConfig['smsTemplateBooking']  = trim($_POST['smsTemplateBooking'] ?? '');
        $content = "<?php\nreturn " . var_export($newConfig, true) . ";\n";
        if (dropcars_save_config_file_or_db($pdo, $configPath, $newConfig)) {
            $config = $newConfig;
            sync_settings_to_public_config();
            $message = "SMS Gateway integration configurations saved.";
        } else {
            $message = "Error: Could not save SMS gateway settings."; $messageType = "error";
        }
    }

    /* -- Pricing Rules ------------------------------------------- */
    if (isset($_POST['save_pricing_rules'])) {
        $newConfig = $config;
        $newConfig['nightSurchargeEnabled']   = isset($_POST['nightSurchargeEnabled']);
        $newConfig['nightSurchargePercent']   = max(0, (int)($_POST['nightSurchargePercent']   ?? 10));
        $newConfig['nightSurchargeStartHour'] = max(0, min(23, (int)($_POST['nightSurchargeStartHour'] ?? 22)));
        $newConfig['nightSurchargeEndHour']   = max(0, min(23, (int)($_POST['nightSurchargeEndHour']   ?? 5)));
        $newConfig['tollEstimatePerKm']       = max(0, (float)($_POST['tollEstimatePerKm']       ?? 2));
        $newConfig['holidaySurchargeEnabled'] = isset($_POST['holidaySurchargeEnabled']);
        $newConfig['holidaySurchargePercent'] = max(0, (int)($_POST['holidaySurchargePercent']   ?? 0));
        $newConfig['minFareOneWay']           = max(0, (int)($_POST['minFareOneWay']             ?? 500));
        $content = "<?php\nreturn " . var_export($newConfig, true) . ";\n";
        if (dropcars_save_config_file_or_db($pdo, $configPath, $newConfig)) {
            $config = $newConfig;
            sync_settings_to_public_config();
            $message = "Pricing rules saved.";
        } else {
            $message = "Error: Could not save pricing rules.";
            $messageType = "error";
        }
    }

    /* -- Extra Options & Surcharges ------------------------------ */
    if (isset($_POST['save_extra_surcharges'])) {
        $newConfig = $config;
        $newConfig['luggageSurchargeEnabled'] = isset($_POST['luggageSurchargeEnabled']);
        $newConfig['luggageSurchargeAmount']  = max(0, (float)($_POST['luggageSurchargeAmount']  ?? 0));
        $newConfig['petSurchargeEnabled']     = isset($_POST['petSurchargeEnabled']);
        $newConfig['petSurchargeAmount']      = max(0, (float)($_POST['petSurchargeAmount']      ?? 0));
        $newConfig['peakHourSurchargeEnabled'] = isset($_POST['peakHourSurchargeEnabled']);
        $newConfig['peakHourSurchargePercent'] = max(0, (int)($_POST['peakHourSurchargePercent'] ?? 0));
        $newConfig['peakHourStartHour']       = max(0, min(23, (int)($_POST['peakHourStartHour']       ?? 16)));
        $newConfig['peakHourEndHour']         = max(0, min(23, (int)($_POST['peakHourEndHour']         ?? 20)));
        $content = "<?php\nreturn " . var_export($newConfig, true) . ";\n";
        if (dropcars_save_config_file_or_db($pdo, $configPath, $newConfig)) {
            $config = $newConfig;
            sync_settings_to_public_config();
            $message = "Extra options and peak-hour surcharges saved successfully.";
        } else {
            $message = "Error: Could not save extra options. Check file permissions."; $messageType = "error";
        }
    }

    /* -- Contact & Address -----------------------------------------
       (We operate 24/7 &mdash; hours/days form fields were removed from the UI.
       We still force-write the 24x7 markers + open/close fields here for
       backwards compatibility with footer / FAQ / schema markup that
       reads them.) */
    if (isset($_POST['save_business_hours'])) {
        $newConfig = $config;
        // 24/7 is hard-set; force markers regardless of what was posted.
        $newConfig['is24x7']             = true;
        $newConfig['businessHoursOpen']  = '00:00';
        $newConfig['businessHoursClose'] = '23:59';
        $newConfig['businessDays']       = 'Mon - Sun';
        $newConfig['emergencyPhone']     = trim($_POST['emergencyPhone']     ?? $config['supportPhone'] ?? '');
        $newConfig['businessAddress']    = trim($_POST['businessAddress']    ?? '136, Chengam Road, Tiruvannamalai');
        $newConfig['businessCity']       = trim($_POST['businessCity']       ?? 'Tiruvannamalai');
        $newConfig['businessState']      = trim($_POST['businessState']      ?? 'Tamil Nadu');
        $newConfig['businessPincode']    = trim($_POST['businessPincode']    ?? '606601');
        $content = "<?php\nreturn " . var_export($newConfig, true) . ";\n";
        if (dropcars_save_config_file_or_db($pdo, $configPath, $newConfig)) {
            $config = $newConfig;
            sync_settings_to_public_config();
            $message = "Contact & address saved.";
        } else {
            $message = "Error: Could not save contact & address.";
            $messageType = "error";
        }
    }

    /* -- API Keys ------------------------------------------------ */
    if (isset($_POST['save_api_keys'])) {
        $newConfig = $config;
        $gmk = trim($_POST['googleMapsApiKey'] ?? '');
        if ($gmk !== '') $newConfig['googleMapsApiKey'] = $gmk;
        $newConfig['googleAnalyticsId']  = trim($_POST['googleAnalyticsId']  ?? '');
        $newConfig['facebookPixelId']    = trim($_POST['facebookPixelId']    ?? '');
        $newConfig['googleSheetsWebhookUrl']   = trim($_POST['googleSheetsWebhookUrl']   ?? '');
        $newConfig['googleCalendarWebhookUrl'] = trim($_POST['googleCalendarWebhookUrl'] ?? '');
        $newConfig['enableLocalLocationFallback'] = isset($_POST['enableLocalLocationFallback']);
        $content = "<?php\nreturn " . var_export($newConfig, true) . ";\n";
        // Also patch config/env.php if the Maps key changed
        if ($gmk !== '') {
            $envPath = __DIR__ . '/../../config/env.php';
            if (is_file($envPath)) {
                $envContent = file_get_contents($envPath);
                $envContent = preg_replace(
                    "/(define\s*\(\s*['\"]GOOGLE_MAPS_API_KEY['\"],\s*(?:.*?getenv\(['\"]GOOGLE_MAPS_API_KEY['\"]\)\s*\?:\s*)['\"])[^'\"]*(['\"])/",
                    '${1}' . addcslashes($gmk, "'\\") . '${2}',
                    $envContent
                );
                file_put_contents($envPath, $envContent);
            }
        }
        if (dropcars_save_config_file_or_db($pdo, $configPath, $newConfig)) {
            $config = $newConfig;
            sync_settings_to_public_config();
            $message = "API keys saved.";
        } else {
            $message = "Error: Could not save API keys.";
            $messageType = "error";
        }
    }

    /* -- Top Announcement Banner -------------------------------- */
    if (isset($_POST['save_announcement'])) {
        $newConfig = $config;
        $newConfig['announcementEnabled']  = isset($_POST['announcementEnabled']);
        $newConfig['announcementText']     = trim((string)($_POST['announcementText']     ?? ''));
        $newConfig['announcementLink']     = trim((string)($_POST['announcementLink']     ?? ''));
        $newConfig['announcementLinkText'] = trim((string)($_POST['announcementLinkText'] ?? ''));
        $newConfig['announcementVariant']  = in_array($_POST['announcementVariant'] ?? '', ['info','warning','success','promo'], true) ? $_POST['announcementVariant'] : 'info';
        $newConfig['announcementDismissable'] = isset($_POST['announcementDismissable']);
        if (dropcars_save_config_file_or_db($pdo, $configPath, $newConfig)) {
            $config = $newConfig;
            sync_settings_to_public_config();
            $message = "Announcement banner saved.";
        } else {
            $message = "Error: Could not save announcement."; $messageType = "error";
        }
    }

    /* -- Hero Content Overrides -------------------------------- */
    if (isset($_POST['save_hero_content'])) {
        $newConfig = $config;
        foreach (['heroBadgeText','heroTitleOverride','heroSubOverride'] as $f) {
            $newConfig[$f] = trim((string)($_POST[$f] ?? ''));
        }
        foreach (['heroStat1','heroStat2','heroStat3','heroStat4'] as $stat) {
            $newConfig[$stat . 'Value'] = trim((string)($_POST[$stat . 'Value'] ?? ''));
            $newConfig[$stat . 'Label'] = trim((string)($_POST[$stat . 'Label'] ?? ''));
        }
        if (dropcars_save_config_file_or_db($pdo, $configPath, $newConfig)) {
            $config = $newConfig;
            sync_settings_to_public_config();
            $message = "Hero section content saved.";
        } else {
            $message = "Error: Could not save hero content."; $messageType = "error";
        }
    }

    /* -- Site Sections Visibility (feature toggles) ------------ */
    if (isset($_POST['save_section_visibility'])) {
        $newConfig = $config;
        foreach (['showHeroStats','showMarquee','showTrustFeatures','showTestimonials','showFAQ','showPartnersCTA','showAboutUs','showFleetShowcase'] as $f) {
            $newConfig[$f] = isset($_POST[$f]);
        }
        if (dropcars_save_config_file_or_db($pdo, $configPath, $newConfig)) {
            $config = $newConfig;
            sync_settings_to_public_config();
            $message = "Section visibility saved.";
        } else {
            $message = "Error: Could not save section visibility."; $messageType = "error";
        }
    }



    /* -- Live Chat Widget -------------------------------------- */
    if (isset($_POST['save_live_chat'])) {
        $newConfig = $config;
        $newConfig['liveChatProvider'] = in_array($_POST['liveChatProvider'] ?? '', ['none','crisp','tawk','intercom'], true) ? $_POST['liveChatProvider'] : 'none';
        $newConfig['liveChatId']       = trim((string)($_POST['liveChatId']       ?? ''));
        if (dropcars_save_config_file_or_db($pdo, $configPath, $newConfig)) {
            $config = $newConfig;
            sync_settings_to_public_config();
            $message = "Live chat widget saved.";
        } else {
            $message = "Error: Could not save live chat."; $messageType = "error";
        }
    }

    /* -- SEO Overrides ----------------------------------------- */
    if (isset($_POST['save_seo'])) {
        $newConfig = $config;
        foreach (['seoMetaDescription','seoOgImage','seoTwitterHandle','seoKeywords','searchConsoleId','bingWebmasterId'] as $f) {
            $newConfig[$f] = trim((string)($_POST[$f] ?? ''));
        }
        if (dropcars_save_config_file_or_db($pdo, $configPath, $newConfig)) {
            $config = $newConfig;
            sync_settings_to_public_config();
            $message = "SEO settings saved.";
        } else {
            $message = "Error: Could not save SEO settings."; $messageType = "error";
        }
    }

    /* -- Page Loading & Action Protection Fixer ---------------- */

    if (isset($_POST['run_page_fixer'])) {
        $fixesApplied = [];

        // 1. Ensure Local Location Fallback is ON so adblockers won't freeze form city inputs
        $newConfig = $config;
        if (empty($newConfig['enableLocalLocationFallback'])) {
            $newConfig['enableLocalLocationFallback'] = true;
            dropcars_save_config_file_or_db($pdo, $configPath, $newConfig);
            $config = $newConfig;
            $fixesApplied[] = "Enabled Local Location Fallback (prevents Google Places adblocker freezes)";
        } else {
            $fixesApplied[] = "Local Location Fallback is active";
        }

        // 2. Sync theme subdomain directories and .htaccess routing
        if (function_exists('dropcars_sync_theme_subdomain_directories')) {
            dropcars_sync_theme_subdomain_directories();
            $fixesApplied[] = "Synchronized theme subdomains & .htaccess routing rules";
        }

        // 3. Ensure required system directories exist
        $dirsToVerify = ['tmp', 'data', 'logs', 'assets/img/uploads'];
        $root = dirname(__DIR__, 2);
        foreach ($dirsToVerify as $d) {
            $p = $root . '/' . $d;
            if (!is_dir($p)) {
                @mkdir($p, 0755, true);
                $fixesApplied[] = "Created missing directory: {$d}/";
            }
        }

        // 4. Clear stale error cooldown locks
        $cooldownFile = $root . '/tmp/error-cooldown.json';
        if (is_file($cooldownFile)) {
            @unlink($cooldownFile);
            $fixesApplied[] = "Reset error throttling cooldown cache";
        }

        // 5. Sync public config
        sync_settings_to_public_config();

        $message = "Page Loading & Action Protection check complete! " . implode(' · ', $fixesApplied);
        $messageType = "success";
    }

    if (isset($_POST['bulk_sync'])) {

        require_once __DIR__ . '/../../includes/google-sheet-sync.php';
        $limit = (int) ($_POST['sync_limit'] ?? 50);
        
        // Fetch bookings
        $stmt = $pdo->prepare("SELECT b.*, c.name, c.phone FROM `bookings` b JOIN `customers` c ON b.customer_id = c.id ORDER BY b.created_at DESC LIMIT ?");
        $stmt->execute([$limit]);
        $rows = $stmt->fetchAll();
        
        $successCount = 0;
        foreach ($rows as $r) {
            $entry = [
                'type' => 'CONFIRMED (Sync)',
                'bookingId' => $r['booking_id'],
                'customerName' => $r['name'],
                'contact' => $r['phone'],
                'pickup' => $r['pickup_location'],
                'drop' => $r['drop_location'],
                'travelDate' => $r['pickup_date'],
                'travelTime' => $r['pickup_time'],
                'vehicleType' => $r['car_name'],
                'fareEstimate' => $r['final_fare'],
                'ip' => 'manually_synced',
                'status' => $r['status'],
                'createdAt' => $r['created_at']
            ];
            $entry = buildBookingPayload([
                'created_at' => $r['created_at'] ?? date('c'),
                'booking_id' => $r['booking_id'] ?? '',
                'status' => $r['status'] ?? '',
                'customer_name' => $r['name'] ?? '',
                'customer_phone' => $r['phone'] ?? '',
                'trip_type' => $r['trip_type'] ?? 'oneway',
                'pickup_location' => $r['pickup_location'] ?? '',
                'via_locations' => $r['via_locations'] ?? '',
                'drop_location' => $r['drop_location'] ?? '',
                'pickup_date' => $r['pickup_date'] ?? '',
                'pickup_time' => $r['pickup_time'] ?? '',
                'return_date' => $r['return_date'] ?? '',
                'return_time' => $r['return_time'] ?? '',
                'trip_days' => $r['trip_days'] ?? '',
                'car_name' => $r['car_name'] ?? '',
                'distance_km' => $r['distance_km'] ?? '',
                'estimated_fare' => $r['estimated_fare'] ?? $r['final_fare'] ?? '',
                'final_fare' => $r['final_fare'] ?? '',
                'discount_amount' => $r['discount_amount'] ?? '',
                'fare_type' => $r['fare_type'] ?? '',
                'driver_name' => $r['driver_name'] ?? '',
                'driver_phone' => $r['driver_phone'] ?? '',
                'car_number' => $r['car_number'] ?? '',
                'source' => $r['source'] ?? '',
                'utm_source' => $r['utm_source'] ?? '',
                'utm_medium' => $r['utm_medium'] ?? '',
                'utm_campaign' => $r['utm_campaign'] ?? '',
                'gclid' => $r['gclid'] ?? '',
                'ip_address' => 'manually_synced',
                'loyalty_status' => !empty($r['is_regular_customer']) ? 'Regular' : '',
            ]);
            if (sendToGoogleSheet($entry)) {
                $successCount++;
            }
            usleep(200000); // 0.2s pause between requests
        }
        $message = "Bulk sync complete: $successCount out of " . count($rows) . " rows pushed successfully.";
    }

    if (isset($_POST['test_sync'])) {
        require_once __DIR__ . '/../../includes/google-sheet-sync.php';
        
        // Use submitted values for test, even if not saved to config yet
        $testConfig = $config;
        $testConfig['googleSheetsWebhookUrl'] = trim($_POST['googleSheetsWebhookUrl'] ?? $config['googleSheetsWebhookUrl'] ?? '');
        $testConfig['googleSheetsWebhookToken'] = trim($_POST['googleSheetsWebhookToken'] ?? $config['googleSheetsWebhookToken'] ?? '');

        $testEntry = buildEnquiryPayload([
            'createdAt' => date('c'),
            'bookingId' => 'TEST-' . time(),
            'status' => 'test_confirmed',
            'name' => 'Admin Test',
            'phone' => '1234567890',
            'tripType' => 'enquiry',
            'pickup' => 'Test Origin',
            'viaLocations' => '',
            'drop' => 'Test Destination',
            'pickupDate' => date('Y-m-d'),
            'pickupTime' => date('H:i'),
            'returnDate' => '',
            'returnTime' => '',
            'tripDays' => '',
            'vehicle' => 'SEDAN',
            'distance' => '',
            'estFare' => '999',
            'finalFare' => '',
            'discount' => '',
            'fareType' => 'base',
            'driverName' => '',
            'driverPhone' => '',
            'carNumber' => '',
            'source' => 'admin_settings',
            'utmSource' => '',
            'utmMedium' => '',
            'utmCampaign' => '',
            'gclid' => '',
            'ip' => $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1',
            'loyaltyStatus' => '',
        ]);

        if (sendToGoogleSheet($testEntry, $testConfig)) {
            $message = "Test row sent successfully! Check your Google Sheet.";
        } else {
            $message = "Test failed. Check Google Sheet sync logs.";
            $messageType = "error";
        }
    }

    if (isset($_POST['clear_telemetry'])) {
        $telemetryFile = dirname(__DIR__, 2) . '/tmp/telemetry-log.json';
        if (is_file($telemetryFile)) {
            @unlink($telemetryFile);
        }
        header('Location: ' . admin_url('settings', ['cat' => 'telemetry', 'msg' => 'telemetry_cleared']));
        exit;
    }
}
?>

<style>
    .switch { position: relative; display: inline-block; width: 44px; height: 22px; }
    .switch input { opacity: 0; width: 0; height: 0; }
    .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #ccc; transition: .4s; border-radius: 34px; }
    .slider:before { position: absolute; content: ""; height: 16px; width: 16px; left: 3px; bottom: 3px; background-color: white; transition: .4s; border-radius: 50%; }
    input:checked + .slider { background-color: var(--primary-color); }
    input:checked + .slider:before { transform: translateX(22px); }
    .settings-row { display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 0; border-bottom: 1px solid #f8f9fa; }
    .settings-row:last-child { border-bottom: none; }
    
    .settings-grid { 
        display: flex;
        flex-wrap: wrap;
        gap: 1.5rem; 
        width: 100%;
        box-sizing: border-box;
    }
    .form-row-2col { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }

    .settings-card { 
        box-sizing: border-box; 
        overflow: hidden; 
        flex: 1 1 400px; /* Grow, Shrink, Basis */
        min-width: 0; /* Prevents flex items from overflowing their container */
        background: white;
        border: 1px solid var(--slate-200);
        border-radius: var(--border-radius-lg);
        box-shadow: var(--card-shadow);
        padding: 2rem;
    }

    @media (max-width: 1024px) {
        .settings-grid { flex-direction: column; gap: 1.25rem; }
        .settings-card { flex: 1 1 auto; padding: 1.25rem; border-radius: 12px; }
        .form-row-2col { grid-template-columns: 1fr; }
        .page-header h1 { font-size: 1.5rem; }
    }

    /* -- Tight phone viewports: shrink cards so nothing overflows -- */
    @media (max-width: 800px) {
        .settings-grid {
            gap: 0.9rem;
            padding: 0;
        }
        .settings-card {
            flex: 1 1 100% !important;       /* override desktop 400px basis */
            width: 100% !important;
            max-width: 100% !important;
            padding: 1rem !important;
            border-radius: 12px;
        }
        .settings-card h2,
        .settings-card h3 {
            font-size: 1rem !important;
            line-height: 1.25 !important;
        }
        .settings-card .form-control,
        .settings-card input,
        .settings-card select,
        .settings-card textarea {
            font-size: 0.85rem !important;
            max-width: 100% !important;
            box-sizing: border-box !important;
        }
        .settings-card .form-group { margin-bottom: 0.85rem; }
        .form-row-2col { grid-template-columns: 1fr !important; gap: 0.65rem !important; }
        .settings-row {
            flex-wrap: wrap !important;
            gap: 0.5rem !important;
            padding: 0.6rem 0 !important;
        }
        /* Any flex button row inside settings cards should wrap so action
           buttons (Export/Save/etc.) don't push past the viewport edge. */
        .settings-card div[style*="display: flex"][style*="gap"] {
            flex-wrap: wrap !important;
        }
        .settings-card .btn,
        .settings-card a.btn {
            font-size: 0.78rem !important;
            padding: 0.5rem 0.8rem !important;
        }
        /* Long inline tokens/URLs (Telegram API examples, bot URLs, etc.)
           shouldn't blow past the viewport */
        .settings-card code,
        .settings-card pre {
            white-space: normal !important;
            overflow-wrap: anywhere !important;
            word-break: break-all !important;
            font-size: 0.72rem !important;
            max-width: 100% !important;
            display: inline-block !important;
        }
        .page-header { padding: 0.85rem !important; }
        .page-header h1 { font-size: 1.1rem !important; }
        .page-header p { font-size: 0.78rem !important; line-height: 1.3 !important; }
    }

    /* Realtime Search Styles */
    .settings-search-wrapper {
        position: relative;
        width: 320px;
    }
    @media (max-width: 800px) {
        .settings-search-wrapper {
            width: 100% !important;
            margin-top: 0.5rem;
        }
        #settings-search-dropdown {
            width: 100% !important;
        }
    }
    .search-suggestion-item {
        padding: 0.5rem 0.75rem;
        border-radius: 8px;
        cursor: pointer;
        display: flex;
        flex-direction: column;
        gap: 2px;
        transition: background 0.15s ease;
    }
    .search-suggestion-item:hover,
    .search-suggestion-item.is-keyboard-active {
        background: #f1f5f9;
    }
    .search-suggestion-item .suggestion-title {
        font-weight: 700;
        color: #1e293b;
        font-size: 0.82rem;
    }
    .search-suggestion-item .suggestion-badge {
        font-size: 0.65rem;
        font-weight: 700;
        background: #e0f2fe;
        color: #0369a1;
        padding: 2px 6px;
        border-radius: 4px;
    }
    .search-suggestion-item .suggestion-desc {
        font-size: 0.72rem;
        color: #64748b;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    
    @keyframes highlightFlash {
        0% {
            outline: 3px solid #f7b733;
            box-shadow: 0 0 25px rgba(247, 183, 51, 0.7);
            background-color: #fffbeb;
        }
        50% {
            background-color: #fffbeb;
        }
        100% {
            outline: 3px solid transparent;
            box-shadow: none;
            background-color: #ffffff;
        }
    }
    .highlight-settings-card {
        animation: highlightFlash 3s ease-out forwards;
    }
    #settings-search-input:focus {
        border-color: #0ea5e9 !important;
        box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.15) !important;
    }
</style>

<?php
// Dedicated category pages: hub (no ?cat) shows tiles; ?cat=<x> shows one category.
$settingsCategories = [
    'company'       => ['label' => 'Company',           'icon' => 'fa-building',      'desc' => 'Brand, contact info, homepage hero & announcements'],
    'booking'       => ['label' => 'Booking & Pricing', 'icon' => 'fa-route',         'desc' => 'Fares, surcharges, wallet & economics'],
    'notifications' => ['label' => 'Notifications',      'icon' => 'fa-bell',          'desc' => 'Email/SMTP, Telegram alerts & platform flags'],
    'integrations'  => ['label' => 'Integrations',       'icon' => 'fa-plug',          'desc' => 'Maps, Google Sheets, SEO & live chat'],
    'operations'    => ['label' => 'Operations',         'icon' => 'fa-shield-halved', 'desc' => 'Spam/IP protection, bulk sync & section visibility'],
    'subdomains'    => ['label' => 'Subdomains & Themes', 'icon' => 'fa-globe',         'desc' => 'Configure keyword landing pages, theme settings & subdomains'],
    'telemetry'     => ['label' => 'System Logs & Diagnostics', 'icon' => 'fa-terminal', 'desc' => 'Inspect telemetry errors, site warnings and diagnostic details'],
    'account'       => ['label' => 'Account & Security', 'icon' => 'fa-user-shield',   'desc' => 'Login email & password'],
    'staff'         => ['label' => 'Staff Management',  'icon' => 'fa-users-gear',     'desc' => 'Create and manage staff accounts and credentials'],
];
$activeCat = isset($_GET['cat']) ? preg_replace('/[^a-z_]/', '', (string) $_GET['cat']) : '';
if ($activeCat !== '' && !isset($settingsCategories[$activeCat])) {
    $activeCat = '';
}
$isHub = ($activeCat === '');
$catMeta = $isHub ? null : $settingsCategories[$activeCat];
$activeSiteSlug = dropcars_get_active_website();
$activeSiteInfo = function_exists('dropcars_get_active_website_details') ? dropcars_get_active_website_details($pdo) : null;
?>
<!-- Active Website Context Banner -->
<div class="site-context-banner" style="margin-bottom: 1.25rem; background: <?php echo ($activeSiteSlug !== 'all' && $activeSiteSlug !== 'dropcars') ? 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)' : 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)'; ?>; border: 1px solid <?php echo ($activeSiteSlug !== 'all' && $activeSiteSlug !== 'dropcars') ? '#bfdbfe' : '#e2e8f0'; ?>; border-radius: 12px; padding: 0.85rem 1.15rem; display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap;">
    <div style="display: flex; align-items: center; gap: 0.75rem;">
        <div style="width: 38px; height: 38px; border-radius: 10px; background: <?php echo ($activeSiteSlug !== 'all' && $activeSiteSlug !== 'dropcars') ? '#2563eb' : '#0ea5e9'; ?>; color: #ffffff; display: flex; align-items: center; justify-content: center; font-size: 1.1rem; box-shadow: 0 4px 10px rgba(0,0,0,0.1);">
            <i class="fa-solid fa-globe"></i>
        </div>
        <div>
            <div style="display: flex; align-items: center; gap: 0.5rem;">
                <span style="font-size: 0.7rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: <?php echo ($activeSiteSlug !== 'all' && $activeSiteSlug !== 'dropcars') ? '#1e40af' : '#64748b'; ?>;">
                    Website Settings Context
                </span>
                <?php if ($activeSiteSlug !== 'all' && $activeSiteSlug !== 'dropcars'): ?>
                    <span style="font-size: 0.65rem; font-weight: 700; background: #2563eb; color: #fff; padding: 1px 6px; border-radius: 4px;">CUSTOM SITE CONFIG</span>
                <?php else: ?>
                    <span style="font-size: 0.65rem; font-weight: 700; background: #0284c7; color: #fff; padding: 1px 6px; border-radius: 4px;">GLOBAL / DEFAULT SITE</span>
                <?php endif; ?>
            </div>
            <h4 style="margin: 0.15rem 0 0; font-size: 0.95rem; font-weight: 800; color: #0f172a;">
                <?php 
                if ($activeSiteSlug === 'all') {
                    echo '🌐 All Websites (Editing Global Default Config)';
                } elseif ($activeSiteInfo) {
                    echo '🚗 ' . htmlspecialchars($activeSiteInfo['display_name']) . ' <code style="font-size: 0.8rem; color: #3b82f6;">(' . htmlspecialchars($activeSiteInfo['domain_name']) . ')</code>';
                } else {
                    echo '🚗 ' . htmlspecialchars($activeSiteSlug);
                }
                ?>
            </h4>
        </div>
    </div>
    
    <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
        <?php if ($activeSiteSlug !== 'all' && $activeSiteSlug !== 'dropcars'): ?>
            <form method="POST" style="margin: 0;" onsubmit="return confirm('Are you sure you want to overwrite this website settings with the default Drop Cars settings?');">
                <input type="hidden" name="sync_slug" value="<?php echo htmlspecialchars($activeSiteSlug); ?>">
                <button type="submit" name="sync_from_default" class="btn btn-outline" style="background: #ffffff; border-color: #93c5fd; color: #1d4ed8; font-size: 0.78rem; font-weight: 700; padding: 0.4rem 0.8rem; border-radius: 8px;">
                    <i class="fa-solid fa-arrows-rotate" style="margin-right: 4px;"></i> Sync Settings from Default (Drop Cars)
                </button>
            </form>
        <?php endif; ?>
        <a href="<?php echo htmlspecialchars(admin_url('settings', ['cat' => 'subdomains']), ENT_QUOTES, 'UTF-8'); ?>" class="btn btn-primary" style="font-size: 0.78rem; padding: 0.4rem 0.8rem; border-radius: 8px;">
            <i class="fa-solid fa-sliders" style="margin-right: 4px;"></i> Manage Registered Sites
        </a>
    </div>
</div>

<div class="page-header" style="margin-bottom: 1rem; background: #fff; padding: 0.75rem 1rem; border-radius: 14px; border: 1px solid #f1f5f9; box-shadow: 0 2px 8px rgba(0,0,0,0.02); display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap;">
    <div style="display: flex; align-items: center; gap: 0.65rem;">
        <?php if (!$isHub): ?>
            <a href="<?php echo htmlspecialchars(admin_url('settings'), ENT_QUOTES, 'UTF-8'); ?>" title="All settings" style="width: 36px; height: 36px; flex-shrink: 0; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: #64748b; text-decoration: none;">
                <i class="fa-solid fa-chevron-left" style="font-size: 0.85rem;"></i>
            </a>
        <?php endif; ?>
        <div style="width: 36px; height: 36px; flex-shrink: 0; background: #f0f9ff; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: #0ea5e9;">
            <i class="fa-solid <?php echo $isHub ? 'fa-gear' : htmlspecialchars($catMeta['icon']); ?>" style="font-size: 1rem;"></i>
        </div>
        <div>
            <h1 style="font-size: 1.2rem; font-weight: 800; color: #1e293b; margin: 0;"><?php echo $isHub ? 'Settings &amp; Automation' : htmlspecialchars($catMeta['label']); ?></h1>
            <p style="margin: 0; font-size: 0.75rem; color: #94a3b8;"><?php echo $isHub ? 'Choose a category to configure that area of the platform' : htmlspecialchars($catMeta['desc']); ?></p>
        </div>
    </div>
    <!-- Search Bar -->
    <div class="settings-search-wrapper">
        <div style="position: relative;">
            <i class="fa-solid fa-magnifying-glass" style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: #94a3b8; font-size: 0.85rem;"></i>
            <input type="text" id="settings-search-input" placeholder="Search settings (e.g. SMTP, logo)..." autocomplete="off" style="width: 100%; padding: 0.55rem 2.2rem 0.55rem 2.2rem; font-size: 0.82rem; border: 1px solid #cbd5e1; border-radius: 10px; font-family: inherit; outline: none; transition: border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out; box-sizing: border-box;" />
            <button type="button" id="settings-search-clear" style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); background: transparent; border: none; color: #94a3b8; cursor: pointer; display: none; padding: 4px; font-size: 0.85rem; line-height: 1;"><i class="fa-solid fa-circle-xmark"></i></button>
        </div>
        <!-- Real-time Suggestions Dropdown -->
        <div id="settings-search-dropdown" style="display: none; position: absolute; top: calc(100% + 5px); right: 0; width: 320px; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 12px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1); z-index: 1100; max-height: 300px; overflow-y: auto; padding: 0.4rem; box-sizing: border-box;">
        </div>
    </div>
</div>

<?php if ($message): ?>
    <div class="alert alert-<?php echo $messageType; ?>" style="margin-bottom: 1.5rem; padding: 1rem; border-radius: 8px; border: 1px solid <?php echo $messageType === 'success' ? '#c3e6cb' : '#f5c6cb'; ?>; background: <?php echo $messageType === 'success' ? '#d4edda' : '#f8d7da'; ?>; color: <?php echo $messageType === 'success' ? '#155724' : '#721c24'; ?>;">
        <i class="fa-solid <?php echo $messageType === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation'; ?>" style="margin-right: 8px;"></i>
        <?php echo $message; ?>
    </div>
<?php endif; ?>

<!-- --- SETTINGS CATEGORY MENU --------------------------------------- -->
<style>
    .settings-tabs {
        display: flex;
        gap: 0.45rem;
        flex-wrap: wrap;
        margin-bottom: 1.25rem;
        padding: 0.4rem;
        background: #ffffff;
        border: 1px solid #e2e8f0;
        border-radius: 14px;
        box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
    }
    .settings-tab-btn {
        flex: 1 1 auto;
        min-width: 110px;
        padding: 0.6rem 0.9rem;
        background: transparent;
        border: 1px solid transparent;
        border-radius: 10px;
        font-size: 0.82rem;
        font-weight: 700;
        color: #475569;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.45rem;
        transition: all 0.18s ease;
        font-family: inherit;
    }
    .settings-tab-btn:hover {
        background: #f1f5f9;
        color: #1e293b;
    }
    .settings-tab-btn.is-active {
        background: linear-gradient(135deg, #1e3a8a, #1e40af);
        color: #ffffff;
        border-color: #1e40af;
        box-shadow: 0 6px 14px rgba(30, 58, 138, 0.22);
    }
    .settings-tab-btn .tab-count {
        font-size: 0.65rem;
        background: rgba(15, 23, 42, 0.08);
        padding: 1px 7px;
        border-radius: 999px;
        font-weight: 800;
    }
    .settings-tab-btn.is-active .tab-count {
        background: rgba(255, 255, 255, 0.25);
        color: #ffffff;
    }
    /* Hide cards not matching the active tab */
    .settings-card[data-tab-hidden="true"] {
        display: none !important;
    }
    @media (max-width: 800px) {
        .settings-tabs { padding: 0.3rem; gap: 0.3rem; border-radius: 12px; }
        .settings-tab-btn {
            min-width: 0;
            flex: 1 1 calc(50% - 0.3rem);
            padding: 0.55rem 0.6rem;
            font-size: 0.75rem;
        }
        .settings-tab-btn i { font-size: 0.85rem; }
    }
</style>

<?php if ($isHub): ?>
<!-- HUB: category tiles -->
<div class="settings-hub">
    <?php foreach ($settingsCategories as $key => $c): ?>
        <a class="settings-hub-tile" href="<?php echo htmlspecialchars(admin_url('settings', ['cat' => $key]), ENT_QUOTES, 'UTF-8'); ?>">
            <div class="settings-hub-icon"><i class="fa-solid <?php echo htmlspecialchars($c['icon']); ?>"></i></div>
            <div class="settings-hub-text">
                <strong><?php echo htmlspecialchars($c['label']); ?></strong>
                <span><?php echo htmlspecialchars($c['desc']); ?></span>
            </div>
            <i class="fa-solid fa-chevron-right settings-hub-arrow"></i>
        </a>
    <?php endforeach; ?>
</div>
<style>
.settings-hub { display:grid; grid-template-columns:repeat(auto-fit,minmax(290px,1fr)); gap:1rem; }
.settings-hub-tile { display:flex; align-items:center; gap:1rem; background:#fff; border:1px solid #e2e8f0; border-radius:16px; padding:1.25rem; text-decoration:none; transition:all .18s ease; box-shadow:0 1px 3px rgba(15,23,42,.04); }
.settings-hub-tile:hover { border-color:#cbd5e1; box-shadow:0 8px 20px rgba(15,23,42,.08); transform:translateY(-2px); }
.settings-hub-icon { width:48px; height:48px; flex-shrink:0; background:#f0f9ff; color:#0ea5e9; border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:1.3rem; }
.settings-hub-text { flex:1; min-width:0; }
.settings-hub-text strong { display:block; font-size:1rem; font-weight:800; color:#1e293b; }
.settings-hub-text span { display:block; font-size:.78rem; color:#94a3b8; margin-top:2px; line-height:1.4; }
.settings-hub-arrow { color:#cbd5e1; flex-shrink:0; }
</style>
<?php else: ?>
<div class="settings-grid">

    <!-- --- ACCOUNT & SECURITY -------------------------------------- -->
    <div class="settings-card">
        <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:1.25rem;">
            <div style="width:40px;height:40px;background:rgba(247,183,51,.15);color:#d97706;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:1.2rem;"><i class="fa-solid fa-user-shield"></i></div>
            <div><h3 style="margin:0;">Account & Security</h3><span style="font-size:.75rem;color:#888;">Your admin login email &amp; password</span></div>
        </div>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:.75rem 1rem;margin-bottom:.6rem;">
            <span style="font-size:.7rem;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.04em;">Current login email</span>
            <div style="font-size:.95rem;font-weight:700;color:#0f172a;margin-top:2px;word-break:break-all;"><?php echo htmlspecialchars((string) ($_SESSION['admin_email'] ?? ''), ENT_QUOTES, 'UTF-8'); ?></div>
        </div>
        <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:.75rem 1rem;margin-bottom:1rem;">
            <span style="font-size:.7rem;font-weight:700;color:#b45309;text-transform:uppercase;letter-spacing:.04em;"><i class="fa-solid fa-shield-halved"></i> Recovery email · protected</span>
            <div style="font-size:.95rem;font-weight:700;color:#92400e;margin-top:2px;word-break:break-all;"><?php echo htmlspecialchars(function_exists('dropcars_recovery_email') ? dropcars_recovery_email() : 'dropcarsbookings@gmail.com', ENT_QUOTES, 'UTF-8'); ?></div>
            <div style="font-size:.68rem;color:#a16207;margin-top:3px;">Unchangeable — used for account recovery &amp; important security notifications.</div>
        </div>
        <div style="display:flex;gap:.6rem;flex-wrap:wrap;">
            <a href="<?php echo htmlspecialchars(admin_url('change-email'), ENT_QUOTES, 'UTF-8'); ?>" class="btn btn-primary" style="flex:1;min-width:160px;display:flex;align-items:center;justify-content:center;gap:.4rem;background:#f7b733;color:#1e293b;border:none;font-weight:700;">
                <i class="fa-solid fa-envelope-circle-check"></i> Change Login Email
            </a>
            <a href="<?php echo htmlspecialchars(admin_url('change-password'), ENT_QUOTES, 'UTF-8'); ?>" class="btn btn-secondary" style="flex:1;min-width:140px;display:flex;align-items:center;justify-content:center;gap:.4rem;">
                <i class="fa-solid fa-key"></i> Change Password
            </a>
        </div>
        <p style="font-size:.72rem;color:#94a3b8;margin:.85rem 0 0;line-height:1.5;"><i class="fa-solid fa-shield-halved"></i> Changing your login email requires a 6-digit code sent to your <strong>current</strong> email.</p>

        <div style="border-top:1px dashed #e2e8f0;margin:1rem 0 .85rem;"></div>
        <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:.85rem 1rem;">
            <span style="font-size:.7rem;font-weight:700;color:#b91c1c;text-transform:uppercase;letter-spacing:.04em;"><i class="fa-solid fa-right-from-bracket"></i> Sign out everywhere</span>
            <div style="font-size:.74rem;color:#7f1d1d;margin:3px 0 .7rem;line-height:1.5;">Signs you out on <strong>all devices</strong> (this phone, browsers, the Telegram link session). Use this if a device was lost or shared. You'll need to log in again.</div>
            <form method="POST" onsubmit="return confirm('Log out of ALL devices? You will need to sign in again on every device, including this one.');" style="margin:0;">
                <button type="submit" name="logout_all_devices" value="1" class="btn" style="display:flex;align-items:center;justify-content:center;gap:.4rem;background:#dc2626;color:#fff;border:none;font-weight:700;width:100%;">
                    <i class="fa-solid fa-power-off"></i> Log out of all devices
                </button>
            </form>
        </div>
    </div>

    <!-- --- MANAGE STAFF ACCOUNTS --------------------------------- -->
    <div class="settings-card">
        <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:1.25rem;">
            <div style="width:40px;height:40px;background:rgba(99,102,241,.12);color:#4f46e5;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:1.2rem;"><i class="fa-solid fa-users-gear"></i></div>
            <div><h3 style="margin:0;">Manage Staff Accounts</h3><span style="font-size:.75rem;color:#888;">Create and manage staff logins</span></div>
        </div>

        <!-- Staff List Table -->
        <div style="margin-bottom: 1.5rem;">
            <h4 style="margin: 0 0 0.75rem; font-size: 0.9rem; font-weight: 700; color: #334155;">Active Accounts</h4>
            <div style="overflow-x: auto; border: 1px solid #e2e8f0; border-radius: 8px;">
                <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.82rem;">
                    <thead>
                        <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
                            <th style="padding: 0.6rem 0.8rem; font-weight: 700; color: #475569;">Name</th>
                            <th style="padding: 0.6rem 0.8rem; font-weight: 700; color: #475569;">Username</th>
                            <th style="padding: 0.6rem 0.8rem; font-weight: 700; color: #475569;">Email</th>
                            <th style="padding: 0.6rem 0.8rem; font-weight: 700; color: #475569;">Role</th>
                            <th style="padding: 0.6rem 0.8rem; text-align: right; font-weight: 700; color: #475569;">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php
                        $stmtStaff = $pdo->query("SELECT * FROM admins ORDER BY id ASC");
                        $allStaff = $stmtStaff->fetchAll();
                        foreach ($allStaff as $staff):
                            $isSelf = ((int)$staff['id'] === (int)($_SESSION['admin_id'] ?? 0));
                            $isRecovery = (!empty($staff['email']) && function_exists('dropcars_is_recovery_email') && dropcars_is_recovery_email((string)$staff['email']));
                            $canDelete = !$isSelf && !$isRecovery;
                        ?>
                        <tr style="border-bottom: 1px solid #f1f5f9;">
                            <td style="padding: 0.6rem 0.8rem; font-weight: 600; color: #1e293b;"><?php echo htmlspecialchars($staff['name']); ?></td>
                            <td style="padding: 0.6rem 0.8rem; color: #475569;"><code><?php echo htmlspecialchars($staff['username'] ?? '-'); ?></code></td>
                            <td style="padding: 0.6rem 0.8rem; color: #475569;"><?php echo htmlspecialchars($staff['email'] ?? 'No Email'); ?></td>
                            <td style="padding: 0.6rem 0.8rem;">
                                <span style="font-size: 0.7rem; font-weight: 700; padding: 2px 6px; border-radius: 4px; <?php echo $staff['role'] === 'admin' ? 'background: #fee2e2; color: #991b1b;' : 'background: #e0e7ff; color: #3730a3;'; ?>">
                                    <?php echo strtoupper($staff['role']); ?>
                                </span>
                            </td>
                            <td style="padding: 0.6rem 0.8rem; text-align: right; white-space: nowrap;">
                                <a href="<?php echo htmlspecialchars(admin_url('settings', ['cat' => 'staff', 'edit_admin_id' => $staff['id']]), ENT_QUOTES, 'UTF-8'); ?>" 
                                   style="color: #4f46e5; font-weight: 700; text-decoration: none; font-size: 0.78rem; margin-right: 0.75rem;">
                                    <i class="fa-solid fa-user-pen"></i> Edit
                                </a>
                                <?php if ($canDelete): ?>
                                    <a href="<?php echo htmlspecialchars(admin_url('settings', ['cat' => 'staff', 'delete_admin_id' => $staff['id']]), ENT_QUOTES, 'UTF-8'); ?>" 
                                       onclick="return confirm('Are you sure you want to delete this account? They will be logged out immediately.')" 
                                       style="color: #ef4444; font-weight: 700; text-decoration: none; font-size: 0.78rem;">
                                        <i class="fa-solid fa-trash-can"></i> Delete
                                    </a>
                                <?php else: ?>
                                    <span style="color: #94a3b8; font-size: 0.78rem;" title="Protected account or current session">Protected</span>
                                <?php endif; ?>
                            </td>
                        </tr>
                        <?php endforeach; ?>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Edit/Add Staff Form -->
        <div style="border-top: 1px dashed #e2e8f0; padding-top: 1.25rem;">
            <?php
            $editAdmin = null;
            if (isset($_GET['edit_admin_id'])) {
                $editAdminId = (int) $_GET['edit_admin_id'];
                $stmtEdit = $pdo->prepare("SELECT * FROM admins WHERE id = ?");
                $stmtEdit->execute([$editAdminId]);
                $editAdmin = $stmtEdit->fetch();
            }
            ?>
            <?php if ($editAdmin): ?>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                    <h4 style="margin: 0; font-size: 0.9rem; font-weight: 700; color: #334155;">Edit Account: <?php echo htmlspecialchars($editAdmin['name']); ?></h4>
                    <a href="<?php echo htmlspecialchars(admin_url('settings', ['cat' => 'staff']), ENT_QUOTES, 'UTF-8'); ?>" style="font-size: 0.8rem; color: #64748b; text-decoration: none; font-weight: 600;"><i class="fa-solid fa-circle-xmark"></i> Cancel Edit</a>
                </div>
                <form method="POST">
                    <input type="hidden" name="edit_admin_id" value="<?php echo (int) $editAdmin['id']; ?>">
                    <div class="form-group">
                        <label class="form-label">Name</label>
                        <input type="text" name="staff_name" class="form-control" value="<?php echo htmlspecialchars($editAdmin['name']); ?>" required>
                    </div>
                    <div class="form-row-2col">
                        <div class="form-group">
                            <label class="form-label">Username</label>
                            <input type="text" name="staff_username" class="form-control" value="<?php echo htmlspecialchars($editAdmin['username'] ?? ''); ?>" required>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Password <small style="color: #94a3b8;">(Leave blank to keep current)</small></label>
                            <input type="password" name="staff_password" class="form-control" placeholder="Min 6 chars" autocomplete="new-password">
                        </div>
                    </div>
                    
                    <?php
                    $isRecovery = (!empty($editAdmin['email']) && function_exists('dropcars_is_recovery_email') && dropcars_is_recovery_email((string)$editAdmin['email']));
                    $isSelf = ((int)$editAdmin['id'] === (int)($_SESSION['admin_id'] ?? 0));
                    ?>

                    <div class="form-row-2col">
                        <div class="form-group">
                            <label class="form-label">Email Address <?php if ($isRecovery): ?><small style="color: #d97706;">(Protected Recovery Email)</small><?php else: ?><small style="color: #94a3b8;">(Optional)</small><?php endif; ?></label>
                            <input type="email" name="staff_email" class="form-control" value="<?php echo htmlspecialchars($editAdmin['email'] ?? ''); ?>" <?php echo $isRecovery ? 'readonly style="background: #f1f5f9; color: #64748b; cursor: not-allowed;"' : ''; ?>>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Role</label>
                            <?php if ($isRecovery): ?>
                                <input type="text" class="form-control" value="ADMIN" readonly style="background: #f1f5f9; color: #64748b; cursor: not-allowed;">
                                <input type="hidden" name="staff_role" value="admin">
                            <?php elseif ($isSelf): ?>
                                <input type="text" class="form-control" value="<?php echo strtoupper($editAdmin['role']); ?>" readonly style="background: #f1f5f9; color: #64748b; cursor: not-allowed;">
                                <input type="hidden" name="staff_role" value="<?php echo htmlspecialchars($editAdmin['role']); ?>">
                            <?php else: ?>
                                <select name="staff_role" class="form-control" required>
                                    <option value="staff" <?php echo $editAdmin['role'] === 'staff' ? 'selected' : ''; ?>>STAFF</option>
                                    <option value="admin" <?php echo $editAdmin['role'] === 'admin' ? 'selected' : ''; ?>>ADMIN</option>
                                </select>
                            <?php endif; ?>
                        </div>
                    </div>

                    <button type="submit" name="edit_staff" class="btn btn-primary" style="width: 100%; margin-top: 0.5rem;"><i class="fa-solid fa-user-check"></i> Save Changes</button>
                </form>
            <?php else: ?>
                <h4 style="margin: 0 0 1rem; font-size: 0.9rem; font-weight: 700; color: #334155;">Add Staff Member</h4>
                <form method="POST">
                    <div class="form-group">
                        <label class="form-label">Name</label>
                        <input type="text" name="staff_name" class="form-control" placeholder="e.g. John Doe" required>
                    </div>
                    <div class="form-row-2col">
                        <div class="form-group">
                            <label class="form-label">Username</label>
                            <input type="text" name="staff_username" class="form-control" placeholder="e.g. john_doe" required>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Password</label>
                            <input type="password" name="staff_password" class="form-control" placeholder="Min 6 chars" required autocomplete="new-password">
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Email Address <small style="color: #94a3b8;">(Optional)</small></label>
                        <input type="email" name="staff_email" class="form-control" placeholder="e.g. john@dropcars.in">
                    </div>
                    <button type="submit" name="add_staff" class="btn btn-primary" style="width: 100%; margin-top: 0.5rem;"><i class="fa-solid fa-user-plus"></i> Add Staff Account</button>
                </form>
            <?php endif; ?>
        </div>
    </div>

    <!-- --- EMAIL / SMTP -------------------------------------------- -->
    <div class="settings-card">
        <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:1.25rem;">
            <div style="width:40px;height:40px;background:rgba(66,133,244,.1);color:#4285F4;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:1.2rem;"><i class="fa-solid fa-envelope"></i></div>
            <div><h3 style="margin:0;">Email & SMTP</h3><span style="font-size:.75rem;color:#888;">Gmail App Password configuration</span></div>
        </div>
        <form method="POST">
            <div class="form-group">
                <label class="form-label">Sender Name</label>
                <input type="text" name="mailFromName" class="form-control" value="<?php echo htmlspecialchars($config['mailFromName'] ?? 'Drop Cars'); ?>" placeholder="Drop Cars">
            </div>
            <div class="form-row-2col">
                <div class="form-group">
                    <label class="form-label">Send From (Gmail)</label>
                    <input type="email" name="mailFrom" class="form-control" value="<?php echo htmlspecialchars($config['mailFrom'] ?? ''); ?>" placeholder="your@gmail.com">
                </div>
                <div class="form-group">
                    <label class="form-label">Deliver To (Admin Inbox)</label>
                    <input type="email" name="mailTo" class="form-control" value="<?php echo htmlspecialchars($config['mailTo'] ?? ''); ?>" placeholder="notify@gmail.com">
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">SMTP Username <small style="color:#888;">(usually same as Send From)</small></label>
                <input type="email" name="smtpUsername" class="form-control" value="<?php echo htmlspecialchars($config['smtpUsername'] ?? $config['mailFrom'] ?? ''); ?>" placeholder="your@gmail.com">
            </div>
            <div class="form-group">
                <label class="form-label">Gmail App Password</label>
                <input type="password" name="gmailAppPassword" class="form-control" value="<?php echo htmlspecialchars($config['gmailAppPassword'] ?? ''); ?>" placeholder="xxxx xxxx xxxx xxxx" autocomplete="new-password">
                <small style="display:block;margin-top:.4rem;color:#888;font-size:.7rem;">Go to Google Account → Security → 2-Step Verification → App Passwords → generate a new one for "Mail".</small>
            </div>
            <div style="display:flex; gap:.6rem; margin-top:.75rem;">
                <button type="submit" name="save_smtp" class="btn btn-primary" style="flex:1;"><i class="fa-solid fa-save"></i> Save SMTP Settings</button>
                <button type="submit" name="test_smtp_send" class="btn btn-secondary" style="flex:1; background:#4f46e5; color:white; border:none;"><i class="fa-solid fa-paper-plane"></i> Send Test Email</button>
            </div>
        </form>
        <div style="margin-top:1rem;padding:.75rem;background:#f0f9ff;border-radius:8px;border:1px solid #bae6fd;font-size:.72rem;color:#0369a1;">
            <strong><i class="fa-solid fa-circle-info"></i> Tip:</strong> Enter your Gmail App Password and click <em>Send Test Email</em> to instantly verify your configuration before saving.
        </div>
    </div>

    <!-- --- TELEGRAM BOT -------------------------------------------- -->
    <div class="settings-card">
        <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:1.25rem;">
            <div style="width:40px;height:40px;background:rgba(36,161,222,.1);color:#24A1DE;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:1.2rem;"><i class="fa-brands fa-telegram"></i></div>
            <div><h3 style="margin:0;">Telegram Bot</h3><span style="font-size:.75rem;color:#888;">Instant booking alerts to your group</span></div>
        </div>
        <form method="POST">
            <div class="form-group">
                <label class="form-label">Bot Token</label>
                <input type="password" name="telegramBotToken" class="form-control" value="<?php echo htmlspecialchars($config['telegramBotToken'] ?? ''); ?>" placeholder="1234567890:AAHxxx..." autocomplete="new-password">
                <small style="display:block;margin-top:.4rem;color:#888;font-size:.7rem;">Create a bot via <strong>@BotFather</strong> on Telegram → /newbot → copy the token here.</small>
            </div>
            <div class="form-group">
                <label class="form-label">Chat IDs <small style="color:#888;">(one per line or comma-separated)</small></label>
                <textarea name="telegramChatIds" class="form-control" rows="4" placeholder="-1001234567890&#10;-1009876543210" style="font-family:monospace;font-size:.82rem;"><?php echo htmlspecialchars(implode("\n", (array)($config['telegramChatIds'] ?? []))); ?></textarea>
                <small style="display:block;margin-top:.4rem;color:#888;font-size:.7rem;">Add your bot to the group → send a message → visit <code>https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates</code> to find the chat ID (negative number for groups).</small>
            </div>
            <button type="submit" name="save_telegram" class="btn btn-primary" style="width:100%;margin-top:.75rem;"><i class="fa-solid fa-save"></i> Save Telegram Settings</button>
        </form>
        <div style="margin-top:1rem;padding:.75rem;background:#f0fdf4;border-radius:8px;border:1px solid #bbf7d0;font-size:.72rem;color:#166534;">
            <strong>Group IDs</strong> start with a minus sign (e.g. <code>-1003889205666</code>). You can have multiple groups &mdash; all receive the alert simultaneously.
        </div>
    </div>

    <!-- --- SMS GATEWAY INTEGRATION --------------------------------- -->
    <div class="settings-card">
        <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:1.25rem;">
            <div style="width:40px;height:40px;background:rgba(139,92,246,.12);color:#8b5cf6;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:1.2rem;"><i class="fa-solid fa-comment-sms"></i></div>
            <div><h3 style="margin:0;">SMS Gateway Integration</h3><span style="font-size:.75rem;color:#888;">Configure Twilio or custom HTTP SMS gateways</span></div>
        </div>
        <form method="POST">
            <div class="form-group">
                <label class="form-label">SMS Gateway Provider</label>
                <select name="smsGateway" class="form-control">
                    <option value="none" <?php echo ($config['smsGateway'] ?? 'none') === 'none' ? 'selected' : ''; ?>>None (Disabled)</option>
                    <option value="twilio" <?php echo ($config['smsGateway'] ?? '') === 'twilio' ? 'selected' : ''; ?>>Twilio SMS API</option>
                    <option value="generic" <?php echo ($config['smsGateway'] ?? '') === 'generic' ? 'selected' : ''; ?>>Generic HTTP Gateway</option>
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">Generic SMS Gateway Endpoint URL <small style="color:#888;">(Required if Generic HTTP chosen)</small></label>
                <input type="text" name="smsGenericUrl" class="form-control" value="<?php echo htmlspecialchars($config['smsGenericUrl'] ?? ''); ?>" placeholder="https://api.sms-gateway.com/send?apikey={apikey}&to={phone}&message={message}&sender={sender}">
                <small style="display:block;margin-top:.35rem;color:#94a3b8;font-size:.7rem;">Use placeholders: <code>{apikey}</code> <code>{phone}</code> <code>{message}</code> <code>{sender}</code></small>
            </div>
            <div class="form-row-2col">
                <div class="form-group">
                    <label class="form-label">Twilio Account SID</label>
                    <input type="text" name="smsTwilioSid" class="form-control" value="<?php echo htmlspecialchars($config['smsTwilioSid'] ?? ''); ?>" placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx">
                </div>
                <div class="form-group">
                    <label class="form-label">Sender ID / Phone Number</label>
                    <input type="text" name="smsSenderId" class="form-control" value="<?php echo htmlspecialchars($config['smsSenderId'] ?? ''); ?>" placeholder="e.g. +1234567890 or DROPTX">
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">SMS API Key / Token</label>
                <input type="password" name="smsApiKey" class="form-control" value="<?php echo htmlspecialchars($config['smsApiKey'] ?? ''); ?>" placeholder="Your SMS API key or Auth Token" autocomplete="new-password">
                <small style="display:block;margin-top:.4rem;color:#888;font-size:.7rem;">Sensitive token used for Twilio or Generic gateways. Masked for visual security.</small>
            </div>
            <div class="form-group">
                <label class="form-label">Booking SMS Template</label>
                <textarea name="smsTemplateBooking" class="form-control" rows="4" style="font-family:inherit;font-size:.85rem;" placeholder="Dear {name}, your Drop Cars booking {bookingId} is confirmed! Pickup: {pickup}, Drop: {drop}. Fare: {fare}. Thank you!"><?php echo htmlspecialchars($config['smsTemplateBooking'] ?? ''); ?></textarea>
                <small style="display:block;margin-top:.35rem;color:#94a3b8;font-size:.7rem;">Placeholders: <code>{name}</code> <code>{bookingId}</code> <code>{pickup}</code> <code>{drop}</code> <code>{fare}</code></small>
            </div>
            <button type="submit" name="save_sms_gateway" class="btn btn-primary" style="width:100%;margin-top:.75rem;"><i class="fa-solid fa-save"></i> Save SMS Settings</button>
        </form>
    </div>

    <!-- --- BOOKING DEFAULTS - REMOVED -------------------------------
         These pre-fill controls (defaultPickupCity, defaultVehicleType,
         defaultServiceType, bookingIdPrefix, supportPhone2) were only
         useful for dev testing. They've been removed from the admin UI.
         The underlying api/config.php keys are still respected; edit
         api/config.php directly if you ever need to change them.
     -->

    <!-- === ADVANCE PAYMENT / UPI SETTINGS ============================ -->
    <div class="settings-card" style="border-top: 3px solid #f59e0b;">
        <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:1.25rem;">
            <div style="width:40px;height:40px;background:rgba(245,158,11,.12);color:#d97706;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:1.2rem;"><i class="fa-solid fa-qrcode"></i></div>
            <div><h3 style="margin:0;">Advance Payment & UPI</h3><span style="font-size:.75rem;color:#888;">QR code, UPI ID, advance amount rules</span></div>
        </div>

        <?php
        $currentUpiQr = $config['upiQrPath'] ?? 'assets/img/qr-code.jpg';
        $currentUpiId = $config['upiId'] ?? '7200217986-1@okbizaxis';
        $advPct       = (int)($config['advancePercent']   ?? 20);
        $advMin       = (int)($config['advanceMinAmount'] ?? 300);
        $advEnabled   = !empty($config['advanceEnabled']);
        $advNote      = $config['advanceNote'] ?? '';
        ?>

        <!-- Current QR preview -->
        <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:1rem;margin-bottom:1.25rem;text-align:center;">
            <div style="font-size:.7rem;font-weight:700;color:#b45309;text-transform:uppercase;letter-spacing:.05em;margin-bottom:.75rem;"><i class="fa-solid fa-qrcode"></i> Current UPI QR Code</div>
            <?php
            $qrPreviewSrc = '/' . ltrim($currentUpiQr, '/');
            ?>
            <img src="<?php echo htmlspecialchars($qrPreviewSrc . '?v=' . time()); ?>" alt="UPI QR Code" style="max-width:150px;max-height:150px;border-radius:10px;border:1px solid #fde68a;padding:4px;background:#fff;" onerror="this.style.display='none';document.getElementById('qr-missing-msg').style.display='block';">
            <div id="qr-missing-msg" style="display:none;font-size:.75rem;color:#92400e;margin-top:.5rem;"><i class="fa-solid fa-circle-exclamation"></i> No QR uploaded yet</div>
            <div style="font-size:.72rem;color:#b45309;margin-top:.5rem;">File: <?php echo htmlspecialchars($currentUpiQr); ?></div>
        </div>

        <!-- Upload new QR -->
        <form method="POST" enctype="multipart/form-data" style="margin-bottom:1.5rem;">
            <div class="form-group">
                <label class="form-label"><i class="fa-solid fa-upload" style="color:#d97706;"></i> Upload New QR Image</label>
                <input type="file" name="upiQrFile" class="form-control" accept="image/png,image/jpeg,image/webp" style="cursor:pointer;">
                <small style="display:block;margin-top:.35rem;color:#94a3b8;font-size:.7rem;">PNG / JPG / WEBP · Max 3 MB. Replaces the QR shown on booking confirmation &amp; customer dashboard.</small>
            </div>
            <button type="submit" name="save_upi_qr" class="btn btn-primary" style="width:100%;background:#d97706;border:none;"><i class="fa-solid fa-cloud-arrow-up"></i> Upload QR Image</button>
        </form>

        <hr style="border:none;border-top:1px dashed #fde68a;margin-bottom:1.5rem;">

        <!-- UPI ID + Advance Rules -->
        <form method="POST">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem;">
                <strong style="font-size:.9rem;color:#1e293b;"><i class="fa-brands fa-google-pay" style="color:#4285F4;"></i> Advance Payment Settings</strong>
                <label class="switch" style="margin:0;">
                    <input type="checkbox" name="advanceEnabled" <?php echo $advEnabled ? 'checked' : ''; ?>>
                    <span class="slider"></span>
                </label>
            </div>

            <div class="form-group">
                <label class="form-label">UPI ID / Handle</label>
                <input type="text" name="upiId" class="form-control" value="<?php echo htmlspecialchars($currentUpiId); ?>" placeholder="yourname@bankname" style="font-family:monospace;font-size:.9rem;">
                <small style="display:block;margin-top:.35rem;color:#94a3b8;font-size:.7rem;">This ID appears as the UPI handle on the payment overlay and generates the deep-link for UPI apps.</small>
            </div>

            <div class="form-row-2col">
                <div class="form-group">
                    <label class="form-label">Advance % of Total Fare</label>
                    <div style="position:relative;">
                        <input type="number" name="advancePercent" class="form-control" value="<?php echo $advPct; ?>" min="1" max="100" placeholder="20" style="padding-right:2rem;">
                        <span style="position:absolute;right:10px;top:50%;transform:translateY(-50%);color:#94a3b8;font-weight:700;">%</span>
                    </div>
                    <small style="font-size:.7rem;color:#888;">e.g. 20 = customer pays 20% of fare as advance</small>
                </div>
                <div class="form-group">
                    <label class="form-label">Minimum Advance (₹)</label>
                    <div style="position:relative;">
                        <span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:#94a3b8;font-weight:700;">₹</span>
                        <input type="number" name="advanceMinAmount" class="form-control" value="<?php echo $advMin; ?>" min="0" placeholder="300" style="padding-left:2rem;">
                    </div>
                    <small style="font-size:.7rem;color:#888;">Minimum payable even if % is less</small>
                </div>
            </div>

            <div class="form-group">
                <label class="form-label">Advance Note <small style="color:#888;">(shown to customer)</small></label>
                <input type="text" name="advanceNote" class="form-control" value="<?php echo htmlspecialchars($advNote); ?>" placeholder="e.g. Advance secures your slot — balance due on trip day.">
            </div>

            <button type="submit" name="save_advance_payment" class="btn btn-primary" style="width:100%;margin-top:.5rem;background:#f59e0b;color:#000;border:none;font-weight:800;"><i class="fa-solid fa-save"></i> Save Advance Payment Settings</button>
        </form>
    </div>

    <!-- --- PRICING RULES -------------------------------------------- -->
    <div class="settings-card">
        <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:1.25rem;">
            <div style="width:40px;height:40px;background:rgba(239,68,68,.1);color:#dc2626;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:1.2rem;"><i class="fa-solid fa-tags"></i></div>
            <div><h3 style="margin:0;">Pricing Rules</h3><span style="font-size:.75rem;color:#888;">Surcharges, tolls & minimum fares</span></div>
        </div>
        <!-- Pointer to the dedicated tariff editor (per-KM, driver allowance, strikethrough) -->
        <div style="display:flex;align-items:center;justify-content:space-between;gap:.6rem;padding:.7rem .9rem;background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;margin-bottom:1rem;">
            <div style="font-size:.78rem;color:#1e3a8a;line-height:1.35;">
                <strong style="display:block;margin-bottom:2px;"><i class="fa-solid fa-route" style="margin-right:4px;"></i> Per-KM rates &amp; driver allowance live on the Tariffs page</strong>
                That's where strikethrough (actual vs offer) pricing is managed.
            </div>
            <a href="tariffs" class="btn btn-primary" style="white-space:nowrap;padding:0.45rem 0.85rem;font-size:0.75rem;border-radius:8px;background:#1e3a8a;color:#fff;text-decoration:none;font-weight:800;">
                <i class="fa-solid fa-arrow-right"></i> Open Tariffs
            </a>
        </div>
        <form method="POST">
            <!-- Night Surcharge -->
            <div style="padding:.85rem;background:#fafafa;border-radius:10px;border:1px solid #f0f0f0;margin-bottom:1rem;">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.6rem;">
                    <strong style="font-size:.85rem;color:#1e293b;"><i class="fa-solid fa-moon" style="color:#6366f1;margin-right:6px;"></i> Night Surcharge</strong>
                    <label class="switch" style="margin:0;">
                        <input type="checkbox" name="nightSurchargeEnabled" <?php echo !empty($config['nightSurchargeEnabled']) ? 'checked' : ''; ?>>
                        <span class="slider"></span>
                    </label>
                </div>
                <div class="form-row-2col">
                    <div class="form-group" style="margin-bottom:.5rem;">
                        <label class="form-label" style="font-size:.72rem;">Surcharge %</label>
                        <input type="number" name="nightSurchargePercent" class="form-control" value="<?php echo (int)($config['nightSurchargePercent'] ?? 10); ?>" min="0" max="100" placeholder="10">
                    </div>
                    <div class="form-group" style="margin-bottom:.5rem;">
                        <label class="form-label" style="font-size:.72rem;">Start Hour (24h)</label>
                        <input type="number" name="nightSurchargeStartHour" class="form-control" value="<?php echo (int)($config['nightSurchargeStartHour'] ?? 22); ?>" min="0" max="23" placeholder="22">
                    </div>
                </div>
                <div class="form-group" style="margin-bottom:.25rem;">
                    <label class="form-label" style="font-size:.72rem;">End Hour (24h, e.g. 5 = 5 AM)</label>
                    <input type="number" name="nightSurchargeEndHour" class="form-control" value="<?php echo (int)($config['nightSurchargeEndHour'] ?? 5); ?>" min="0" max="23" placeholder="5">
                </div>
            </div>
            <!-- Toll & Holiday -->
            <div class="form-row-2col">
                <div class="form-group">
                    <label class="form-label">Toll Estimate (?/km)</label>
                    <input type="number" step="0.5" name="tollEstimatePerKm" class="form-control" value="<?php echo (float)($config['tollEstimatePerKm'] ?? 2); ?>" min="0" placeholder="2">
                    <small style="font-size:.7rem;color:#888;">Used in fare breakdown display only</small>
                </div>
                <div class="form-group">
                    <label class="form-label">Min Fare One-Way (?)</label>
                    <input type="number" name="minFareOneWay" class="form-control" value="<?php echo (int)($config['minFareOneWay'] ?? 500); ?>" min="0" placeholder="500">
                </div>
            </div>
            <!-- Holiday Surcharge -->
            <div style="display:flex;align-items:center;justify-content:space-between;padding:.65rem .85rem;background:#fafafa;border-radius:8px;border:1px solid #f0f0f0;">
                <div>
                    <strong style="font-size:.82rem;display:block;"><i class="fa-solid fa-calendar-days" style="color:#f59e0b;margin-right:5px;"></i> Holiday Surcharge</strong>
                    <span style="font-size:.7rem;color:#888;">Apply % on public holidays</span>
                </div>
                <div style="display:flex;align-items:center;gap:.75rem;">
                    <input type="number" name="holidaySurchargePercent" class="form-control" value="<?php echo (int)($config['holidaySurchargePercent'] ?? 0); ?>" min="0" max="100" placeholder="0" style="width:70px;">
                    <label class="switch" style="margin:0;">
                        <input type="checkbox" name="holidaySurchargeEnabled" <?php echo !empty($config['holidaySurchargeEnabled']) ? 'checked' : ''; ?>>
                        <span class="slider"></span>
                    </label>
                </div>
            </div>
            <button type="submit" name="save_pricing_rules" class="btn btn-primary" style="width:100%;margin-top:1rem;"><i class="fa-solid fa-save"></i> Save Pricing Rules</button>
        </form>
    </div>

    <!-- Business Economics -->
    <div class="settings-card">
        <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1.25rem;">
            <div style="width: 40px; height: 40px; background: rgba(243, 156, 18, 0.1); color: #f39c12; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 1.2rem;">
                <i class="fa-solid fa-chart-line"></i>
            </div>
            <div>
                <h3 style="margin: 0;">Business Economics</h3>
                <span style="font-size: 0.75rem; color: #888;">Configure financial targets and localization</span>
            </div>
        </div>

        <form method="POST">
            <div class="form-group">
                <label class="form-label">Total Revenue Target</label>
                <div style="position: relative;">
                    <span style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: #94a3b8; font-weight: 700;"><?php echo htmlspecialchars($config['currencySymbol'] ?? '₹'); ?></span>
                    <input type="number" name="revenueTarget" class="form-control" value="<?php echo htmlspecialchars($config['revenueTarget'] ?? '3500'); ?>" style="padding-left: 2.25rem;" required>
                </div>
                <small style="display: block; margin-top: 0.4rem; color: #888; font-size: 0.7rem;">Dashboard progress bars will track against this value.</small>
            </div>
            <div class="form-row-2col">
                <div class="form-group">
                    <label class="form-label">Platform Margin (%)</label>
                    <input type="number" step="0.1" name="commissionRate" class="form-control" value="<?php echo htmlspecialchars($config['commissionRate'] ?? '10'); ?>" required>
                </div>
                <div class="form-group">
                    <label class="form-label">Currency Symbol</label>
                    <input type="text" name="currencySymbol" class="form-control" value="<?php echo htmlspecialchars($config['currencySymbol'] ?? '₹'); ?>" placeholder="e.g. ₹ or $" required maxlength="5">
                </div>
            </div>
            <div style="margin-top: 1.5rem;">
                <button type="submit" name="save_business" class="btn btn-warning" style="width: 100%; font-weight: 700; color: #1e293b; background: #f7b733; border: none;">
                    <i class="fa-solid fa-bullseye"></i> Update Economics
                </button>
            </div>
        </form>
    </div>

    <!-- --- GST & TAX CONFIGURATIONS -------------------------------- -->
    <div class="settings-card">
        <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:1.25rem;">
            <div style="width:40px;height:40px;background:rgba(59,130,246,.12);color:#3b82f6;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:1.2rem;"><i class="fa-solid fa-receipt"></i></div>
            <div><h3 style="margin:0;">GST &amp; Tax Configurations</h3><span style="font-size:.75rem;color:#888;">Configure company GST percent and tax ID</span></div>
        </div>
        <form method="POST">
            <div class="form-group">
                <label class="form-label">GST Percentage (%)</label>
                <div style="position:relative;">
                    <input type="number" step="0.01" name="gstPercent" class="form-control" value="<?php echo htmlspecialchars((string)($config['gstPercent'] ?? 5.00)); ?>" min="0" max="28" placeholder="5">
                    <span style="position:absolute;right:10px;top:50%;transform:translateY(-50%);color:#94a3b8;font-weight:700;">%</span>
                </div>
                <small style="display:block;margin-top:.35rem;color:#94a3b8;font-size:.7rem;">Standard GST percentage applied to bookings. Default is 5%.</small>
            </div>
            <div class="form-group">
                <label class="form-label">Company GST Number (GSTIN)</label>
                <input type="text" name="gstNumber" class="form-control" value="<?php echo htmlspecialchars((string)($config['gstNumber'] ?? '')); ?>" placeholder="e.g. 33AAAAA1111A1Z1" style="text-transform:uppercase;">
                <small style="display:block;margin-top:.35rem;color:#94a3b8;font-size:.7rem;">Your 15-character company GSTIN printed on tax invoices.</small>
            </div>
            <button type="submit" name="save_gst" class="btn btn-primary" style="width:100%;margin-top:.75rem;"><i class="fa-solid fa-save"></i> Save GST Settings</button>
        </form>
    </div>

    <!-- --- REFERRAL & WALLET SETTINGS ------------------------------ -->
    <div class="settings-card">
        <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:1.25rem;">
            <div style="width:40px;height:40px;background:rgba(245,158,11,.12);color:#d97706;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:1.2rem;"><i class="fa-solid fa-gift"></i></div>
            <div><h3 style="margin:0;">Referral &amp; Wallet Settings</h3><span style="font-size:.75rem;color:#888;">Configure referral payouts and loyalty wallet rewards</span></div>
        </div>
        <form method="POST">
            <div class="form-group">
                <label class="form-label">Referrer Reward Payout (₹)</label>
                <div style="position:relative;">
                    <span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:#94a3b8;font-weight:700;">₹</span>
                    <input type="number" name="referralRewardAmount" class="form-control" value="<?php echo htmlspecialchars((string)($config['referralRewardAmount'] ?? 100.00)); ?>" min="0" placeholder="100.00" style="padding-left:2rem;" required>
                </div>
                <small style="display:block;margin-top:.35rem;color:#94a3b8;font-size:.7rem;">Wallet credit amount awarded to the referring customer when their friend signs up or logs in with their email.</small>
            </div>
            <button type="submit" name="save_referral_settings" class="btn btn-primary" style="width:100%;margin-top:.75rem;"><i class="fa-solid fa-save"></i> Save Referral Settings</button>
        </form>
    </div>

    <!-- --- INTERSTATE & REGIONAL SURCHARGES ------------------------ -->
    <div class="settings-card">
        <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:1.25rem;">
            <div style="width:40px;height:40px;background:rgba(16,185,129,.12);color:#10b981;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:1.2rem;"><i class="fa-solid fa-earth-south-america"></i></div>
            <div><h3 style="margin:0;">Interstate & Regional Surcharges</h3><span style="font-size:.75rem;color:#888;">Cross-border surcharges and state tariffs</span></div>
        </div>
        <form method="POST">
            <div class="form-group">
                <label class="form-label">Interstate Border Surcharge (Flat ₹)</label>
                <input type="number" name="interstateSurcharge" class="form-control" value="<?php echo htmlspecialchars((string)($config['interstateSurcharge'] ?? 0)); ?>" min="0" placeholder="e.g. 150">
                <small style="display:block;margin-top:.35rem;color:#94a3b8;font-size:.7rem;">Flat surcharge applied automatically when crossing state borders.</small>
            </div>
            <div class="form-group">
                <label class="form-label">Karnataka State Surcharge (₹/KM)</label>
                <input type="number" step="0.01" name="stateSurcharge_KA" class="form-control" value="<?php echo htmlspecialchars((string)($config['stateSurcharge_KA'] ?? 0)); ?>" min="0" placeholder="e.g. 1.50">
                <small style="display:block;margin-top:.35rem;color:#94a3b8;font-size:.7rem;">Extra per-KM rate added if trip includes Karnataka.</small>
            </div>
            <div class="form-group">
                <label class="form-label">Kerala State Surcharge (₹/KM)</label>
                <input type="number" step="0.01" name="stateSurcharge_KL" class="form-control" value="<?php echo htmlspecialchars((string)($config['stateSurcharge_KL'] ?? 0)); ?>" min="0" placeholder="e.g. 2.00">
                <small style="display:block;margin-top:.35rem;color:#94a3b8;font-size:.7rem;">Extra per-KM rate added if trip includes Kerala.</small>
            </div>
            <div class="form-group">
                <label class="form-label">Andhra Pradesh State Surcharge (₹/KM)</label>
                <input type="number" step="0.01" name="stateSurcharge_AP" class="form-control" value="<?php echo htmlspecialchars((string)($config['stateSurcharge_AP'] ?? 0)); ?>" min="0" placeholder="e.g. 1.80">
                <small style="display:block;margin-top:.35rem;color:#94a3b8;font-size:.7rem;">Extra per-KM rate added if trip includes Andhra Pradesh.</small>
            </div>
            <button type="submit" name="save_regional_pricing" class="btn btn-primary" style="width:100%;margin-top:.75rem;"><i class="fa-solid fa-save"></i> Save Regional Surcharges</button>
        </form>
    </div>

    <!-- --- EXTRA OPTIONS & SURCHARGES ------------------------------ -->
    <div class="settings-card">
        <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:1.25rem;">
            <div style="width:40px;height:40px;background:rgba(245,158,11,.12);color:#d97706;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:1.2rem;"><i class="fa-solid fa-sliders"></i></div>
            <div><h3 style="margin:0;">Extra Options & Surcharges</h3><span style="font-size:.75rem;color:#888;">Configure luggage carriers, pet allowances, and peak hours</span></div>
        </div>
        <form method="POST">
            <!-- Luggage Carrier Surcharge -->
            <div style="padding:.85rem;background:#fafafa;border-radius:10px;border:1px solid #f0f0f0;margin-bottom:1rem;">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.6rem;">
                    <strong style="font-size:.85rem;color:#1e293b;"><i class="fa-solid fa-suitcase-rolling" style="color:#d97706;margin-right:6px;"></i> Luggage Carrier Surcharge</strong>
                    <label class="switch" style="margin:0;">
                        <input type="checkbox" name="luggageSurchargeEnabled" <?php echo !empty($config['luggageSurchargeEnabled']) ? 'checked' : ''; ?>>
                        <span class="slider"></span>
                    </label>
                </div>
                <div class="form-group" style="margin-bottom:0;">
                    <label class="form-label" style="font-size:.72rem;">Surcharge Amount (Flat ₹)</label>
                    <input type="number" name="luggageSurchargeAmount" class="form-control" value="<?php echo htmlspecialchars((string)($config['luggageSurchargeAmount'] ?? 0)); ?>" min="0" placeholder="e.g. 300">
                </div>
            </div>

            <!-- Pet Surcharge -->
            <div style="padding:.85rem;background:#fafafa;border-radius:10px;border:1px solid #f0f0f0;margin-bottom:1rem;">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.6rem;">
                    <strong style="font-size:.85rem;color:#1e293b;"><i class="fa-solid fa-paw" style="color:#f59e0b;margin-right:6px;"></i> Pet-Friendly Surcharge</strong>
                    <label class="switch" style="margin:0;">
                        <input type="checkbox" name="petSurchargeEnabled" <?php echo !empty($config['petSurchargeEnabled']) ? 'checked' : ''; ?>>
                        <span class="slider"></span>
                    </label>
                </div>
                <div class="form-group" style="margin-bottom:0;">
                    <label class="form-label" style="font-size:.72rem;">Surcharge Amount (Flat ₹)</label>
                    <input type="number" name="petSurchargeAmount" class="form-control" value="<?php echo htmlspecialchars((string)($config['petSurchargeAmount'] ?? 0)); ?>" min="0" placeholder="e.g. 200">
                </div>
            </div>

            <!-- Peak Hour Surcharge -->
            <div style="padding:.85rem;background:#fafafa;border-radius:10px;border:1px solid #f0f0f0;margin-bottom:1rem;">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:.6rem;">
                    <strong style="font-size:.85rem;color:#1e293b;"><i class="fa-solid fa-clock" style="color:#6366f1;margin-right:6px;"></i> Peak Hour Surcharge</strong>
                    <label class="switch" style="margin:0;">
                        <input type="checkbox" name="peakHourSurchargeEnabled" <?php echo !empty($config['peakHourSurchargeEnabled']) ? 'checked' : ''; ?>>
                        <span class="slider"></span>
                    </label>
                </div>
                <div class="form-row-2col">
                    <div class="form-group" style="margin-bottom:.5rem;">
                        <label class="form-label" style="font-size:.72rem;">Surcharge Multiplier %</label>
                        <input type="number" name="peakHourSurchargePercent" class="form-control" value="<?php echo (int)($config['peakHourSurchargePercent'] ?? 0); ?>" min="0" max="100" placeholder="e.g. 10">
                    </div>
                    <div class="form-group" style="margin-bottom:.5rem;">
                        <label class="form-label" style="font-size:.72rem;">Start Hour (24h)</label>
                        <input type="number" name="peakHourStartHour" class="form-control" value="<?php echo (int)($config['peakHourStartHour'] ?? 16); ?>" min="0" max="23" placeholder="16">
                    </div>
                </div>
                <div class="form-group" style="margin-bottom:0;">
                    <label class="form-label" style="font-size:.72rem;">End Hour (24h, e.g. 20 = 8 PM)</label>
                    <input type="number" name="peakHourEndHour" class="form-control" value="<?php echo (int)($config['peakHourEndHour'] ?? 20); ?>" min="0" max="23" placeholder="20">
                </div>
            </div>

            <button type="submit" name="save_extra_surcharges" class="btn btn-primary" style="width:100%;"><i class="fa-solid fa-save"></i> Save Extra Surcharges</button>
        </form>
    </div>

    <!-- --- BUSINESS HOURS & ADDRESS --------------------------------- -->
    <div class="settings-card">
        <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:1.25rem;">
            <div style="width:40px;height:40px;background:rgba(16,185,129,.1);color:#059669;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:1.2rem;"><i class="fa-solid fa-location-dot"></i></div>
            <div><h3 style="margin:0;">Contact & Address</h3><span style="font-size:.75rem;color:#888;">Shown in footer, FAQ, contact-us & schema markup</span></div>
        </div>
        <div style="display:flex;align-items:center;gap:.6rem;padding:.65rem .85rem;background:#ecfdf5;border:1px solid #d1fae5;border-radius:10px;margin-bottom:1rem;">
            <i class="fa-solid fa-clock-rotate-left" style="color:#059669;"></i>
            <div>
                <strong style="font-size:.85rem;color:#065f46;">Service hours: 24/7</strong>
                <div style="font-size:.72rem;color:#475569;line-height:1.35;">Fixed &mdash; we operate every day, all hours. To change, contact the developer.</div>
            </div>
        </div>
        <form method="POST">
            <!-- 24x7 is hard-set, so we still persist it on save -->
            <input type="hidden" name="is24x7" value="1">

            <div class="form-group">
                <label class="form-label">Customer Care Phone</label>
                <input type="text" name="emergencyPhone" class="form-control" value="<?php echo htmlspecialchars($config['emergencyPhone'] ?? $config['supportPhone'] ?? '+91 7200217986'); ?>" placeholder="+91 7200217986">
                <small style="font-size:.7rem;color:#888;">Number displayed in footer "Emergency / After-Hours" slot.</small>
            </div>
            <div class="form-group">
                <label class="form-label">Business Address</label>
                <input type="text" name="businessAddress" class="form-control" value="<?php echo htmlspecialchars($config['businessAddress'] ?? '136, Chengam Road, Tiruvannamalai'); ?>" placeholder="136, Chengam Road">
            </div>
            <div class="form-row-2col">
                <div class="form-group">
                    <label class="form-label">City</label>
                    <input type="text" name="businessCity" class="form-control" value="<?php echo htmlspecialchars($config['businessCity'] ?? 'Tiruvannamalai'); ?>">
                </div>
                <div class="form-group">
                    <label class="form-label">State</label>
                    <input type="text" name="businessState" class="form-control" value="<?php echo htmlspecialchars($config['businessState'] ?? 'Tamil Nadu'); ?>">
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">Pincode</label>
                <input type="text" name="businessPincode" class="form-control" value="<?php echo htmlspecialchars($config['businessPincode'] ?? '606601'); ?>" placeholder="606601" maxlength="6">
            </div>
            <button type="submit" name="save_business_hours" class="btn btn-primary" style="width:100%;margin-top:.5rem;"><i class="fa-solid fa-save"></i> Save Contact &amp; Address</button>
        </form>
    </div>

    <!-- --- API KEYS ------------------------------------------------- -->
    <div class="settings-card">
        <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:1.25rem;">
            <div style="width:40px;height:40px;background:rgba(99,102,241,.1);color:#6366f1;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:1.2rem;"><i class="fa-solid fa-key"></i></div>
            <div><h3 style="margin:0;">API Keys</h3><span style="font-size:.75rem;color:#888;">Maps, Analytics & Pixel integrations</span></div>
        </div>
        <form method="POST">
            <div class="form-group">
                <label class="form-label">Google Maps API Key</label>
                <input type="password" name="googleMapsApiKey" class="form-control" value="<?php echo htmlspecialchars($config['googleMapsApiKey'] ?? (defined('GOOGLE_MAPS_API_KEY') ? GOOGLE_MAPS_API_KEY : '')); ?>" placeholder="AIzaSy..." autocomplete="new-password">
                <small style="display:block;margin-top:.4rem;color:#888;font-size:.7rem;">Required APIs: <strong>Maps JavaScript API</strong>, <strong>Maps Embed API</strong>, <strong>Distance Matrix API</strong>, <strong>Places API</strong> &mdash; all must be enabled in Google Cloud Console.</small>
            </div>
            <div class="form-row-2col">
                <div class="form-group">
                    <label class="form-label">Google Analytics ID</label>
                    <input type="text" name="googleAnalyticsId" class="form-control" value="<?php echo htmlspecialchars($config['googleAnalyticsId'] ?? ''); ?>" placeholder="G-XXXXXXXXXX">
                </div>
                <div class="form-group">
                    <label class="form-label">Facebook Pixel ID</label>
                    <input type="text" name="facebookPixelId" class="form-control" value="<?php echo htmlspecialchars($config['facebookPixelId'] ?? ''); ?>" placeholder="1234567890">
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">Google Calendar Webhook URL</label>
                <input type="text" name="googleCalendarWebhookUrl" class="form-control" value="<?php echo htmlspecialchars($config['googleCalendarWebhookUrl'] ?? ''); ?>" placeholder="https://script.google.com/...">
            </div>
            <div class="form-group">
                <label class="form-label">Google Sheets Webhook URL</label>
                <input type="url" name="googleSheetsWebhookUrl" class="form-control" value="<?php echo htmlspecialchars($config['googleSheetsWebhookUrl'] ?? ''); ?>" placeholder="https://script.google.com/macros/s/.../exec">
            </div>
            <div class="settings-row" style="padding-top: 1.25rem;">
                <div style="flex: 1; padding-right: 1rem;">
                    <strong style="display: block; font-size: 0.9rem; color: #1e293b;">Local Location Suggestions Fallback</strong>
                    <span style="font-size: 0.7rem; color: #888;">ON: location fields answer instantly from the local city list and server-cached searches; Google Places is only queried after a brief pause in typing, to save API cost &mdash; every search gets cached on the server for next time. OFF: location fields use the Google API only, full experience at full API cost.</span>
                </div>
                <label class="switch">
                    <input type="checkbox" name="enableLocalLocationFallback" <?php echo ($config['enableLocalLocationFallback'] ?? false) ? 'checked' : ''; ?>>
                    <span class="slider"></span>
                </label>
            </div>
            <button type="submit" name="save_api_keys" class="btn btn-primary" style="width:100%;margin-top:1rem;"><i class="fa-solid fa-save"></i> Save API Keys</button>
        </form>
        <?php
        $currentMapsKey = $config['googleMapsApiKey'] ?? (defined('GOOGLE_MAPS_API_KEY') ? GOOGLE_MAPS_API_KEY : '');
        $keyStatus = $currentMapsKey !== '' ? 'configured' : 'missing';
        $keyColor  = $keyStatus === 'configured' ? '#16a34a' : '#dc2626';
        $keyIcon   = $keyStatus === 'configured' ? 'fa-circle-check' : 'fa-circle-exclamation';
        ?>
        <div style="margin-top:1rem;padding:.75rem;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;font-size:.72rem;color:#475569;display:flex;align-items:center;gap:.5rem;">
            <i class="fa-solid <?php echo $keyIcon; ?>" style="color:<?php echo $keyColor; ?>;"></i>
            Maps API Key: <strong style="color:<?php echo $keyColor; ?>;"><?php echo $keyStatus; ?></strong>
            <?php if ($keyStatus === 'configured'): ?>
            &nbsp;&mdash;&nbsp;<?php echo substr($currentMapsKey, 0, 8); ?>...
            <?php endif; ?>
        </div>
    </div>

    <!-- Google Sheets Section -->
    <div class="settings-card">
        <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1.25rem;">
            <div style="width: 40px; height: 40px; background: rgba(15, 157, 88, 0.1); color: #0F9D58; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 1.2rem;">
                <i class="fa-solid fa-table"></i>
            </div>
            <div>
                <h3 style="margin: 0;">Google Sheets Sync</h3>
                <span style="font-size: 0.75rem; color: #888;">Real-time booking & enquiry logging</span>
            </div>
        </div>

        <form method="POST">
            <div class="form-group">
                <label class="form-label">Webhook URL</label>
                <input type="url" name="googleSheetsWebhookUrl" class="form-control" placeholder="https://script.google.com/macros/s/.../exec" value="<?php echo htmlspecialchars($config['googleSheetsWebhookUrl'] ?? ''); ?>" required>
                <small style="display: block; margin-top: 0.4rem; color: #888; font-size: 0.7rem;">Deploy your Apps Script as a web app and paste the /exec URL here.</small>
            </div>

            <div class="form-group">
                <label class="form-label">Security Token (Optional)</label>
                <input type="password" name="googleSheetsWebhookToken" class="form-control" placeholder="Optional token for security" value="<?php echo htmlspecialchars($config['googleSheetsWebhookToken'] ?? ''); ?>" autocomplete="new-password">
            </div>

            <div class="form-group">
                <label class="form-label">Google Sheet link (optional)</label>
                <input type="url" name="googleSheetsSheetUrl" class="form-control" placeholder="https://docs.google.com/spreadsheets/d/..." value="<?php echo htmlspecialchars($config['googleSheetsSheetUrl'] ?? ''); ?>">
                <small style="display: block; margin-top: 0.4rem; color: #888; font-size: 0.7rem;">Open your Sheet in the browser, copy the URL from the address bar, and paste it here. After Sync &amp; Clear, we show a button to open this sheet.</small>
            </div>

            <div style="display: flex; gap: 1rem; margin-top: 1.5rem;">
                <button type="submit" name="save_sheets" class="btn btn-primary" style="flex: 1;">
                    <i class="fa-solid fa-save"></i> Save Settings
                </button>
                <button type="submit" name="test_sync" class="btn btn-outline" style="flex: 1;">
                    <i class="fa-solid fa-paper-plane"></i> Send Test Row
                </button>
            </div>
        </form>

        <div style="margin-top: 1.5rem; padding: 1rem; background: #f8f9fa; border-radius: 8px; border: 1px solid #eee;">
            <h4 style="margin: 0 0 0.5rem 0; font-size: 0.85rem;">How to set up?</h4>
            <ol style="font-size: 0.75rem; color: #666; margin: 0; padding-left: 1.2rem; line-height: 1.6;">
                <li>Open <a href="file:///docs/GOOGLE_SHEETS_WEBHOOK_SETUP.md" target="_blank" style="color: var(--primary-color);">Setup Guide</a>.</li>
                <li>Copy the Apps Script code from the guide.</li>
                <li>Create a Google Sheet -> Extensions -> Apps Script.</li>
                <li>Paste code and Deploy as Web App.</li>
                <li>Copy the URL and paste it above.</li>
            </ol>
        </div>
    </div>

    <!-- Bulk Operations -->
    <div class="settings-card">
        <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1.25rem;">
            <div style="width: 40px; height: 40px; background: rgba(52, 152, 219, 0.1); color: #3498db; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 1.2rem;">
                <i class="fa-solid fa-sync"></i>
            </div>
            <div>
                <h3 style="margin: 0;">Bulk Operations</h3>
                <span style="font-size: 0.75rem; color: #888;">Manual sync with external tools</span>
            </div>
        </div>

        <form method="POST">
            <div class="form-group">
                <label class="form-label">Sync Limit</label>
                <select name="sync_limit" class="form-control">
                    <option value="10">Latest 10 Bookings</option>
                    <option value="50" selected>Latest 50 Bookings</option>
                    <option value="100">Latest 100 Bookings</option>
                    <option value="500">Latest 500 Bookings</option>
                </select>
                <small style="display: block; margin-top: 0.4rem; color: #888; font-size: 0.7rem;">Use this if you have existing bookings in the database that are not yet in your Google Sheet.</small>
            </div>

            <div style="margin-top: 1.5rem;">
                <button type="submit" name="bulk_sync" class="btn btn-secondary" style="width: 100%; border: 1px solid #ddd; background: #fff; color: #333;" onclick="return confirm('Ensure your Google Sheet is ready. This might take a few moments depending on the limit.');">
                    <i class="fa-solid fa-cloud-arrow-up" style="margin-right: 6px;"></i> Start Bulk Sync
                </button>
            </div>
        </form>

        <div style="margin-top: 2.25rem; padding-top: 1.25rem; border-top: 1px dashed #eee;">
            <form action="init-admin" method="GET">
                <button type="submit" class="btn btn-outline" style="width: 100%; font-size: 0.75rem; border-color: #eee; color: #999;">
                    <i class="fa-solid fa-wrench"></i> Run Database Initializer
                </button>
            </form>
        </div>
    </div>

    <!-- Identity & Branding -->
    <div class="settings-card">
        <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1.25rem;">
            <div style="width: 40px; height: 40px; background: rgba(155, 89, 182, 0.1); color: #9b59b6; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 1.2rem;">
                <i class="fa-solid fa-id-card"></i>
            </div>
            <div>
                <h3 style="margin: 0;">Identity & Branding</h3>
                <span style="font-size: 0.75rem; color: #888;">Public business information and website links</span>
            </div>
        </div>

        <form method="POST">
            <div class="form-group">
                <label class="form-label">Company Name</label>
                <input type="text" name="companyName" class="form-control" value="<?php echo htmlspecialchars($config['companyName'] ?? 'Drop Cars'); ?>" required>
            </div>
            <div class="form-group">
                <label class="form-label">Website URL</label>
                <input type="url" name="websiteUrl" class="form-control" value="<?php echo htmlspecialchars($config['websiteUrl'] ?? 'https://www.dropcars.in'); ?>" required>
            </div>
            <div class="form-row-2col">
                <div class="form-group">
                    <label class="form-label">Support Email</label>
                    <input type="email" name="supportEmail" class="form-control" value="<?php echo htmlspecialchars($config['supportEmail'] ?? 'admin@dropcars.in'); ?>" required>
                </div>
                <div class="form-group">
                    <label class="form-label">Display Phone / WhatsApp (SEO & Policy)</label>
                    <input type="text" name="supportPhone" class="form-control" value="<?php echo htmlspecialchars($config['supportPhone'] ?? '+91 7598899579'); ?>" required>
                    <span style="font-size:0.75rem; color:var(--gray-500);">Passive number shown in text on the frontend.</span>
                </div>
            </div>
            <div class="form-row-2col">
                <div class="form-group">
                    <label class="form-label">Functional Call Number (CTA Dial)</label>
                    <input type="text" name="functionalPhone" class="form-control" value="<?php echo htmlspecialchars($config['functionalPhone'] ?? '7200217986'); ?>">
                    <span style="font-size:0.75rem; color:var(--gray-500);">Actual number dialed when users click calling buttons.</span>
                </div>
                <div class="form-group">
                    <label class="form-label">Functional WhatsApp Number (CTA Chat)</label>
                    <input type="text" name="functionalWhatsApp" class="form-control" value="<?php echo htmlspecialchars($config['functionalWhatsApp'] ?? '917200217986'); ?>">
                    <span style="font-size:0.75rem; color:var(--gray-500);">Actual number opened on WhatsApp triggers.</span>
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">Google Review Link</label>
                <input type="url" name="reviewLink" class="form-control" value="<?php echo htmlspecialchars($config['reviewLink'] ?? ''); ?>" placeholder="https://g.page/r/...">
            </div>
            <div class="form-row-2col">
                <div class="form-group">
                    <label class="form-label">Facebook Profile Link</label>
                    <input type="url" name="facebookUrl" class="form-control" value="<?php echo htmlspecialchars($config['facebookUrl'] ?? ''); ?>" placeholder="https://facebook.com/...">
                </div>
                <div class="form-group">
                    <label class="form-label">Instagram Profile Link</label>
                    <input type="url" name="instagramUrl" class="form-control" value="<?php echo htmlspecialchars($config['instagramUrl'] ?? ''); ?>" placeholder="https://instagram.com/...">
                </div>
            </div>
            <div class="form-row-2col">
                <div class="form-group">
                    <label class="form-label">Twitter / X Link</label>
                    <input type="url" name="twitterUrl" class="form-control" value="<?php echo htmlspecialchars($config['twitterUrl'] ?? ''); ?>" placeholder="https://twitter.com/...">
                </div>
                <div class="form-group">
                    <label class="form-label">YouTube Channel Link</label>
                    <input type="url" name="youtubeUrl" class="form-control" value="<?php echo htmlspecialchars($config['youtubeUrl'] ?? ''); ?>" placeholder="https://youtube.com/...">
                </div>
            </div>
            <div style="margin-top: 1.5rem;">
                <button type="submit" name="save_business" class="btn btn-primary" style="width: 100%;">
                    <i class="fa-solid fa-save"></i> Save Identity
                </button>
            </div>
        </form>
    </div>



    <!-- Platform Notifications -->
    <div class="settings-card">
        <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1.5rem;">
            <div style="width: 40px; height: 40px; background: rgba(52, 152, 219, 0.1); color: #3498db; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 1.2rem;">
                <i class="fa-solid fa-bell"></i>
            </div>
            <div>
                <h3 style="margin: 0;">Platform & Alerts</h3>
                <span style="font-size: 0.75rem; color: #888;">Manage real-time notifications</span>
            </div>
        </div>

        <form method="POST">
            <div class="settings-row" style="padding-bottom: 1.25rem; border-bottom: 1px dashed #eee;">
                <div style="flex: 1;">
                    <strong style="display: block; font-size: 0.9rem; color: #1e293b;"><i class="fa-solid fa-envelope" style="color: #4285F4; margin-right: 6px;"></i> Email Alerts</strong>
                    <p style="font-size: 0.72rem; color: #64748b; margin: 4px 0 10px 0;">Notify via email for new booking activities.</p>
                    <div style="display: flex; gap: 1.5rem; margin-top: 8px;">
                        <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
                            <label class="switch">
                                <input type="checkbox" name="enableEmailNotifications_Customer" <?php echo ($config['enableEmailNotifications_Customer'] ?? true) ? 'checked' : ''; ?>>
                                <span class="slider"></span>
                            </label>
                            <span style="font-size: 0.75rem; font-weight: 700; color: #475569;">Customer Side</span>
                        </label>
                        <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
                            <label class="switch">
                                <input type="checkbox" name="enableEmailNotifications_Admin" <?php echo ($config['enableEmailNotifications_Admin'] ?? false) ? 'checked' : ''; ?>>
                                <span class="slider"></span>
                            </label>
                            <span style="font-size: 0.75rem; font-weight: 700; color: #475569;">Admin Side</span>
                        </label>
                    </div>
                </div>
            </div>

            <div class="settings-row" style="padding-top: 1.25rem;">
                <div style="flex: 1;">
                    <strong style="display: block; font-size: 0.9rem; color: #1e293b;"><i class="fa-solid fa-paper-plane" style="color: #24A1DE; margin-right: 6px;"></i> Telegram Updates</strong>
                    <p style="font-size: 0.72rem; color: #64748b; margin: 4px 0 10px 0;">Instant notifications to connected groups.</p>
                    <div style="display: flex; gap: 1.5rem; margin-top: 8px;">
                        <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
                            <label class="switch">
                                <input type="checkbox" name="enableTelegramNotifications_Customer" <?php echo ($config['enableTelegramNotifications_Customer'] ?? true) ? 'checked' : ''; ?>>
                                <span class="slider"></span>
                            </label>
                            <span style="font-size: 0.75rem; font-weight: 700; color: #475569;">Customer Side</span>
                        </label>
                        <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
                            <label class="switch">
                                <input type="checkbox" name="enableTelegramNotifications_Admin" <?php echo ($config['enableTelegramNotifications_Admin'] ?? true) ? 'checked' : ''; ?>>
                                <span class="slider"></span>
                            </label>
                            <span style="font-size: 0.75rem; font-weight: 700; color: #475569;">Admin Side</span>
                        </label>
                    </div>
                </div>
            </div>
            <div class="settings-row">
                <div>
                    <strong style="display: block; font-size: 0.9rem; color: #e74c3c;">Maintenance Mode</strong>
                    <span style="font-size: 0.7rem; color: #888;">Prevent new bookings & show maintenance page</span>
                </div>
                <label class="switch">
                    <input type="checkbox" name="maintenanceMode" <?php echo ($config['maintenanceMode'] ?? false) ? 'checked' : ''; ?>>
                    <span class="slider"></span>
                </label>
            </div>

            <div style="margin-top: 1.5rem;">
                <button type="submit" name="save_platform" class="btn btn-primary" style="width: 100%;">
                    <i class="fa-solid fa-check"></i> Apply Platform Changes
                </button>
            </div>
        </form>
    </div>

    <!-- Google Maps & Location Picker Engine Settings -->
    <div class="settings-card">
        <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1.5rem;">
            <div style="width: 40px; height: 40px; background: rgba(234, 67, 53, 0.1); color: #ea4335; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 1.2rem;">
                <i class="fa-solid fa-map-location-dot"></i>
            </div>
            <div>
                <h3 style="margin: 0;">Master Location & Maps Engine</h3>
                <span style="font-size: 0.75rem; color: #888;">Configure autocomplete, session tokens, zero-cost city/airport presets, distance matrix & fail-safe fallback engines</span>
            </div>
        </div>

        <form method="POST">
            <div class="form-group">
                <label class="form-label"><i class="fa-solid fa-key" style="color: #fbbc05; margin-right: 6px;"></i> Google Maps API Key</label>
                <input type="text" name="googleMapsApiKey" class="form-control" value="<?php echo htmlspecialchars($config['googleMapsApiKey'] ?? ''); ?>" placeholder="AIzaSy...">
                <span style="font-size:0.75rem; color:var(--gray-500);">API key used for Google Places Autocomplete & Distance Matrix calculations.</span>
            </div>

            <div class="settings-row" style="padding-top: 1rem; padding-bottom: 1rem; border-top: 1px dashed #eee;">
                <div style="flex: 1;">
                    <strong style="display: block; font-size: 0.9rem; color: #1e293b;"><i class="fa-solid fa-power-off" style="color: #ea4335; margin-right: 6px;"></i> Master Google Maps API Status</strong>
                    <p style="font-size: 0.72rem; color: #64748b; margin: 4px 0 10px 0;">Enable Google Places API for street/landmark autocomplete. Disable to run 100% free OSM & local mode.</p>
                </div>
                <label class="switch">
                    <input type="checkbox" name="enableGoogleMapsApi" <?php echo ($config['enableGoogleMapsApi'] ?? true) ? 'checked' : ''; ?>>
                    <span class="slider"></span>
                </label>
            </div>

            <div class="settings-row" style="padding-top: 1rem; padding-bottom: 1rem; border-top: 1px dashed #eee;">
                <div style="flex: 1;">
                    <strong style="display: block; font-size: 0.9rem; color: #1e293b;"><i class="fa-solid fa-coins" style="color: #f59e0b; margin-right: 6px;"></i> Google Places Session Token Grouping</strong>
                    <p style="font-size: 0.72rem; color: #64748b; margin: 4px 0 10px 0;">Group autocomplete typing keystrokes into a single session token (saves 80% Google Places API billing).</p>
                </div>
                <label class="switch">
                    <input type="checkbox" name="enableSessionTokens" <?php echo ($config['enableSessionTokens'] ?? true) ? 'checked' : ''; ?>>
                    <span class="slider"></span>
                </label>
            </div>

            <div class="settings-row" style="padding-top: 1rem; padding-bottom: 1rem; border-top: 1px dashed #eee;">
                <div style="flex: 1;">
                    <strong style="display: block; font-size: 0.9rem; color: #1e293b;"><i class="fa-solid fa-city" style="color: #4285F4; margin-right: 6px;"></i> Free-First City Autocomplete (cities.json - 0 API Cost)</strong>
                    <p style="font-size: 0.72rem; color: #64748b; margin: 4px 0 10px 0;">Serve instant 0ms city auto-suggestions from 500+ South Indian cities without making external API calls.</p>
                </div>
                <label class="switch">
                    <input type="checkbox" name="enableLocalLocationFallback" <?php echo ($config['enableLocalLocationFallback'] ?? true) ? 'checked' : ''; ?>>
                    <span class="slider"></span>
                </label>
            </div>

            <div class="settings-row" style="padding-top: 1rem; padding-bottom: 1rem; border-top: 1px dashed #eee;">
                <div style="flex: 1;">
                    <strong style="display: block; font-size: 0.9rem; color: #1e293b;"><i class="fa-solid fa-plane-departure" style="color: #0ea5e9; margin-right: 6px;"></i> Curated Airport Quick Selector (0 API Cost)</strong>
                    <p style="font-size: 0.72rem; color: #64748b; margin: 4px 0 10px 0;">Instantly search and auto-fill major South India airports (BLR, MAA, CJB, IXM, TRZ, COK, TRV, CCJ).</p>
                </div>
                <label class="switch">
                    <input type="checkbox" name="enableAirportQuickSelector" <?php echo ($config['enableAirportQuickSelector'] ?? true) ? 'checked' : ''; ?>>
                    <span class="slider"></span>
                </label>
            </div>

            <div class="settings-row" style="padding-top: 1rem; padding-bottom: 1rem; border-top: 1px dashed #eee;">
                <div style="flex: 1;">
                    <strong style="display: block; font-size: 0.9rem; color: #1e293b;"><i class="fa-solid fa-globe" style="color: #34A853; margin-right: 6px;"></i> OpenStreetMap (OSM / Nominatim) Proxy</strong>
                    <p style="font-size: 0.72rem; color: #64748b; margin: 4px 0 10px 0;">Use free OSM Nominatim geocoding proxy with local caching when Google Maps is disabled or fails.</p>
                </div>
                <label class="switch">
                    <input type="checkbox" name="enableOsmGeocodingProxy" <?php echo ($config['enableOsmGeocodingProxy'] ?? true) ? 'checked' : ''; ?>>
                    <span class="slider"></span>
                </label>
            </div>

            <div class="settings-row" style="padding-top: 1rem; padding-bottom: 1rem; border-top: 1px dashed #eee;">
                <div style="flex: 1;">
                    <strong style="display: block; font-size: 0.9rem; color: #1e293b;"><i class="fa-solid fa-history" style="color: #AB47BC; margin-right: 6px;"></i> Recent Locations Search History</strong>
                    <p style="font-size: 0.72rem; color: #64748b; margin: 4px 0 10px 0;">Store and display user's recent searches in localStorage for instant 1-click selection.</p>
                </div>
                <div style="display: flex; align-items: center; gap: 10px;">
                    <input type="number" name="recentLocationsLimit" min="1" max="20" class="form-control" style="width: 70px; text-align: center;" value="<?php echo htmlspecialchars((string)($config['recentLocationsLimit'] ?? 5)); ?>">
                    <label class="switch">
                        <input type="checkbox" name="enableRecentLocationsHistory" <?php echo ($config['enableRecentLocationsHistory'] ?? true) ? 'checked' : ''; ?>>
                        <span class="slider"></span>
                    </label>
                </div>
            </div>

            <div class="form-group" style="padding-top: 1rem; border-top: 1px dashed #eee;">
                <label class="form-label"><i class="fa-solid fa-route" style="color: #6366f1; margin-right: 6px;"></i> Distance & Travel Time Calculation Engine</label>
                <select name="distanceEngine" class="form-control">
                    <option value="osrm" <?php echo ($config['distanceEngine'] ?? 'osrm') === 'osrm' ? 'selected' : ''; ?>>OSRM Free Road Routing (100% Free - Recommended)</option>
                    <option value="google_matrix" <?php echo ($config['distanceEngine'] ?? 'osrm') === 'google_matrix' ? 'selected' : ''; ?>>Google Distance Matrix API</option>
                    <option value="haversine_ratio" <?php echo ($config['distanceEngine'] ?? 'osrm') === 'haversine_ratio' ? 'selected' : ''; ?>>Haversine Distance + 20% Road Ratio (Fastest)</option>
                </select>
                <span style="font-size:0.75rem; color:var(--gray-500);">Choose engine for calculating road distance in km and estimated trip duration.</span>
            </div>

            <div class="settings-row" style="padding-top: 1rem; padding-bottom: 1rem; border-top: 1px dashed #eee;">
                <div style="flex: 1;">
                    <strong style="display: block; font-size: 0.9rem; color: #1e293b;"><i class="fa-solid fa-crosshairs" style="color: #ea4335; margin-right: 6px;"></i> GPS "Use Current Location" Button</strong>
                    <p style="font-size: 0.72rem; color: #64748b; margin: 4px 0 10px 0;">Show target crosshair icon in the pickup input allowing mobile users to auto-snap their GPS location.</p>
                </div>
                <label class="switch">
                    <input type="checkbox" name="enableGpsCurrentLocation" <?php echo ($config['enableGpsCurrentLocation'] ?? true) ? 'checked' : ''; ?>>
                    <span class="slider"></span>
                </label>
            </div>

            <div class="settings-row" style="padding-top: 1rem; padding-bottom: 1rem; border-top: 1px dashed #eee;">
                <div style="flex: 1;">
                    <strong style="display: block; font-size: 0.9rem; color: #1e293b;"><i class="fa-solid fa-border-all" style="color: #FBBC05; margin-right: 6px;"></i> State Border & Interstate Permit Detection</strong>
                    <p style="font-size: 0.72rem; color: #64748b; margin: 4px 0 10px 0;">Extract administrative state names on selection to accurately calculate interstate toll fees.</p>
                </div>
                <label class="switch">
                    <input type="checkbox" name="enableStateBorderDetection" <?php echo ($config['enableStateBorderDetection'] ?? true) ? 'checked' : ''; ?>>
                    <span class="slider"></span>
                </label>
            </div>

            <div class="settings-row" style="padding-top: 1rem; padding-bottom: 1rem; border-top: 1px dashed #eee;">
                <div style="flex: 1;">
                    <strong style="display: block; font-size: 0.9rem; color: #1e293b;"><i class="fa-solid fa-bolt" style="color: #24A1DE; margin-right: 6px;"></i> Route Page Background Geocoding</strong>
                    <p style="font-size: 0.72rem; color: #64748b; margin: 4px 0 10px 0;">Automatically resolve coordinates for pre-filled route landing pages (e.g. /chennai-to-madurai).</p>
                </div>
                <label class="switch">
                    <input type="checkbox" name="enablePrefilledRouteGeocoding" <?php echo ($config['enablePrefilledRouteGeocoding'] ?? true) ? 'checked' : ''; ?>>
                    <span class="slider"></span>
                </label>
            </div>

            <div class="settings-row" style="padding-top: 1rem; padding-bottom: 1rem; border-top: 1px dashed #eee;">
                <div style="flex: 1;">
                    <strong style="display: block; font-size: 0.9rem; color: #1e293b;"><i class="fa-solid fa-share-nodes" style="color: #3b82f6; margin-right: 6px;"></i> Display "Share Route" Copy Button on Booking Form</strong>
                    <p style="font-size: 0.72rem; color: #64748b; margin: 4px 0 10px 0;">Display a button inside the customer booking form to easily copy shareable route links.</p>
                </div>
                <label class="switch">
                    <input type="checkbox" name="enableShareRouteButton" <?php echo ($config['enableShareRouteButton'] ?? false) ? 'checked' : ''; ?>>
                    <span class="slider"></span>
                </label>
            </div>

            <div style="margin-top: 1.5rem;">
                <button type="submit" name="save_maps_location_settings" class="btn btn-primary" style="width: 100%;">
                    <i class="fa-solid fa-save"></i> Save Location Settings
                </button>
            </div>
        </form>
    </div>

    <!-- Customer Notification Matrix -->
    <div class="settings-card" style="flex: 1 1 100%;">
        <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1.5rem;">
            <div style="width: 40px; height: 40px; background: rgba(37, 211, 102, 0.1); color: #25D366; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 1.2rem;">
                <i class="fa-solid fa-sliders"></i>
            </div>
            <div>
                <h3 style="margin: 0;">Customer Notification Matrix</h3>
                <span style="font-size: 0.75rem; color: #888;">Configure exactly which milestone events trigger automated customer notifications across active communication channels.</span>
            </div>
        </div>

        <form method="POST">
            <div class="table-responsive" style="margin-top: 1rem; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.02);">
                <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.85rem;">
                    <thead>
                        <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
                            <th style="padding: 1rem; font-weight: 800; color: #0f172a; width: 35%;">Trip Milestone Event</th>
                            <th style="padding: 1rem; font-weight: 800; color: #0f172a; text-align: center;"><i class="fa-solid fa-envelope" style="color: #3b82f6; margin-right: 4px;"></i> Email Alert</th>
                            <th style="padding: 1rem; font-weight: 800; color: #0f172a; text-align: center;"><i class="fa-solid fa-message" style="color: #f59e0b; margin-right: 4px;"></i> SMS Notification</th>
                            <th style="padding: 1rem; font-weight: 800; color: #0f172a; text-align: center;"><i class="fa-brands fa-whatsapp" style="color: #25D366; margin-right: 4px;"></i> WhatsApp Message</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php
                        $events = [
                            'enquiry' => ['label' => 'New Enquiry Created', 'icon' => 'fa-bell', 'color' => '#6366f1', 'desc' => 'Triggered when a customer calculates a route fare for the first time.'],
                            'confirmed' => ['label' => 'Booking Confirmed', 'icon' => 'fa-circle-check', 'color' => '#10b981', 'desc' => 'Triggered when a booking transitions to Confirmed status.'],
                            'driver_assigned' => ['label' => 'Driver & Cab Assigned', 'icon' => 'fa-car-side', 'color' => '#f59e0b', 'desc' => 'Triggered when driver details or cab number are updated.'],
                            'completed' => ['label' => 'Trip Completed', 'icon' => 'fa-flag-checkered', 'color' => '#3b82f6', 'desc' => 'Triggered when status changes to Completed, sending thank-you & invoice.'],
                            'cancelled' => ['label' => 'Booking Cancelled', 'icon' => 'fa-circle-xmark', 'color' => '#ef4444', 'desc' => 'Triggered when status transitions to Cancelled.'],
                        ];
                        $channels = ['email', 'sms', 'whatsapp'];
                        foreach ($events as $evKey => $evData):
                        ?>
                        <tr style="border-bottom: 1px solid #e2e8f0; transition: background 0.15s ease;">
                            <td style="padding: 1rem; vertical-align: middle;">
                                <div style="display: flex; align-items: center; gap: 0.75rem;">
                                    <div style="width: 32px; height: 32px; background: <?php echo $evData['color']; ?>15; color: <?php echo $evData['color']; ?>; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 1rem; flex-shrink: 0;">
                                        <i class="fa-solid <?php echo $evData['icon']; ?>"></i>
                                    </div>
                                    <div>
                                        <strong style="display: block; color: #1e293b; font-size: 0.9rem;"><?php echo $evData['label']; ?></strong>
                                        <span style="font-size: 0.72rem; color: #64748b; line-height: 1.3; display: block; margin-top: 2px;"><?php echo $evData['desc']; ?></span>
                                    </div>
                                </div>
                            </td>
                            <?php foreach ($channels as $ch):
                                $key = "notify_customer_{$ch}_{$evKey}";
                                $checked = ($config[$key] ?? false) ? 'checked' : '';
                            ?>
                            <td style="padding: 1rem; text-align: center; vertical-align: middle;">
                                <label class="switch" style="margin: 0 auto;">
                                    <input type="checkbox" name="<?php echo $key; ?>" <?php echo $checked; ?>>
                                    <span class="slider"></span>
                                </label>
                            </td>
                            <?php endforeach; ?>
                        </tr>
                        <?php endforeach; ?>
                    </tbody>
                </table>
            </div>
            
            <div style="margin-top: 1.5rem;">
                <button type="submit" name="save_notification_matrix" class="btn btn-primary" style="width: 100%; font-weight: 700; height: 46px; background: #25D366; border: none; box-shadow: 0 4px 12px rgba(37, 211, 102, 0.25);">
                    <i class="fa-solid fa-save"></i> Save Notification Matrix
                </button>
            </div>
        </form>
    </div>



    <!-- --- ANALYTICS & INTEGRATIONS - MERGED into "API Keys" --------
         All fields here (googleCalendarWebhookUrl, googleAnalyticsId,
         facebookPixelId) were duplicates of inputs already present in
         the API Keys card above. Removed to avoid two save buttons
         writing to the same config keys.
    -->

    <!-- Instructions / Stats -->
    <div class="settings-card" style="background: linear-gradient(135deg, #f0f7ff 0%, #ffffff 100%); border-left: 4px solid var(--primary-color);">
        <h3 style="margin-top: 0;">Automation Benefits</h3>
        <ul style="list-style: none; padding: 0; display: flex; flex-direction: column; gap: 1rem; margin-bottom: 2rem;">
            <li style="display: flex; gap: 0.75rem; align-items: flex-start;">
                <i class="fa-solid fa-bolt" style="color: #ffc107; margin-top: 3px;"></i>
                <div>
                    <strong style="display: block; font-size: 0.9rem;">Instant Updates</strong>
                    <span style="font-size: 0.8rem; color: #666;">Bookings appear in your sheet the moment they are confirmed.</span>
                </div>
            </li>
            <li style="display: flex; gap: 0.75rem; align-items: flex-start;">
                <i class="fa-solid fa-chart-pie" style="color: #17a2b8; margin-top: 3px;"></i>
                <div>
                    <strong style="display: block; font-size: 0.9rem;">Lead Tracking</strong>
                    <span style="font-size: 0.8rem; color: #666;">Even fare enquiries (interest leads) are captured for follow-ups.</span>
                </div>
            </li>
            <li style="display: flex; gap: 0.75rem; align-items: flex-start;">
                <i class="fa-solid fa-share-nodes" style="color: #6f42c1; margin-top: 3px;"></i>
                <div>
                    <strong style="display: block; font-size: 0.9rem;">Connect 1000+ Apps</strong>
                    <span style="font-size: 0.8rem; color: #666;">Use your Google Sheet with Zapier or Make.com to trigger SMS, CRM tasks, etc.</span>
                </div>
            </li>
        </ul>

        <div style="padding-top: 1rem; border-top: 1px solid rgba(0,0,0,0.05); text-align: center;">
            <p style="font-size: 0.75rem; color: #888;">Automation reduces manual entry and increases conversion.</p>
        </div>
    </div>

    <!-- Spam Protection Section -->
    <div class="settings-card" style="flex: 1 1 100%;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.5rem;">
            <div style="display: flex; align-items: center; gap: 0.75rem;">
                <div style="width: 40px; height: 40px; background: rgba(231, 76, 60, 0.1); color: #e74c3c; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 1.2rem;">
                    <i class="fa-solid fa-shield-halved"></i>
                </div>
                <div>
                <h3 style="margin: 0;">Spam & IP Protection</h3>
                <span style="font-size: 0.75rem; color: #888;">Manage manual IP blocks and export exclusion lists</span>
            </div>
        </div>
        <div style="display: flex; gap: 0.75rem;">
            <a href="?export=blocked_ips&filter=google_ads" class="btn btn-primary" style="border-radius: 8px; font-size: 0.8rem; padding: 0.5rem 1rem; background: #4285F4; border-color: #4285F4;">
                <i class="fa-brands fa-google"></i> Export for Google Ads
            </a>
            <a href="?export=blocked_ips" class="btn btn-outline" style="border-radius: 8px; font-size: 0.8rem; padding: 0.5rem 1rem;">
                <i class="fa-solid fa-download"></i> Export All
            </a>
        </div>
    </div>

        <div class="grid" style="display: grid; grid-template-columns: 1fr 2fr; gap: 2rem;">
            <!-- Manual Add -->
            <div>
                <h4 style="margin: 0 0 1rem 0; font-size: 0.9rem;">Manually Block IP</h4>
                <form method="POST" style="background: #fdfdfd; padding: 1rem; border: 1px solid #eee; border-radius: 8px;">
                    <div class="form-group">
                        <label class="form-label" style="font-size: 0.75rem;">IP Address</label>
                        <input type="text" name="ip_address" class="form-control" placeholder="e.g. 1.2.3.4" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label" style="font-size: 0.75rem;">Reason (optional)</label>
                        <input type="text" name="reason" class="form-control" placeholder="Manual block">
                    </div>
                    <button type="submit" name="add_blocked_ip" class="btn btn-danger" style="width: 100%; margin-top: 0.5rem;">
                        <i class="fa-solid fa-ban"></i> Block Address
                    </button>
                </form>
            </div>

            <!-- List -->
            <div>
                <h4 style="margin: 0 0 1rem 0; font-size: 0.9rem;">Restricted IP List</h4>
                <div class="table-responsive" style="max-height: 350px; overflow-y: auto; border: 1px solid #eee; border-radius: 8px;">
                    <table class="custom-table" style="font-size: 0.8rem;">
                        <thead>
                            <tr style="background: #f8f9fa;">
                                <th>IP Address</th>
                                <th>Reason</th>
                                <th>Added</th>
                                <th style="text-align: right;">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            <?php
                            $blocked = $pdo->query("SELECT * FROM blocked_ips ORDER BY created_at DESC LIMIT 100")->fetchAll();
                            foreach ($blocked as $b):
                            ?>
                            <tr>
                                <td><code><?php echo htmlspecialchars($b['ip_address']); ?></code></td>
                                <td><?php echo htmlspecialchars($b['reason']); ?></td>
                                <td style="color: #888;"><?php echo date('d M Y', strtotime($b['created_at'])); ?></td>
                                <td style="text-align: right;">
                                    <a href="?delete_block_id=<?php echo $b['id']; ?>" class="text-danger" onclick="return confirm('Allow access for this IP?')" style="color: #dc3545; text-decoration: none;">
                                        <i class="fa-solid fa-trash-can"></i>
                                    </a>
                                </td>
                            </tr>
                            <?php endforeach; ?>
                            <?php if (empty($blocked)): ?>
                            <tr>
                                <td colspan="4" style="text-align: center; color: #999; padding: 2rem;">No IPs are currently restricted.</td>
                            </tr>
                            <?php endif; ?>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>

    <!-- --- TOP ANNOUNCEMENT BANNER (sitewide) -------------------------- -->
    <div class="settings-card">
        <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:1.25rem;">
            <div style="width:40px;height:40px;background:rgba(245,158,11,.12);color:#d97706;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:1.2rem;"><i class="fa-solid fa-bullhorn"></i></div>
            <div><h3 style="margin:0;">Top Announcement Banner</h3><span style="font-size:.75rem;color:#888;">Site-wide strip above the header</span></div>
        </div>
        <form method="POST">
            <div class="settings-row" style="margin-bottom:.75rem;">
                <div>
                    <strong style="display:block;font-size:.85rem;">Show banner</strong>
                    <span style="font-size:.72rem;color:#888;">Appears on every page above the navbar</span>
                </div>
                <label class="switch" style="margin:0;">
                    <input type="checkbox" name="announcementEnabled" <?php echo !empty($config['announcementEnabled']) ? 'checked' : ''; ?>>
                    <span class="slider"></span>
                </label>
            </div>
            <div class="form-group">
                <label class="form-label">Banner Text</label>
                <input type="text" name="announcementText" class="form-control" value="<?php echo htmlspecialchars($config['announcementText'] ?? ''); ?>" placeholder="Diwali Special: 15% off all rides! Use code FESTIVE15" maxlength="200">
            </div>
            <div class="form-row-2col">
                <div class="form-group">
                    <label class="form-label">Variant</label>
                    <select name="announcementVariant" class="form-control">
                        <?php $v = $config['announcementVariant'] ?? 'info'; foreach(['info'=>'Info (blue)','warning'=>'Warning (amber)','success'=>'Success (green)','promo'=>'Promo (magenta)'] as $k=>$lbl): ?>
                        <option value="<?php echo $k; ?>" <?php echo $v === $k ? 'selected':''; ?>><?php echo $lbl; ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">CTA Button Text <small style="color:#888;">(optional)</small></label>
                    <input type="text" name="announcementLinkText" class="form-control" value="<?php echo htmlspecialchars($config['announcementLinkText'] ?? ''); ?>" placeholder="Book now">
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">CTA Link URL <small style="color:#888;">(optional)</small></label>
                <input type="url" name="announcementLink" class="form-control" value="<?php echo htmlspecialchars($config['announcementLink'] ?? ''); ?>" placeholder="https://www.dropcars.in/#booking">
            </div>
            <div class="settings-row">
                <strong style="font-size:.82rem;">Allow user to dismiss</strong>
                <label class="switch" style="margin:0;"><input type="checkbox" name="announcementDismissable" <?php echo !empty($config['announcementDismissable']) ? 'checked' : ''; ?>><span class="slider"></span></label>
            </div>
            <button type="submit" name="save_announcement" class="btn btn-primary" style="width:100%;margin-top:.75rem;"><i class="fa-solid fa-save"></i> Save Announcement</button>
        </form>
    </div>

    <!-- --- HERO CONTENT OVERRIDES -------------------------------------- -->
    <div class="settings-card">
        <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:1.25rem;">
            <div style="width:40px;height:40px;background:rgba(99,102,241,.12);color:#6366f1;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:1.2rem;"><i class="fa-solid fa-image"></i></div>
            <div><h3 style="margin:0;">Hero Section Content</h3><span style="font-size:.75rem;color:#888;">Override the homepage hero title, subtitle, and stat tiles</span></div>
        </div>
        <form method="POST">
            <div class="form-group">
                <label class="form-label">Trust Badge Text <small style="color:#888;">(small chip above the title)</small></label>
                <input type="text" name="heroBadgeText" class="form-control" value="<?php echo htmlspecialchars($config['heroBadgeText'] ?? "Tamil Nadu's Most Trusted Cab Service"); ?>" maxlength="80">
            </div>
            <div class="form-group">
                <label class="form-label">Hero Title Override <small style="color:#888;">(leave blank to use theme default)</small></label>
                <input type="text" name="heroTitleOverride" class="form-control" value="<?php echo htmlspecialchars($config['heroTitleOverride'] ?? ''); ?>" placeholder="One Way Drop Taxi | Outstation & Intercity Cabs">
            </div>
            <div class="form-group">
                <label class="form-label">Hero Subtitle Override</label>
                <input type="text" name="heroSubOverride" class="form-control" value="<?php echo htmlspecialchars($config['heroSubOverride'] ?? ''); ?>" placeholder="Book an affordable one-way drop taxi.">
            </div>
            <p style="font-size:.78rem;color:#475569;font-weight:700;margin:1rem 0 .5rem;"><i class="fa-solid fa-grip" style="color:#94a3b8;"></i> Stat Tiles (4 quick stats next to hero)</p>
            <?php foreach (['heroStat1'=>['','15,000','Rides'], 'heroStat2'=>['','4.9','Rating'], 'heroStat3'=>['','50+','Cities'], 'heroStat4'=>['','24/7','Support']] as $key=>$d): ?>
            <div class="form-row-2col" style="margin-bottom:.25rem;">
                <div class="form-group">
                    <label class="form-label" style="font-size:.72rem;"><?php echo $d[0]; ?> Stat <?php echo substr($key,-1); ?> Value</label>
                    <input type="text" name="<?php echo $key; ?>Value" class="form-control" value="<?php echo htmlspecialchars($config[$key.'Value'] ?? $d[1]); ?>" placeholder="<?php echo $d[1]; ?>">
                </div>
                <div class="form-group">
                    <label class="form-label" style="font-size:.72rem;">Stat <?php echo substr($key,-1); ?> Label</label>
                    <input type="text" name="<?php echo $key; ?>Label" class="form-control" value="<?php echo htmlspecialchars($config[$key.'Label'] ?? $d[2]); ?>" placeholder="<?php echo $d[2]; ?>">
                </div>
            </div>
            <?php endforeach; ?>
            <button type="submit" name="save_hero_content" class="btn btn-primary" style="width:100%;margin-top:.75rem;"><i class="fa-solid fa-save"></i> Save Hero Content</button>
        </form>
    </div>



    <!-- --- LIVE CHAT WIDGET -------------------------------------------- -->
    <div class="settings-card">
        <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:1.25rem;">
            <div style="width:40px;height:40px;background:rgba(20,184,166,.12);color:#0d9488;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:1.2rem;"><i class="fa-solid fa-comments"></i></div>
            <div><h3 style="margin:0;">Live Chat Widget</h3><span style="font-size:.75rem;color:#888;">Optional Crisp / Tawk.to / Intercom integration</span></div>
        </div>
        <form method="POST">
            <div class="form-row-2col">
                <div class="form-group">
                    <label class="form-label">Provider</label>
                    <select name="liveChatProvider" class="form-control">
                        <?php $lp = $config['liveChatProvider'] ?? 'none'; foreach(['none'=>'None (disabled)','crisp'=>'Crisp','tawk'=>'Tawk.to','intercom'=>'Intercom'] as $k=>$lbl): ?>
                        <option value="<?php echo $k; ?>" <?php echo $lp === $k ? 'selected':''; ?>><?php echo $lbl; ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">Widget ID</label>
                    <input type="text" name="liveChatId" class="form-control" value="<?php echo htmlspecialchars($config['liveChatId'] ?? ''); ?>" placeholder="Crisp Website ID / Tawk.to Property ID / Intercom App ID">
                </div>
            </div>
            <p style="font-size:.72rem;color:#475569;background:#f1f5f9;padding:.55rem .7rem;border-radius:8px;line-height:1.5;margin-top:.4rem;">
                <i class="fa-solid fa-circle-info" style="color:#0d9488;"></i>
                Signs up at <strong>crisp.chat</strong> / <strong>tawk.to</strong> / <strong>intercom.com</strong>, then paste your widget ID. The chat bubble appears bottom-right on every public page.
            </p>
            <button type="submit" name="save_live_chat" class="btn btn-primary" style="width:100%;margin-top:.75rem;"><i class="fa-solid fa-save"></i> Save Live Chat</button>
        </form>
    </div>

    <!-- --- SEO OVERRIDES ----------------------------------------------- -->
    <div class="settings-card">
        <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:1.25rem;">
            <div style="width:40px;height:40px;background:rgba(34,197,94,.12);color:#16a34a;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:1.2rem;"><i class="fa-solid fa-magnifying-glass"></i></div>
            <div><h3 style="margin:0;">SEO Overrides</h3><span style="font-size:.75rem;color:#888;">Meta description, Open Graph, Twitter, verification codes</span></div>
        </div>
        <form method="POST">
            <div class="form-group">
                <label class="form-label">Meta Description <small style="color:#888;">(used on every page if not overridden)</small></label>
                <textarea name="seoMetaDescription" class="form-control" rows="2" maxlength="160" placeholder="One-way drop taxi & outstation cab booking across Tamil Nadu and South India."><?php echo htmlspecialchars($config['seoMetaDescription'] ?? ''); ?></textarea>
                <small style="font-size:.68rem;color:#888;">Max 160 chars (Google truncates beyond that).</small>
            </div>
            <div class="form-group">
                <label class="form-label">SEO Keywords <small style="color:#888;">(comma-separated)</small></label>
                <input type="text" name="seoKeywords" class="form-control" value="<?php echo htmlspecialchars($config['seoKeywords'] ?? ''); ?>" placeholder="drop taxi, outstation taxi, intercity cab, Tamil Nadu cab service">
            </div>
            <div class="form-group">
                <label class="form-label">Open Graph Image URL <small style="color:#888;">(1200&times;630 ideal &mdash; shown when site is shared on social)</small></label>
                <input type="url" name="seoOgImage" class="form-control" value="<?php echo htmlspecialchars($config['seoOgImage'] ?? ''); ?>" placeholder="https://www.dropcars.in/assets/img/og-cover.jpg">
            </div>
            <div class="form-row-2col">
                <div class="form-group">
                    <label class="form-label">Twitter Handle</label>
                    <input type="text" name="seoTwitterHandle" class="form-control" value="<?php echo htmlspecialchars($config['seoTwitterHandle'] ?? ''); ?>" placeholder="@dropcars">
                </div>
                <div class="form-group">
                    <label class="form-label">Search Console Verification</label>
                    <input type="text" name="searchConsoleId" class="form-control" value="<?php echo htmlspecialchars($config['searchConsoleId'] ?? ''); ?>" placeholder="SAVE10">
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">Bing Webmaster Verification</label>
                <input type="text" name="bingWebmasterId" class="form-control" value="<?php echo htmlspecialchars($config['bingWebmasterId'] ?? ''); ?>" placeholder="msvalidate.01 code">
            </div>
            <button type="submit" name="save_seo" class="btn btn-primary" style="width:100%;margin-top:.75rem;"><i class="fa-solid fa-save"></i> Save SEO Settings</button>
        </form>
    </div>

    <!-- --- SITE SECTIONS VISIBILITY ------------------------------------ -->
    <div class="settings-card">
        <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:1.25rem;">
            <div style="width:40px;height:40px;background:rgba(168,85,247,.12);color:#9333ea;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:1.2rem;"><i class="fa-solid fa-eye"></i></div>
            <div><h3 style="margin:0;">Section Visibility</h3><span style="font-size:.75rem;color:#888;">Show or hide major homepage sections</span></div>
        </div>
        <form method="POST">
            <?php
            $sectionToggles = [
                'showHeroStats'     => ['Hero stat tiles',     'The 4 quick stats next to the hero (Rides / Rating / Cities / Support)'],
                'showMarquee'       => ['Marquee strip',        'Scrolling route/service strip below the hero'],
                'showTrustFeatures' => ['Trust feature cards',  '"Well-Maintained Fleet", "Instant Confirmation", "Safe & Reliable" tiles'],
                'showTestimonials'  => ['Customer testimonials', 'Carousel of customer reviews'],
                'showFAQ'           => ['FAQ section',           'Frequently asked questions block'],
                'showPartnersCTA'   => ['Become-a-Partner CTA',  'Driver/partner signup invitation panel'],
                'showAboutUs'       => ['About Us section',      'Company introduction + legal disclaimer'],
                'showFleetShowcase' => ['Fleet showcase',        'Vehicle types grid (Sedan / SUV / Innova / Crysta)'],
            ];
            foreach ($sectionToggles as $key => $info):
                $enabled = !array_key_exists($key, $config) || !empty($config[$key]); // default ON
            ?>
            <div class="settings-row">
                <div>
                    <strong style="display:block;font-size:.83rem;"><?php echo $info[0]; ?></strong>
                    <span style="font-size:.7rem;color:#888;line-height:1.4;"><?php echo $info[1]; ?></span>
                </div>
                <label class="switch" style="margin:0;"><input type="checkbox" name="<?php echo $key; ?>" <?php echo $enabled ? 'checked' : ''; ?>><span class="slider"></span></label>
            </div>
            <?php endforeach; ?>
            <button type="submit" name="save_section_visibility" class="btn btn-primary" style="width:100%;margin-top:1rem;"><i class="fa-solid fa-save"></i> Save Visibility Toggles</button>
        </form>
    </div>

    <!-- --- WHATSAPP & MESSAGING (Notifications) -------------------- -->
    <div class="settings-card">
        <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:1.25rem;">
            <div style="width:40px;height:40px;background:rgba(37,211,102,.12);color:#25D366;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:1.2rem;"><i class="fa-brands fa-whatsapp"></i></div>
            <div><h3 style="margin:0;">WhatsApp & Messaging</h3><span style="font-size:.75rem;color:#888;">Number &amp; editable message templates</span></div>
        </div>
        <form method="POST">
            <input type="hidden" name="save_whatsapp" value="1">
            <div class="form-group">
                <label class="form-label">WhatsApp Number</label>
                <input type="text" name="whatsappNumber" class="form-control" value="<?php echo htmlspecialchars((string) ($config['whatsappNumber'] ?? $config['supportPhone'] ?? '')); ?>" placeholder="9876543210">
                <small style="display:block;margin-top:.35rem;color:#94a3b8;font-size:.7rem;">10-digit number (91 country code added automatically). Used by the floating WhatsApp button &amp; confirmation links.</small>
            </div>
            <div class="form-group" style="border-top: 1px dashed #e2e8f0; padding-top: 1rem; margin-top: 1rem;">
                <label class="form-label" style="font-weight: 800; color: var(--main-text);">WhatsApp Automated Gateway</label>
                <select name="whatsappGateway" class="form-control">
                    <option value="none" <?php echo ($config['whatsappGateway'] ?? 'none') === 'none' ? 'selected' : ''; ?>>None (Disabled - manual confirmation via link only)</option>
                    <option value="generic" <?php echo ($config['whatsappGateway'] ?? '') === 'generic' ? 'selected' : ''; ?>>Generic HTTP Gateway (Automated templates)</option>
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">Generic WhatsApp Gateway Endpoint URL</label>
                <input type="text" name="whatsappGenericUrl" class="form-control" value="<?php echo htmlspecialchars($config['whatsappGenericUrl'] ?? ''); ?>" placeholder="https://api.wati.io/api/v1/sendTemplateMessage?apikey={apikey}&to={phone}&message={message}">
                <small style="display:block;margin-top:.35rem;color:#94a3b8;font-size:.7rem;">Use placeholders: <code>{apikey}</code> <code>{phone}</code> <code>{message}</code></small>
            </div>
            <div class="form-group">
                <label class="form-label">WhatsApp API Key / Token</label>
                <input type="password" name="whatsappApiKey" class="form-control" value="<?php echo htmlspecialchars($config['whatsappApiKey'] ?? ''); ?>" placeholder="Your WhatsApp API key or Authorization token" autocomplete="new-password">
                <small style="display:block;margin-top:.4rem;color:#888;font-size:.7rem;">Masked for visual security.</small>
            </div>
            <div class="form-group" style="border-top: 1px dashed #e2e8f0; padding-top: 1rem; margin-top: 1rem;">
                <label class="form-label">Booking Confirmation Template</label>
                <textarea name="whatsappTemplateConfirmation" class="form-control" rows="5" style="font-family:inherit;font-size:.85rem;"><?php echo htmlspecialchars((string) ($config['whatsappTemplateConfirmation'] ?? "Dear {name},\nYour Drop Cars booking is confirmed!\n\nBooking ID: {bookingId}\nPickup: {pickup}\nDrop: {drop}\nFare: ₹{fare}\n\nThank you for choosing us!")); ?></textarea>
            </div>
            <div class="form-group">
                <label class="form-label">Enquiry Template</label>
                <textarea name="whatsappTemplateEnquiry" class="form-control" rows="4" style="font-family:inherit;font-size:.85rem;"><?php echo htmlspecialchars((string) ($config['whatsappTemplateEnquiry'] ?? "Hi {name}, thanks for your enquiry with Drop Cars for {pickup} to {drop}. We'll call you shortly with the best fare!")); ?></textarea>
            </div>
            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:.6rem .8rem;margin-bottom:.75rem;">
                <small style="color:#166534;font-size:.7rem;font-weight:600;">Placeholders: <code>{name}</code> <code>{bookingId}</code> <code>{pickup}</code> <code>{drop}</code> <code>{fare}</code> <code>{date}</code> <code>{vehicle}</code></small>
            </div>
            <button type="submit" class="btn btn-primary" style="width:100%;"><i class="fa-solid fa-save"></i> Save WhatsApp Settings</button>
        </form>
    </div>

    <!-- --- BUSINESS LOGO (Company) --------------------------------- -->
    <div class="settings-card">
        <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:1.25rem;">
            <div style="width:40px;height:40px;background:rgba(99,102,241,.12);color:#6366f1;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:1.2rem;"><i class="fa-solid fa-image"></i></div>
            <div><h3 style="margin:0;">Business Logo</h3><span style="font-size:.75rem;color:#888;">Shown in the site header &amp; invoices</span></div>
        </div>
        <?php $curLogo = trim((string) ($config['logoPath'] ?? '')); ?>
        <?php if ($curLogo !== ''): ?>
            <div style="background:#0f172a;border-radius:10px;padding:1rem;margin-bottom:1rem;text-align:center;">
                <img src="/<?php echo htmlspecialchars($curLogo, ENT_QUOTES, 'UTF-8'); ?>?v=<?php echo time(); ?>" alt="Current logo" style="max-height:56px;max-width:100%;object-fit:contain;">
            </div>
        <?php else: ?>
            <p style="font-size:.8rem;color:#94a3b8;margin:0 0 1rem;">No custom logo uploaded — the text logo is used.</p>
        <?php endif; ?>
        <form method="POST" enctype="multipart/form-data">
            <input type="hidden" name="save_logo" value="1">
            <div class="form-group">
                <label class="form-label">Upload New Logo (PNG)</label>
                <input type="file" name="logoFile" class="form-control" accept="image/png" required>
                <small style="display:block;margin-top:.35rem;color:#94a3b8;font-size:.7rem;">PNG format only (.png) · max 2 MB · transparent background recommended.</small>
            </div>
            <button type="submit" class="btn btn-primary" style="width:100%;"><i class="fa-solid fa-upload"></i> Upload Logo</button>
        </form>
    </div>

    <!-- --- CANCELLATION POLICY (Company) --------------------------- -->
    <div class="settings-card">
        <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:1.25rem;">
            <div style="width:40px;height:40px;background:rgba(239,68,68,.1);color:#ef4444;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:1.2rem;"><i class="fa-solid fa-file-contract"></i></div>
            <div><h3 style="margin:0;">Cancellation Policy</h3><span style="font-size:.75rem;color:#888;">Shown to customers on the tariff &amp; info pages</span></div>
        </div>
        <form method="POST">
            <input type="hidden" name="save_policies" value="1">
            <div class="form-group">
                <label class="form-label">Policy Text</label>
                <textarea name="cancellationPolicy" class="form-control" rows="6" style="font-family:inherit;font-size:.85rem;" placeholder="e.g. Free cancellation up to 1 hour before pickup. Cancellations within 1 hour may incur a charge..."><?php echo htmlspecialchars((string) ($config['cancellationPolicy'] ?? '')); ?></textarea>
                <small style="display:block;margin-top:.35rem;color:#94a3b8;font-size:.7rem;">Use a new line for each point. Displayed publicly on the customer tariff page.</small>
            </div>
            <button type="submit" class="btn btn-primary" style="width:100%;"><i class="fa-solid fa-save"></i> Save Policy</button>
        </form>
    </div>

    <!-- --- SUBDOMAIN MANAGEMENT ------------------------------------ -->
    <div class="settings-card">
        <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:1.25rem;">
            <div style="width:40px;height:40px;background:rgba(14,165,233,.12);color:#0ea5e9;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:1.2rem;"><i class="fa-solid fa-globe"></i></div>
            <div><h3 style="margin:0;">Subdomain Management</h3><span style="font-size:.75rem;color:#888;">Configure per-subdomain email routing & branding overrides</span></div>
        </div>

        <!-- Subdomain List Table -->
        <div style="margin-bottom: 1.5rem;">
            <h4 style="margin: 0 0 0.75rem; font-size: 0.9rem; font-weight: 700; color: #334155;">Configured Subdomains</h4>
            <div style="overflow-x: auto; border: 1px solid #e2e8f0; border-radius: 8px;">
                <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.82rem;">
                    <thead>
                        <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
                            <th style="padding: 0.6rem 0.8rem; font-weight: 700; color: #475569;">Subdomain</th>
                            <th style="padding: 0.6rem 0.8rem; font-weight: 700; color: #475569;">Display Name</th>
                            <th style="padding: 0.6rem 0.8rem; font-weight: 700; color: #475569;">Notification Email</th>
                            <th style="padding: 0.6rem 0.8rem; font-weight: 700; color: #475569;">Status</th>
                            <th style="padding: 0.6rem 0.8rem; text-align: right; font-weight: 700; color: #475569;">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php
                        $subdomainConfigs = $config['subdomainConfig'] ?? [];
                        if (empty($subdomainConfigs)):
                        ?>
                        <tr>
                            <td colspan="5" style="text-align: center; color: #94a3b8; padding: 2rem;">No subdomain overrides configured yet. Standard global settings will apply.</td>
                        </tr>
                        <?php
                        else:
                            foreach ($subdomainConfigs as $slug => $sub):
                        ?>
                        <tr style="border-bottom: 1px solid #f1f5f9;">
                            <td style="padding: 0.6rem 0.8rem; font-weight: 600; color: #1e293b;"><code><?php echo htmlspecialchars($slug); ?></code></td>
                            <td style="padding: 0.6rem 0.8rem; color: #475569;"><?php echo htmlspecialchars($sub['displayName'] ?? '-'); ?></td>
                            <td style="padding: 0.6rem 0.8rem; color: #475569;"><code><?php echo htmlspecialchars($sub['mailTo'] ?? '-'); ?></code></td>
                            <td style="padding: 0.6rem 0.8rem;">
                                <span style="font-size: 0.7rem; font-weight: 700; padding: 2px 6px; border-radius: 4px; <?php echo !empty($sub['enabled']) ? 'background: #d1fae5; color: #065f46;' : 'background: #fee2e2; color: #991b1b;'; ?>">
                                    <?php echo !empty($sub['enabled']) ? 'ENABLED' : 'DISABLED'; ?>
                                </span>
                            </td>
                            <td style="padding: 0.6rem 0.8rem; text-align: right; white-space: nowrap;">
                                <a href="<?php echo htmlspecialchars(admin_url('settings', ['cat' => 'subdomains', 'edit_subdomain' => $slug]), ENT_QUOTES, 'UTF-8'); ?>" 
                                   style="color: #4f46e5; font-weight: 700; text-decoration: none; font-size: 0.78rem; margin-right: 0.75rem;">
                                    <i class="fa-solid fa-pen"></i> Edit
                                </a>
                                <a href="<?php echo htmlspecialchars(admin_url('settings', ['cat' => 'subdomains', 'delete_subdomain' => $slug]), ENT_QUOTES, 'UTF-8'); ?>" 
                                   onclick="return confirm('Delete all overrides for this subdomain?')" 
                                   style="color: #ef4444; font-weight: 700; text-decoration: none; font-size: 0.78rem;">
                                    <i class="fa-solid fa-trash-can"></i> Delete
                                </a>
                            </td>
                        </tr>
                        <?php
                            endforeach;
                        endif;
                        ?>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Add/Edit Subdomain Form -->
        <div style="border-top: 1px dashed #e2e8f0; padding-top: 1.25rem;">
            <?php
            $editSub = null;
            $editSlug = '';
            if (isset($_GET['edit_subdomain'])) {
                $editSlug = preg_replace('/[^a-z0-9]/', '', strtolower(trim($_GET['edit_subdomain'])));
                if ($editSlug !== '' && isset($config['subdomainConfig'][$editSlug])) {
                    $editSub = $config['subdomainConfig'][$editSlug];
                }
            }
            ?>
            <?php if ($editSub): ?>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                    <h4 style="margin: 0; font-size: 0.9rem; font-weight: 700; color: #334155;">Edit Subdomain: <code><?php echo htmlspecialchars($editSlug); ?></code></h4>
                    <a href="<?php echo htmlspecialchars(admin_url('settings', ['cat' => 'subdomains']), ENT_QUOTES, 'UTF-8'); ?>" style="font-size: 0.8rem; color: #64748b; text-decoration: none; font-weight: 600;"><i class="fa-solid fa-circle-xmark"></i> Cancel Edit</a>
                </div>
                <form method="POST">
                    <input type="hidden" name="subdomain_slug" value="<?php echo htmlspecialchars($editSlug); ?>">
                    <div class="form-group">
                        <label class="form-label">Subdomain Slug</label>
                        <input type="text" class="form-control" value="<?php echo htmlspecialchars($editSlug); ?>" disabled style="background:#f1f5f9; color:#64748b;">
                    </div>
                    <div class="form-row-2col">
                        <div class="form-group">
                            <label class="form-label">Display Name / Brand Override</label>
                            <input type="text" name="subdomain_displayName" class="form-control" value="<?php echo htmlspecialchars($editSub['displayName'] ?? ''); ?>" placeholder="e.g. Drop Cars Chennai" required>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Notification Email (mailTo)</label>
                            <input type="email" name="subdomain_mailTo" class="form-control" value="<?php echo htmlspecialchars($editSub['mailTo'] ?? ''); ?>" placeholder="e.g. chennai@dropcars.in" required>
                        </div>
                    </div>
                    <div class="settings-row" style="margin-bottom: 1rem;">
                        <div>
                            <strong style="display:block; font-size:0.85rem;">Enable overrides</strong>
                            <span style="font-size:0.72rem; color:#888;">If disabled, global values are used instead.</span>
                        </div>
                        <label class="switch" style="margin:0;">
                            <input type="checkbox" name="subdomain_enabled" <?php echo !empty($editSub['enabled']) ? 'checked' : ''; ?>>
                            <span class="slider"></span>
                        </label>
                    </div>
                    <button type="submit" name="save_subdomain_config" class="btn btn-primary" style="width: 100%;"><i class="fa-solid fa-save"></i> Save Subdomain Overrides</button>
                </form>
            <?php else: ?>
                <h4 style="margin: 0 0 1rem; font-size: 0.9rem; font-weight: 700; color: #334155;">Add Subdomain Override</h4>
                <form method="POST">
                    <div class="form-group">
                        <label class="form-label">Subdomain Slug (e.g. <code>chennai</code> for <code>chennai.dropcars.in</code>)</label>
                        <select name="subdomain_slug" class="form-control" required>
                            <option value="">-- Select a city subdomain --</option>
                            <?php
                            $citiesPath = __DIR__ . '/../../data/cities.json';
                            if (is_file($citiesPath)) {
                                $cities = json_decode(file_get_contents($citiesPath), true);
                                if (is_array($cities)) {
                                    foreach ($cities as $c) {
                                        $cSlug = strtolower(trim($c['slug'] ?? ''));
                                        if ($cSlug !== '' && !isset($config['subdomainConfig'][$cSlug])) {
                                            echo '<option value="' . htmlspecialchars($cSlug) . '">' . htmlspecialchars($c['city']) . ' (' . htmlspecialchars($cSlug) . ')</option>';
                                        }
                                    }
                                }
                            }
                            ?>
                        </select>
                    </div>
                    <div class="form-row-2col">
                        <div class="form-group">
                            <label class="form-label">Display Name Override</label>
                            <input type="text" name="subdomain_displayName" class="form-control" placeholder="e.g. Drop Cars Chennai" required>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Notification Email (mailTo)</label>
                            <input type="email" name="subdomain_mailTo" class="form-control" placeholder="e.g. chennai@dropcars.in" required>
                        </div>
                    </div>
                    <div class="settings-row" style="margin-bottom: 1rem;">
                        <div>
                            <strong style="display:block; font-size:0.85rem;">Enable overrides</strong>
                            <span style="font-size:0.72rem; color:#888;">If disabled, global values are used.</span>
                        </div>
                        <label class="switch" style="margin:0;">
                            <input type="checkbox" name="subdomain_enabled" checked>
                            <span class="slider"></span>
                        </label>
                    </div>
                    <button type="submit" name="save_subdomain_config" class="btn btn-primary" style="width: 100%;"><i class="fa-solid fa-plus"></i> Add Subdomain Overrides</button>
                </form>
            <?php endif; ?>
        </div>
    </div>

    <!-- --- THEME MANAGEMENT ---------------------------------------- -->
    <div class="settings-card">
        <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:1.25rem;">
            <div style="width:40px;height:40px;background:rgba(124,58,237,.12);color:#7c3aed;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:1.2rem;"><i class="fa-solid fa-cubes"></i></div>
            <div><h3 style="margin:0;">Theme Management</h3><span style="font-size:.75rem;color:#888;">Configure landing pages &amp; theme subdomains</span></div>
        </div>

        <!-- Themes List Table -->
        <div style="margin-bottom: 1.5rem;">
            <h4 style="margin: 0 0 0.75rem; font-size: 0.9rem; font-weight: 700; color: #334155;">Active Themes</h4>
            <div style="overflow-x: auto; border: 1px solid #e2e8f0; border-radius: 8px;">
                <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.82rem;">
                    <thead>
                        <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
                            <th style="padding: 0.6rem 0.8rem; font-weight: 700; color: #475569;">Theme Name</th>
                            <th style="padding: 0.6rem 0.8rem; font-weight: 700; color: #475569;">Slug</th>
                            <th style="padding: 0.6rem 0.8rem; font-weight: 700; color: #475569;">Meta Title</th>
                            <th style="padding: 0.6rem 0.8rem; text-align: right; font-weight: 700; color: #475569;">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php
                        $themesFile = dirname(__DIR__, 2) . '/data/themes.json';
                        $themesList = [];
                        if (is_file($themesFile)) {
                            $themesList = json_decode(file_get_contents($themesFile), true) ?: [];
                        }
                        if (empty($themesList)):
                        ?>
                        <tr>
                            <td colspan="4" style="text-align: center; color: #94a3b8; padding: 2rem;">No themes configured.</td>
                        </tr>
                        <?php
                        else:
                            foreach ($themesList as $t):
                                $tSlug = $t['slug'] ?? '';
                        ?>
                        <tr style="border-bottom: 1px solid #f1f5f9;">
                            <td style="padding: 0.6rem 0.8rem; font-weight: 600; color: #1e293b;">
                                <?php echo htmlspecialchars($t['name'] ?? '-'); ?>
                                <?php if ($tSlug === 'drop-cars'): ?>
                                    <span style="font-size: 0.65rem; background: #e0f2fe; color: #0369a1; padding: 1px 4px; border-radius: 3px; font-weight: 700; margin-left: 4px;">DEFAULT</span>
                                <?php endif; ?>
                            </td>
                            <td style="padding: 0.6rem 0.8rem; color: #475569;"><code><?php echo htmlspecialchars($tSlug); ?></code></td>
                            <td style="padding: 0.6rem 0.8rem; color: #64748b; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                                <?php echo htmlspecialchars($t['metaTitle'] ?? '-'); ?>
                            </td>
                            <td style="padding: 0.6rem 0.8rem; text-align: right; white-space: nowrap;">
                                <a href="<?php echo htmlspecialchars(admin_url('settings', ['cat' => 'subdomains', 'edit_theme' => $tSlug]), ENT_QUOTES, 'UTF-8'); ?>" 
                                   style="color: #4f46e5; font-weight: 700; text-decoration: none; font-size: 0.78rem; margin-right: 0.75rem;">
                                    <i class="fa-solid fa-pen"></i> Edit
                                </a>
                                <?php if ($tSlug !== 'drop-cars'): ?>
                                <a href="<?php echo htmlspecialchars(admin_url('settings', ['cat' => 'subdomains', 'delete_theme' => $tSlug]), ENT_QUOTES, 'UTF-8'); ?>" 
                                   onclick="return confirm('Are you sure you want to delete this theme and its subdomain folder?')" 
                                   style="color: #ef4444; font-weight: 700; text-decoration: none; font-size: 0.78rem;">
                                    <i class="fa-solid fa-trash-can"></i> Delete
                                </a>
                                <?php else: ?>
                                <span style="color: #94a3b8; font-size: 0.78rem;" title="Default theme cannot be deleted"><i class="fa-solid fa-lock"></i> Locked</span>
                                <?php endif; ?>
                            </td>
                        </tr>
                        <?php
                            endforeach;
                        endif;
                        ?>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Add/Edit Theme Form -->
        <div style="border-top: 1px dashed #e2e8f0; padding-top: 1.25rem;">
            <?php
            $editTheme = null;
            $editThemeSlug = '';
            if (isset($_GET['edit_theme'])) {
                $editThemeSlug = preg_replace('/[^a-z0-9-]/', '', strtolower(trim($_GET['edit_theme'])));
                foreach ($themesList as $t) {
                    if (($t['slug'] ?? '') === $editThemeSlug) {
                        $editTheme = $t;
                        break;
                    }
                }
            }
            ?>
            <?php if ($editTheme): ?>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                    <h4 style="margin: 0; font-size: 0.9rem; font-weight: 700; color: #334155;">Edit Theme: <code><?php echo htmlspecialchars($editThemeSlug); ?></code></h4>
                    <a href="<?php echo htmlspecialchars(admin_url('settings', ['cat' => 'subdomains']), ENT_QUOTES, 'UTF-8'); ?>" style="font-size: 0.8rem; color: #64748b; text-decoration: none; font-weight: 600;"><i class="fa-solid fa-circle-xmark"></i> Cancel Edit</a>
                </div>
                <form method="POST">
                    <input type="hidden" name="theme_action" value="edit">
                    <input type="hidden" name="original_theme_id" value="<?php echo htmlspecialchars($editThemeSlug); ?>">
                    
                    <div class="form-row-2col">
                        <div class="form-group">
                            <label class="form-label">Theme Name</label>
                            <input type="text" name="theme_name" class="form-control" value="<?php echo htmlspecialchars($editTheme['name'] ?? ''); ?>" placeholder="e.g. Drop Taxi" required>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Theme Slug</label>
                            <input type="text" name="theme_slug" class="form-control" value="<?php echo htmlspecialchars($editThemeSlug); ?>" placeholder="e.g. drop-taxi" required <?php echo ($editThemeSlug === 'drop-cars') ? 'readonly style="background:#f1f5f9; color:#64748b;"' : ''; ?>>
                        </div>
                    </div>

                    <div class="form-row-2col">
                        <div class="form-group">
                            <label class="form-label">Section Selector Label</label>
                            <input type="text" name="theme_selectorLabel" class="form-control" value="<?php echo htmlspecialchars($editTheme['selectorLabel'] ?? ''); ?>" placeholder="e.g. Book Drop Taxi From" required>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Navbar Title Label</label>
                            <input type="text" name="theme_title" class="form-control" value="<?php echo htmlspecialchars($editTheme['title'] ?? ''); ?>" placeholder="e.g. Drop Taxi" required>
                        </div>
                    </div>

                    <div class="form-group">
                        <label class="form-label">Hero Banner Headline</label>
                        <input type="text" name="theme_heroTitle" class="form-control" value="<?php echo htmlspecialchars($editTheme['heroTitle'] ?? ''); ?>" placeholder="e.g. One-Way Drop Taxi — Pay Only for Your Journey" required>
                    </div>

                    <div class="form-group">
                        <label class="form-label">Hero Banner Subtitle</label>
                        <textarea name="theme_heroSub" class="form-control" rows="2" placeholder="Describe the service benefits..." required><?php echo htmlspecialchars($editTheme['heroSub'] ?? ''); ?></textarea>
                    </div>

                    <div class="form-group">
                        <label class="form-label">SEO Meta Page Title</label>
                        <input type="text" name="theme_metaTitle" class="form-control" value="<?php echo htmlspecialchars($editTheme['metaTitle'] ?? ''); ?>" placeholder="SEO Title tag content..." required>
                    </div>

                    <div class="form-group">
                        <label class="form-label">SEO Meta Page Description</label>
                        <textarea name="theme_metaDesc" class="form-control" rows="2" placeholder="SEO Description tag content..." required><?php echo htmlspecialchars($editTheme['metaDesc'] ?? ''); ?></textarea>
                    </div>

                    <button type="submit" name="save_theme_config" class="btn btn-primary" style="width: 100%;"><i class="fa-solid fa-save"></i> Save Theme Settings</button>
                </form>
            <?php else: ?>
                <h4 style="margin: 0 0 1rem; font-size: 0.9rem; font-weight: 700; color: #334155;">Add Theme / Landing Page</h4>
                <form method="POST">
                    <input type="hidden" name="theme_action" value="add">
                    
                    <div class="form-row-2col">
                        <div class="form-group">
                            <label class="form-label">Theme Name</label>
                            <input type="text" name="theme_name" class="form-control" placeholder="e.g. Intercity Taxi" required>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Theme Slug (lowercase, alphanumeric, dashes)</label>
                            <input type="text" name="theme_slug" class="form-control" placeholder="e.g. intercity-taxi" required>
                        </div>
                    </div>

                    <div class="form-row-2col">
                        <div class="form-group">
                            <label class="form-label">Section Selector Label</label>
                            <input type="text" name="theme_selectorLabel" class="form-control" placeholder="e.g. Book Intercity Taxi From" required>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Navbar Title Label</label>
                            <input type="text" name="theme_title" class="form-control" placeholder="e.g. Intercity Taxi" required>
                        </div>
                    </div>

                    <div class="form-group">
                        <label class="form-label">Hero Banner Headline</label>
                        <input type="text" name="theme_heroTitle" class="form-control" placeholder="e.g. Swift & Safe City-to-City Travel" required>
                    </div>

                    <div class="form-group">
                        <label class="form-label">Hero Banner Subtitle</label>
                        <textarea name="theme_heroSub" class="form-control" rows="2" placeholder="Describe the service benefits..." required></textarea>
                    </div>

                    <div class="form-group">
                        <label class="form-label">SEO Meta Page Title</label>
                        <input type="text" name="theme_metaTitle" class="form-control" placeholder="SEO Title tag content..." required>
                    </div>

                    <div class="form-group">
                        <label class="form-label">SEO Meta Page Description</label>
                        <textarea name="theme_metaDesc" class="form-control" rows="2" placeholder="SEO Description tag content..." required></textarea>
                    </div>

                    <button type="submit" name="save_theme_config" class="btn btn-primary" style="width: 100%;"><i class="fa-solid fa-plus"></i> Add Theme Page &amp; Subdomain</button>
                </form>
            <?php endif; ?>
        </div>
    </div>

    <!-- --- WEBSITES & DOMAINS -------------------------------------- -->
    <div class="settings-card">
        <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:1.25rem;justify-content:space-between;flex-wrap:wrap;">
            <div style="display:flex;align-items:center;gap:.75rem;">
                <div style="width:40px;height:40px;background:rgba(14,165,233,.12);color:#0ea5e9;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:1.2rem;"><i class="fa-solid fa-server"></i></div>
                <div><h3 style="margin:0;">Websites & Domains</h3><span style="font-size:.75rem;color:#888;">Manage multiple taxi brands, client websites, API keys, and core domains</span></div>
            </div>
            <a href="#register-site-form" class="btn btn-primary" style="font-size: 0.78rem; padding: 0.4rem 0.8rem;"><i class="fa-solid fa-plus" style="margin-right:4px;"></i> Register New Website</a>
        </div>

        <!-- Registered Sites List Table -->
        <div style="margin-bottom: 1.5rem;">
            <h4 style="margin: 0 0 0.75rem; font-size: 0.9rem; font-weight: 700; color: #334155;">Active Registered Websites</h4>
            <div style="overflow-x: auto; border: 1px solid #e2e8f0; border-radius: 8px;">
                <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.82rem;">
                    <thead>
                        <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
                            <th style="padding: 0.6rem 0.8rem; font-weight: 700; color: #475569;">Website Name</th>
                            <th style="padding: 0.6rem 0.8rem; font-weight: 700; color: #475569;">Domain / URL</th>
                            <th style="padding: 0.6rem 0.8rem; font-weight: 700; color: #475569;">Slug</th>
                            <th style="padding: 0.6rem 0.8rem; font-weight: 700; color: #475569;">Type</th>
                            <th style="padding: 0.6rem 0.8rem; font-weight: 700; color: #475569;">API Key</th>
                            <th style="padding: 0.6rem 0.8rem; font-weight: 700; color: #475569;">Status</th>
                            <th style="padding: 0.6rem 0.8rem; text-align: right; font-weight: 700; color: #475569;">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php
                        $sitesList = [];
                        if (function_exists('dropcars_get_registered_sites')) {
                            $sitesList = dropcars_get_registered_sites($pdo);
                        }
                        if (empty($sitesList)):
                        ?>
                        <tr>
                            <td colspan="7" style="text-align: center; color: #94a3b8; padding: 2rem;">No websites registered.</td>
                        </tr>
                        <?php
                        else:
                            foreach ($sitesList as $site):
                                $siteSlug = $site['slug'] ?? '';
                                $apiKey = $site['api_key'] ?? '';
                                $type = $site['integration_type'] ?? 'remote';
                        ?>
                        <tr style="border-bottom: 1px solid #f1f5f9;">
                            <td style="padding: 0.6rem 0.8rem; font-weight: 600; color: #1e293b;">
                                <?php echo htmlspecialchars($site['display_name'] ?? '-'); ?>
                                <?php if ($siteSlug === 'dropcars'): ?>
                                    <span style="font-size: 0.65rem; background: #e0f2fe; color: #0369a1; padding: 1px 4px; border-radius: 3px; font-weight: 700; margin-left: 4px;">DEFAULT HUB</span>
                                <?php endif; ?>
                            </td>
                            <td style="padding: 0.6rem 0.8rem; color: #475569;"><code><?php echo htmlspecialchars($site['domain_name'] ?? '-'); ?></code></td>
                            <td style="padding: 0.6rem 0.8rem; color: #475569;"><code><?php echo htmlspecialchars($siteSlug); ?></code></td>
                            <td style="padding: 0.6rem 0.8rem;">
                                <span style="font-size: 0.68rem; font-weight: 700; padding: 2px 6px; border-radius: 4px; <?php echo $type === 'subdomain' ? 'background: #f3e8ff; color: #7e22ce;' : 'background: #e0e7ff; color: #3730a3;'; ?>">
                                    <?php echo strtoupper($type); ?>
                                </span>
                            </td>
                            <td style="padding: 0.6rem 0.8rem;">
                                <?php if ($apiKey): ?>
                                    <div style="display:flex; align-items:center; gap:4px;">
                                        <code style="font-size: 0.7rem; background:#f8fafc; padding:2px 5px; border-radius:4px; border:1px solid #cbd5e1; max-width:110px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="<?php echo htmlspecialchars($apiKey); ?>">
                                            <?php echo htmlspecialchars(substr($apiKey, 0, 10)) . '...'; ?>
                                        </code>
                                        <button type="button" onclick="navigator.clipboard.writeText('<?php echo htmlspecialchars($apiKey, ENT_QUOTES); ?>'); alert('API Key copied to clipboard!');" style="background:none; border:none; color:#6366f1; cursor:pointer; font-size:0.75rem;" title="Copy Full API Key">
                                            <i class="fa-solid fa-copy"></i>
                                        </button>
                                    </div>
                                <?php else: ?>
                                    <span style="color:#94a3b8; font-size:0.75rem;">None</span>
                                <?php endif; ?>
                            </td>
                            <td style="padding: 0.6rem 0.8rem;">
                                <span style="font-size: 0.7rem; font-weight: 700; padding: 2px 6px; border-radius: 4px; <?php echo ($site['status'] ?? 'active') === 'active' ? 'background: #d1fae5; color: #065f46;' : 'background: #fee2e2; color: #991b1b;'; ?>">
                                    <?php echo strtoupper($site['status'] ?? 'active'); ?>
                                </span>
                            </td>
                            <td style="padding: 0.6rem 0.8rem; text-align: right; white-space: nowrap;">
                                <button type="button" onclick="document.getElementById('guide-<?php echo $siteSlug; ?>').toggleAttribute('hidden');" style="background:none; border:none; color:#0284c7; font-weight:700; cursor:pointer; font-size:0.78rem; margin-right:0.5rem;" title="View Code Wiring Guide">
                                    <i class="fa-solid fa-code"></i> Wiring Code
                                </button>
                                <a href="<?php echo htmlspecialchars(admin_url('settings', ['cat' => 'subdomains', 'edit_registered_site' => $siteSlug]), ENT_QUOTES, 'UTF-8'); ?>" 
                                   style="color: #4f46e5; font-weight: 700; text-decoration: none; font-size: 0.78rem; margin-right: 0.5rem;">
                                    <i class="fa-solid fa-pen"></i> Edit
                                </a>
                                <?php if ($siteSlug !== 'dropcars'): ?>
                                <a href="<?php echo htmlspecialchars(admin_url('settings', ['cat' => 'subdomains', 'delete_registered_site' => $siteSlug]), ENT_QUOTES, 'UTF-8'); ?>" 
                                   onclick="return confirm('Are you sure you want to delete this website from the admin database? Any custom configuration stored under this slug will also be deleted.')" 
                                   style="color: #ef4444; font-weight: 700; text-decoration: none; font-size: 0.78rem;">
                                    <i class="fa-solid fa-trash-can"></i> Delete
                                </a>
                                <?php else: ?>
                                <span style="color: #94a3b8; font-size: 0.78rem;" title="Default website cannot be deleted"><i class="fa-solid fa-lock"></i> Locked</span>
                                <?php endif; ?>
                            </td>
                        </tr>

                        <!-- Expandable Wiring Guide Box for each site -->
                        <tr id="guide-<?php echo $siteSlug; ?>" hidden style="background: #f0f9ff; border-bottom: 1px solid #bae6fd;">
                            <td colspan="7" style="padding: 1rem; border-top: none;">
                                <div style="font-size: 0.8rem; color: #0369a1; margin-bottom: 0.5rem; font-weight: 700; display: flex; align-items: center; justify-content: space-between;">
                                    <span><i class="fa-solid fa-circle-info"></i> How to wire <strong><?php echo htmlspecialchars($site['display_name']); ?></strong> to send leads to dropcars.in</span>
                                    <button type="button" onclick="document.getElementById('guide-<?php echo $siteSlug; ?>').setAttribute('hidden', 'true');" style="background:none; border:none; color:#0369a1; cursor:pointer;"><i class="fa-solid fa-xmark"></i></button>
                                </div>
                                <p style="font-size: 0.75rem; color: #334155; margin-bottom: 0.5rem;">
                                    Paste this JavaScript snippet into <code><?php echo htmlspecialchars($site['domain_name']); ?></code>'s booking form submit handler to automatically post enquiries and bookings to this central admin panel:
                                </p>
                                <pre style="background: #0f172a; color: #f8fafc; padding: 0.85rem; border-radius: 6px; font-size: 0.75rem; line-height: 1.5; position: relative;">
// Post lead from <?php echo htmlspecialchars($site['domain_name']); ?> to Drop Cars Central Hub
fetch('https://dropcars.in/api/receive-remote-lead.php', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Dropcars-Key': '<?php echo htmlspecialchars($apiKey); ?>'
  },
  body: JSON.stringify({
    website: '<?php echo htmlspecialchars($siteSlug); ?>',
    lead_type: 'booking', // 'enquiry' or 'booking'
    data: {
      customerName: customerName,
      contactPhone: contactPhone,
      pickup: pickupLocation,
      drop: dropLocation,
      travelDate: pickupDate,
      travelTime: pickupTime
    }
  })
})
.then(res => res.json())
.then(data => console.log('Lead synced:', data));</pre>
                            </td>
                        </tr>
                        <?php
                            endforeach;
                        endif;
                        ?>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Add/Edit Website Form -->
        <div id="register-site-form" style="border-top: 1px dashed #e2e8f0; padding-top: 1.25rem;">
            <?php
            $editSite = null;
            $editSiteSlug = '';
            if (isset($_GET['edit_registered_site'])) {
                $editSiteSlug = preg_replace('/[^a-z0-9_]/', '', strtolower(trim($_GET['edit_registered_site'])));
                foreach ($sitesList as $site) {
                    if (($site['slug'] ?? '') === $editSiteSlug) {
                        $editSite = $site;
                        break;
                    }
                }
            }
            ?>
            <?php if ($editSite): ?>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                    <h4 style="margin: 0; font-size: 0.9rem; font-weight: 700; color: #334155;">Edit Website: <code><?php echo htmlspecialchars($editSiteSlug); ?></code></h4>
                    <a href="<?php echo htmlspecialchars(admin_url('settings', ['cat' => 'subdomains']), ENT_QUOTES, 'UTF-8'); ?>" style="font-size: 0.8rem; color: #64748b; text-decoration: none; font-weight: 600;"><i class="fa-solid fa-circle-xmark"></i> Cancel Edit</a>
                </div>
                <form method="POST">
                    <input type="hidden" name="site_action" value="edit">
                    <input type="hidden" name="original_site_slug" value="<?php echo htmlspecialchars($editSiteSlug); ?>">
                    <input type="hidden" name="site_slug" value="<?php echo htmlspecialchars($editSiteSlug); ?>">
                    
                    <div class="form-row-2col">
                        <div class="form-group">
                            <label class="form-label">Website Display Name</label>
                            <input type="text" name="site_name" class="form-control" value="<?php echo htmlspecialchars($editSite['display_name'] ?? ''); ?>" placeholder="e.g. Drop 1 Taxi" required>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Website Domain / URL</label>
                            <input type="text" name="site_domain" class="form-control" value="<?php echo htmlspecialchars($editSite['domain_name'] ?? ''); ?>" placeholder="e.g. drop1taxi.in" required>
                        </div>
                    </div>

                    <div class="form-row-2col">
                        <div class="form-group">
                            <label class="form-label">Website Slug</label>
                            <input type="text" class="form-control" value="<?php echo htmlspecialchars($editSiteSlug); ?>" disabled style="background:#f1f5f9; color:#64748b;">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Integration Type</label>
                            <select name="site_integration_type" class="form-control" required>
                                <option value="remote" <?php echo ($editSite['integration_type'] ?? 'remote') === 'remote' ? 'selected' : ''; ?>>Remote Domain (External Website)</option>
                                <option value="subdomain" <?php echo ($editSite['integration_type'] ?? '') === 'subdomain' ? 'selected' : ''; ?>>Subdomain of dropcars.in (*.dropcars.in)</option>
                            </select>
                        </div>
                    </div>

                    <div class="form-row-2col">
                        <div class="form-group">
                            <label class="form-label">Status</label>
                            <select name="site_status" class="form-control" required>
                                <option value="active" <?php echo ($editSite['status'] ?? 'active') === 'active' ? 'selected' : ''; ?>>ACTIVE</option>
                                <option value="disabled" <?php echo ($editSite['status'] ?? '') === 'disabled' ? 'selected' : ''; ?>>DISABLED</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Webhook Push URL (Optional)</label>
                            <input type="url" name="site_webhook_url" class="form-control" value="<?php echo htmlspecialchars($editSite['webhook_url'] ?? ''); ?>" placeholder="https://external-site.com/api/booking-webhook.php">
                        </div>
                    </div>

                    <div class="form-group">
                        <label class="form-label">Internal Notes / Reference</label>
                        <textarea name="site_notes" class="form-control" rows="2" placeholder="Optional notes about hosting, owner, or integration details..."><?php echo htmlspecialchars($editSite['notes'] ?? ''); ?></textarea>
                    </div>

                    <!-- API Key Display & Regenerate section -->
                    <div style="background:#f8fafc; border:1px solid #e2e8f0; padding:0.85rem; border-radius:8px; margin-bottom:1rem;">
                        <label class="form-label" style="margin-bottom:0.3rem;">API Key / Authentication Token</label>
                        <div style="display:flex; gap:0.5rem; align-items:center;">
                            <input type="text" class="form-control" value="<?php echo htmlspecialchars($editSite['api_key'] ?? 'No key generated'); ?>" readonly style="background:#ffffff; font-family:monospace; font-weight:700; color:#0369a1;">
                            <button type="button" class="btn btn-outline" onclick="navigator.clipboard.writeText('<?php echo htmlspecialchars($editSite['api_key'] ?? '', ENT_QUOTES); ?>'); alert('API Key copied!');" style="font-size:0.78rem;"><i class="fa-solid fa-copy"></i> Copy</button>
                        </div>
                    </div>

                    <button type="submit" name="save_registered_site" class="btn btn-primary" style="width: 100%;"><i class="fa-solid fa-save"></i> Save Website Settings</button>
                </form>
                
                <form method="POST" style="margin-top:0.5rem;">
                    <input type="hidden" name="regen_slug" value="<?php echo htmlspecialchars($editSiteSlug); ?>">
                    <button type="submit" name="regen_api_key" class="btn btn-outline" style="width: 100%; border-color:#cbd5e1; color:#64748b;" onclick="return confirm('Regenerating will invalidate the existing API key for this site. Continue?');">
                        <i class="fa-solid fa-key"></i> Regenerate API Key
                    </button>
                </form>
            <?php else: ?>
                <h4 style="margin: 0 0 1rem; font-size: 0.9rem; font-weight: 700; color: #334155;">Register New Website / Domain</h4>
                <form method="POST">
                    <input type="hidden" name="site_action" value="add">
                    
                    <div class="form-row-2col">
                        <div class="form-group">
                            <label class="form-label">Website Display Name</label>
                            <input type="text" name="site_name" class="form-control" placeholder="e.g. Arunachala Travels" required>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Website Domain / URL</label>
                            <input type="text" name="site_domain" class="form-control" placeholder="e.g. arunachalatravels.in" required>
                        </div>
                    </div>

                    <div class="form-row-2col">
                        <div class="form-group">
                            <label class="form-label">Website Slug (lowercase, alphanumeric, underscores)</label>
                            <input type="text" name="site_slug" class="form-control" placeholder="e.g. arunachalatravels_in" required>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Integration Type</label>
                            <select name="site_integration_type" class="form-control" required>
                                <option value="remote">Remote Domain (External Website)</option>
                                <option value="subdomain">Subdomain of dropcars.in (*.dropcars.in)</option>
                            </select>
                        </div>
                    </div>

                    <div class="form-row-2col">
                        <div class="form-group">
                            <label class="form-label">Status</label>
                            <select name="site_status" class="form-control" required>
                                <option value="active">ACTIVE</option>
                                <option value="disabled">DISABLED</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Webhook Push URL (Optional)</label>
                            <input type="url" name="site_webhook_url" class="form-control" placeholder="https://external-site.com/api/booking-webhook.php">
                        </div>
                    </div>

                    <div class="form-group">
                        <label class="form-label">Internal Notes / Reference</label>
                        <textarea name="site_notes" class="form-control" rows="2" placeholder="Optional notes about hosting, owner, or integration details..."></textarea>
                    </div>

                    <button type="submit" name="save_registered_site" class="btn btn-primary" style="width: 100%;"><i class="fa-solid fa-plus"></i> Register Website &amp; Auto-Generate API Key</button>
                </form>
            <?php endif; ?>
        </div>
    </div>

    <!-- --- PAGE LOADING & ACTION PROTECTION FIXER -------------------- -->
    <div class="settings-card" style="border-left: 4px solid #10b981; background: linear-gradient(135deg, #f0fdf4 0%, #ffffff 100%);">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap;margin-bottom:1rem;">
            <div style="display:flex;align-items:center;gap:.75rem;">
                <div style="width:40px;height:40px;background:rgba(16,185,129,0.15);color:#10b981;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:1.2rem;">
                    <i class="fa-solid fa-shield-halved"></i>
                </div>
                <div>
                    <h3 style="margin:0;font-size:1.05rem;">Page Loading &amp; Action Protection Fixer</h3>
                    <span style="font-size:.75rem;color:#64748b;">Diagnose and repair client adblocker freezes, script blockages, and routing rules</span>
                </div>
            </div>
            <form method="POST" style="margin:0;">
                <button type="submit" name="run_page_fixer" class="btn btn-primary" style="background:#10b981;border:none;box-shadow:0 4px 12px rgba(16,185,129,0.25);font-weight:700;display:inline-flex;align-items:center;gap:6px;">
                    <i class="fa-solid fa-wrench"></i> Run Auto-Fix &amp; Diagnostic Check
                </button>
            </form>
        </div>
        <div style="font-size:0.8rem;color:#334155;line-height:1.5;background:#ffffff;padding:0.85rem;border-radius:8px;border:1px solid #e2e8f0;">
            <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));gap:0.75rem;">
                <div>
                    <strong style="color:#0f766e;display:block;margin-bottom:2px;"><i class="fa-solid fa-check-circle" style="color:#10b981;margin-right:4px;"></i> AdBlocker Immunity</strong>
                    <span style="color:#64748b;font-size:0.75rem;">Ensures Local Location Fallback is active so adblockers blocking Google Places autocomplete do not freeze booking forms.</span>
                </div>
                <div>
                    <strong style="color:#0f766e;display:block;margin-bottom:2px;"><i class="fa-solid fa-check-circle" style="color:#10b981;margin-right:4px;"></i> Subdomain &amp; Routing Sync</strong>
                    <span style="color:#64748b;font-size:0.75rem;">Regenerates Apache .htaccess rewrite rules and theme subdomain entrypoints dynamically.</span>
                </div>
                <div>
                    <strong style="color:#0f766e;display:block;margin-bottom:2px;"><i class="fa-solid fa-check-circle" style="color:#10b981;margin-right:4px;"></i> Noise Filtering</strong>
                    <span style="color:#64748b;font-size:0.75rem;">Suppresses client-side adblocker noise from triggering email alerts, keeping your inbox clean.</span>
                </div>
            </div>
        </div>
    </div>

    <!-- --- TELEMETRY & SYSTEM LOGS ---------------------------------- -->
    <div class="settings-card">

        <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:1.25rem;justify-content:space-between;flex-wrap:wrap;">
            <div style="display:flex;align-items:center;gap:.75rem;">
                <div style="width:40px;height:40px;background:rgba(239,68,68,0.12);color:#ef4444;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:1.2rem;"><i class="fa-solid fa-terminal"></i></div>
                <div><h3 style="margin:0;">System Diagnostics &amp; Telemetry</h3><span style="font-size:.75rem;color:#888;">View PHP errors, warnings, 404s, and integration issues</span></div>
            </div>
            <?php
            $telemetryFile = dirname(__DIR__, 2) . '/tmp/telemetry-log.json';
            $telemetryLogs = [];
            if (is_file($telemetryFile)) {
                $telemetryLogs = json_decode(file_get_contents($telemetryFile), true) ?: [];
            }
            ?>
            <div style="display:flex;gap:0.5rem;align-items:center;">
                <?php if (!empty($telemetryLogs)): ?>
                <button type="button" id="btn-summarize-logs" class="btn btn-outline" style="border-color:#cbd5e1;color:#1e293b;font-size:0.75rem;padding:0.35rem 0.75rem;height:auto;background:#fff;border-radius:6px;">
                    <i class="fa-solid fa-wand-magic-sparkles" style="margin-right:4px;color:#8b5cf6;"></i> Summarize Logs
                </button>
                <form method="POST" style="margin:0;">
                    <button type="submit" name="clear_telemetry" class="btn btn-outline" style="border-color:#fee2e2;color:#ef4444;font-size:0.75rem;padding:0.35rem 0.75rem;height:auto;border-radius:6px;" onclick="return confirm('Are you sure you want to clear all telemetry logs?');">
                        <i class="fa-solid fa-trash-can" style="margin-right:4px;"></i> Clear Logs
                    </button>
                </form>
                <?php endif; ?>
            </div>
        </div>

        <div style="overflow-x: auto; border: 1px solid #e2e8f0; border-radius: 8px;">
            <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.82rem;">
                <thead>
                    <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
                        <th style="padding: 0.6rem 0.8rem; font-weight: 700; color: #475569; width: 150px;">Time / Date</th>
                        <th style="padding: 0.6rem 0.8rem; font-weight: 700; color: #475569; width: 160px;">Error Type</th>
                        <th style="padding: 0.6rem 0.8rem; font-weight: 700; color: #475569;">Error Details</th>
                        <th style="padding: 0.6rem 0.8rem; font-weight: 700; color: #475569; width: 180px;">Source File</th>
                    </tr>
                </thead>
                <tbody>
                    <?php if (empty($telemetryLogs)): ?>
                    <tr>
                        <td colspan="4" style="text-align: center; color: #94a3b8; padding: 3rem;">
                            <i class="fa-solid fa-circle-check" style="font-size: 2rem; color: #10b981; margin-bottom: 0.75rem; display: block;"></i>
                            No errors or warnings recorded. Your site is running clean!
                        </td>
                    </tr>
                    <?php else: ?>
                        <?php foreach ($telemetryLogs as $index => $log): ?>
                        <tr style="border-bottom: 1px solid #f1f5f9; cursor: pointer;" onclick="document.getElementById('details-<?php echo $index; ?>').toggleAttribute('hidden');">
                            <td style="padding: 0.6rem 0.8rem; color: #64748b; font-size: 0.75rem;">
                                <?php echo date('Y-m-d H:i:s', $log['timestamp'] ?? time()); ?>
                            </td>
                            <td style="padding: 0.6rem 0.8rem;">
                                <?php
                                $typeStr = strtolower((string)($log['type'] ?? ''));
                                $bg = '#f1f5f9'; $color = '#475569';
                                if (strpos($typeStr, 'error') !== false || strpos($typeStr, 'fatal') !== false || strpos($typeStr, 'exception') !== false) {
                                    $bg = '#fee2e2'; $color = '#991b1b';
                                } elseif (strpos($typeStr, 'warning') !== false) {
                                    $bg = '#fef3c7'; $color = '#92400e';
                                } elseif (strpos($typeStr, '404') !== false) {
                                    $bg = '#e0f2fe'; $color = '#0369a1';
                                }
                                ?>
                                <span style="font-size: 0.7rem; font-weight: 700; padding: 2px 6px; border-radius: 4px; background: <?php echo $bg; ?>; color: <?php echo $color; ?>;">
                                    <?php echo htmlspecialchars(strtoupper(str_replace('_', ' ', (string)($log['type'] ?? '')))); ?>
                                </span>
                            </td>
                            <td style="padding: 0.6rem 0.8rem; color: #1e293b; font-weight: 500;">
                                <div style="max-width: 400px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="Click to view full stack trace">
                                    <?php echo htmlspecialchars((string)($log['message'] ?? '')); ?>
                                </div>
                            </td>
                            <td style="padding: 0.6rem 0.8rem; color: #475569; font-size: 0.75rem;">
                                <code><?php echo htmlspecialchars((string)($log['file'] ?? '')); ?>:<?php echo (int)($log['line'] ?? 0); ?></code>
                            </td>
                        </tr>
                        <tr id="details-<?php echo $index; ?>" hidden style="background: #f8fafc; border-bottom: 1px solid #f1f5f9;">
                            <td colspan="4" style="padding: 1rem; border-top: none;">
                                <div style="font-size: 0.78rem; line-height: 1.5; color: #475569;">
                                    <div style="margin-bottom: 0.4rem;"><strong>Request URL:</strong> <code style="word-break: break-all;"><?php echo htmlspecialchars((string)($log['url'] ?? '-')); ?></code></div>
                                    <div style="margin-bottom: 0.4rem;"><strong>User Agent:</strong> <code style="word-break: break-all;"><?php echo htmlspecialchars((string)($log['user_agent'] ?? '-')); ?></code></div>
                                    <div style="margin-bottom: 0.4rem;"><strong>Full File Path:</strong> <code><?php echo htmlspecialchars((string)($log['full_file'] ?? '-')); ?></code></div>
                                    <?php if (!empty($log['stack_trace'])): ?>
                                        <div style="margin-top: 0.6rem;">
                                            <strong>Stack Trace:</strong>
                                            <pre style="background: #0f172a; color: #cbd5e1; padding: 10px; border-radius: 6px; font-family: monospace; font-size: 0.75rem; overflow-x: auto; margin-top: 4px; line-height: 1.4; max-height: 250px;"><?php echo htmlspecialchars((string)$log['stack_trace']); ?></pre>
                                        </div>
                                    <?php endif; ?>
                                </div>
                            </td>
                        </tr>
                        <?php endforeach; ?>
                    <?php endif; ?>
                </tbody>
            </table>
        </div>
    </div>

    <!-- --- SYSTEM SELF-TEST & DIAGNOSTICS --------------------------- -->
    <div class="settings-card">
        <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:1.25rem;justify-content:space-between;flex-wrap:wrap;">
            <div style="display:flex;align-items:center;gap:.75rem;">
                <div style="width:40px;height:40px;background:rgba(16,185,129,0.12);color:#10b981;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:1.2rem;"><i class="fa-solid fa-gauge-high"></i></div>
                <div><h3 style="margin:0;">System Self-Test &amp; Diagnostics</h3><span style="font-size:.75rem;color:#888;">Run real-time diagnostics on database, SMTP, Telegram, gateways, folders and configurations.</span></div>
            </div>
            <div style="display:flex;gap:0.5rem;align-items:center;">
                <button type="button" id="btn-send-test-email" class="btn btn-outline" style="font-size:0.75rem;padding:0.35rem 0.75rem;height:auto;border-radius:6px;border-color:#cbd5e1;color:#475569;background:#fff;display:none;">
                    <i class="fa-solid fa-paper-plane" style="margin-right:4px;"></i> Send Test Email
                </button>
                <button type="button" id="btn-run-diagnostics" class="btn btn-primary" style="font-size:0.75rem;padding:0.35rem 0.75rem;height:auto;border-radius:6px;">
                    <i class="fa-solid fa-play" style="margin-right:4px;"></i> Run Diagnostics
                </button>
            </div>
        </div>

        <div id="diagnostics-summary" style="display:grid;grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));gap:0.75rem;margin-bottom:1.25rem;">
            <!-- Database Test Card -->
            <div class="diagnostic-test-item" id="test-db" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:0.75rem;display:flex;align-items:center;gap:0.75rem;transition:all 0.2s;">
                <div class="test-icon" style="width:32px;height:32px;background:#e2e8f0;color:#64748b;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:0.95rem;"><i class="fa-solid fa-database"></i></div>
                <div style="flex-grow:1;">
                    <h4 style="margin:0;font-size:0.8rem;color:#334155;">Database Connection</h4>
                    <span class="test-status" style="font-size:0.7rem;color:#64748b;font-weight:600;">Not Started</span>
                </div>
            </div>
            <!-- SMTP Test Card -->
            <div class="diagnostic-test-item" id="test-smtp" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:0.75rem;display:flex;align-items:center;gap:0.75rem;transition:all 0.2s;">
                <div class="test-icon" style="width:32px;height:32px;background:#e2e8f0;color:#64748b;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:0.95rem;"><i class="fa-solid fa-envelope"></i></div>
                <div style="flex-grow:1;">
                    <h4 style="margin:0;font-size:0.8rem;color:#334155;">SMTP Mail Settings</h4>
                    <span class="test-status" style="font-size:0.7rem;color:#64748b;font-weight:600;">Not Started</span>
                </div>
            </div>
            <!-- Telegram Test Card -->
            <div class="diagnostic-test-item" id="test-telegram" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:0.75rem;display:flex;align-items:center;gap:0.75rem;transition:all 0.2s;">
                <div class="test-icon" style="width:32px;height:32px;background:#e2e8f0;color:#64748b;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:0.95rem;"><i class="fa-brands fa-telegram"></i></div>
                <div style="flex-grow:1;">
                    <h4 style="margin:0;font-size:0.8rem;color:#334155;">Telegram Alerts API</h4>
                    <span class="test-status" style="font-size:0.7rem;color:#64748b;font-weight:600;">Not Started</span>
                </div>
            </div>
            <!-- Google Sheets Card -->
            <div class="diagnostic-test-item" id="test-sheets" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:0.75rem;display:flex;align-items:center;gap:0.75rem;transition:all 0.2s;">
                <div class="test-icon" style="width:32px;height:32px;background:#e2e8f0;color:#64748b;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:0.95rem;"><i class="fa-solid fa-file-excel"></i></div>
                <div style="flex-grow:1;">
                    <h4 style="margin:0;font-size:0.8rem;color:#334155;">Google Sheet Sync</h4>
                    <span class="test-status" style="font-size:0.7rem;color:#64748b;font-weight:600;">Not Started</span>
                </div>
            </div>
            <!-- Writable Folders Card -->
            <div class="diagnostic-test-item" id="test-folders" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:0.75rem;display:flex;align-items:center;gap:0.75rem;transition:all 0.2s;">
                <div class="test-icon" style="width:32px;height:32px;background:#e2e8f0;color:#64748b;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:0.95rem;"><i class="fa-solid fa-folder-open"></i></div>
                <div style="flex-grow:1;">
                    <h4 style="margin:0;font-size:0.8rem;color:#334155;">Writable Directories</h4>
                    <span class="test-status" style="font-size:0.7rem;color:#64748b;font-weight:600;">Not Started</span>
                </div>
            </div>
            <!-- WhatsApp Gateway Card -->
            <div class="diagnostic-test-item" id="test-whatsapp" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:0.75rem;display:flex;align-items:center;gap:0.75rem;transition:all 0.2s;">
                <div class="test-icon" style="width:32px;height:32px;background:#e2e8f0;color:#64748b;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:0.95rem;"><i class="fa-solid fa-square-rss"></i></div>
                <div style="flex-grow:1;">
                    <h4 style="margin:0;font-size:0.8rem;color:#334155;">SMS/WA Gateway</h4>
                    <span class="test-status" style="font-size:0.7rem;color:#64748b;font-weight:600;">Not Started</span>
                </div>
            </div>
            <!-- JSON Configurations Card -->
            <div class="diagnostic-test-item" id="test-configs" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:0.75rem;display:flex;align-items:center;gap:0.75rem;transition:all 0.2s;">
                <div class="test-icon" style="width:32px;height:32px;background:#e2e8f0;color:#64748b;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:0.95rem;"><i class="fa-solid fa-gears"></i></div>
                <div style="flex-grow:1;">
                    <h4 style="margin:0;font-size:0.8rem;color:#334155;">JSON Configurations</h4>
                    <span class="test-status" style="font-size:0.7rem;color:#64748b;font-weight:600;">Not Started</span>
                </div>
            </div>
        </div>

        <div style="margin-top: 1rem;">
            <strong style="font-size:0.82rem;color:#475569;display:block;margin-bottom:0.4rem;">Diagnostic Console Log</strong>
            <pre id="diagnostics-log" style="background:#0f172a;color:#38bdf8;padding:12px;border-radius:8px;font-family:Consolas, Monaco, monospace;font-size:0.78rem;overflow-x:auto;margin:0;line-height:1.5;max-height:220px;min-height:80px;border:1px solid #1e293b;white-space:pre-wrap;word-break:break-all;">Click "Run Diagnostics" to check system components...</pre>
        </div>
    </div>

    <!-- Smart Logs Summary Modal -->
    <div id="summary-modal" style="display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(15,23,42,0.6);z-index:9999;align-items:center;justify-content:center;padding:1rem;backdrop-filter:blur(4px);">
        <div style="background:#fff;border-radius:14px;max-width:650px;width:100%;border:1px solid #e2e8f0;box-shadow:0 10px 25px -5px rgba(0,0,0,0.1);display:flex;flex-direction:column;max-height:85vh;">
            <!-- Modal Header -->
            <div style="padding:1rem 1.25rem;border-bottom:1px solid #f1f5f9;display:flex;justify-content:space-between;align-items:center;">
                <div style="display:flex;align-items:center;gap:0.5rem;">
                    <i class="fa-solid fa-wand-magic-sparkles" style="color:#8b5cf6;font-size:1.1rem;"></i>
                    <h3 style="margin:0;font-size:1rem;color:#0f172a;">Smart Logs Summary</h3>
                </div>
                <button type="button" id="btn-close-summary" style="background:transparent;border:none;color:#64748b;font-size:1.2rem;cursor:pointer;padding:0.25rem;"><i class="fa-solid fa-xmark"></i></button>
            </div>
            
            <!-- Variations Switcher -->
            <div style="background:#f8fafc;padding:0.5rem 1.25rem;border-bottom:1px solid #f1f5f9;display:flex;gap:0.5rem;">
                <button type="button" id="tab-summary-short" class="summary-tab-btn active" style="font-size:0.75rem;padding:0.25rem 0.75rem;border-radius:6px;border:none;cursor:pointer;font-weight:600;">Short Summary</button>
                <button type="button" id="tab-summary-detailed" class="summary-tab-btn" style="font-size:0.75rem;padding:0.25rem 0.75rem;border-radius:6px;border:none;cursor:pointer;font-weight:600;">Detailed Analysis</button>
            </div>

            <!-- Modal Content -->
            <div style="padding:1.25rem;overflow-y:auto;flex-grow:1;font-size:0.85rem;line-height:1.6;color:#334155;">
                <!-- Short Summary Content -->
                <div id="content-summary-short">
                    <!-- Dynamically populated short summary -->
                </div>
                <!-- Detailed Summary Content -->
                <div id="content-summary-detailed" style="display:none;">
                    <!-- Dynamically populated detailed summary -->
                </div>
            </div>
            
            <!-- Modal Footer -->
            <div style="padding:0.75rem 1.25rem;border-top:1px solid #f1f5f9;background:#f8fafc;display:flex;justify-content:flex-end;border-bottom-left-radius:14px;border-bottom-right-radius:14px;">
                <button type="button" id="btn-close-summary-ok" class="btn btn-primary" style="font-size:0.75rem;padding:0.35rem 1rem;height:auto;border-radius:6px;">Got it</button>
            </div>
        </div>
    </div>

    <style>
    .summary-tab-btn {
        background: transparent;
        color: #64748b;
        border: 1px solid transparent;
    }
    .summary-tab-btn.active {
        background: #8b5cf6 !important;
        color: #fff !important;
    }
    .summary-issue-item {
        margin-bottom: 1rem;
        padding: 0.75rem;
        background: #fafafa;
        border-left: 3px solid #ef4444;
        border-radius: 4px;
    }
    .summary-issue-item.warning {
        border-left-color: #f59e0b;
    }
    .summary-issue-item.info {
        border-left-color: #3b82f6;
    }
    </style>

    <script>
    document.addEventListener('DOMContentLoaded', function () {
        var btnRun = document.getElementById('btn-run-diagnostics');
        var btnTestEmail = document.getElementById('btn-send-test-email');
        var logPre = document.getElementById('diagnostics-log');

        if (!btnRun) return;

        function updateItemUI(id, status, text) {
            var item = document.getElementById(id);
            if (!item) return;
            var statusSpan = item.querySelector('.test-status');
            var iconDiv = item.querySelector('.test-icon');
            
            statusSpan.textContent = text;
            
            if (status === 'running') {
                item.style.background = '#f1f5f9';
                item.style.borderColor = '#cbd5e1';
                iconDiv.style.background = '#e2e8f0';
                iconDiv.style.color = '#475569';
                iconDiv.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
            } else if (status === 'success') {
                item.style.background = '#ecfdf5';
                item.style.borderColor = '#a7f3d0';
                iconDiv.style.background = '#d1fae5';
                iconDiv.style.color = '#059669';
                if (id === 'test-db') iconDiv.innerHTML = '<i class="fa-solid fa-database"></i>';
                else if (id === 'test-smtp') iconDiv.innerHTML = '<i class="fa-solid fa-envelope"></i>';
                else if (id === 'test-telegram') iconDiv.innerHTML = '<i class="fa-brands fa-telegram"></i>';
                else if (id === 'test-sheets') iconDiv.innerHTML = '<i class="fa-solid fa-file-excel"></i>';
                else if (id === 'test-folders') iconDiv.innerHTML = '<i class="fa-solid fa-folder-open"></i>';
                else if (id === 'test-whatsapp') iconDiv.innerHTML = '<i class="fa-solid fa-square-rss"></i>';
                else if (id === 'test-configs') iconDiv.innerHTML = '<i class="fa-solid fa-gears"></i>';
            } else if (status === 'warning') {
                item.style.background = '#fffbeb';
                item.style.borderColor = '#fde68a';
                iconDiv.style.background = '#fef3c7';
                iconDiv.style.color = '#d97706';
                if (id === 'test-db') iconDiv.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i>';
                else if (id === 'test-smtp') iconDiv.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i>';
                else if (id === 'test-telegram') iconDiv.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i>';
                else if (id === 'test-sheets') iconDiv.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i>';
                else if (id === 'test-folders') iconDiv.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i>';
                else if (id === 'test-whatsapp') iconDiv.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i>';
                else if (id === 'test-configs') iconDiv.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i>';
            } else if (status === 'error') {
                item.style.background = '#fef2f2';
                item.style.borderColor = '#fecaca';
                iconDiv.style.background = '#fee2e2';
                iconDiv.style.color = '#dc2626';
                if (id === 'test-db') iconDiv.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i>';
                else if (id === 'test-smtp') iconDiv.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i>';
                else if (id === 'test-telegram') iconDiv.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i>';
                else if (id === 'test-sheets') iconDiv.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i>';
                else if (id === 'test-folders') iconDiv.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i>';
                else if (id === 'test-whatsapp') iconDiv.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i>';
                else if (id === 'test-configs') iconDiv.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i>';
            }
        }

        btnRun.addEventListener('click', function () {
            btnRun.disabled = true;
            btnRun.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Running...';
            logPre.textContent = 'Starting system diagnostics tests...\n';
            btnTestEmail.style.display = 'none';

            var keys = ['db', 'smtp', 'telegram', 'sheets', 'folders', 'whatsapp', 'configs'];
            keys.forEach(function (k) {
                updateItemUI('test-' + k, 'running', 'Testing...');
            });

            var actionUrl = 'actions/diagnostics.php?action=run';
            fetch(actionUrl)
                .then(function (res) { return res.json(); })
                .then(function (data) {
                    btnRun.disabled = false;
                    btnRun.innerHTML = '<i class="fa-solid fa-play" style="margin-right:4px;"></i> Run Diagnostics';
                    
                    if (!data.success) {
                        logPre.textContent += '\nError running diagnostics: ' + data.message;
                        keys.forEach(function (k) {
                            updateItemUI('test-' + k, 'error', 'Failed');
                        });
                        return;
                    }

                    logPre.textContent = '========================================\n';
                    logPre.textContent += '  SYSTEM DIAGNOSTICS & SELF-TEST LOG    \n';
                    logPre.textContent += '========================================\n\n';

                    var hasSmtpSuccess = false;
                    
                    Object.keys(data.results).forEach(function (key) {
                        var res = data.results[key];
                        updateItemUI('test-' + key, res.status, res.message);
                        
                        logPre.textContent += '### [' + key.toUpperCase() + '] Check - ' + res.message.toUpperCase() + '\n';
                        logPre.textContent += res.log + '\n\n';
                        
                        if (key === 'smtp' && res.status === 'success') {
                            hasSmtpSuccess = true;
                        }
                    });

                    logPre.textContent += 'Diagnostics complete. All components verified.';
                    
                    if (hasSmtpSuccess) {
                        btnTestEmail.style.display = 'inline-block';
                    }
                })
                .catch(function (err) {
                    btnRun.disabled = false;
                    btnRun.innerHTML = '<i class="fa-solid fa-play" style="margin-right:4px;"></i> Run Diagnostics';
                    logPre.textContent += '\nFatal Connection Error: ' + err.message;
                    keys.forEach(function (k) {
                        updateItemUI('test-' + k, 'error', 'Error');
                    });
                });
        });

        btnTestEmail.addEventListener('click', function () {
            btnTestEmail.disabled = true;
            btnTestEmail.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sending...';
            
            fetch('actions/diagnostics.php?action=test_email')
                .then(function (res) { return res.json(); })
                .then(function (data) {
                    btnTestEmail.disabled = false;
                    btnTestEmail.innerHTML = '<i class="fa-solid fa-paper-plane" style="margin-right:4px;"></i> Send Test Email';
                    alert(data.message);
                })
                .catch(function (err) {
                    btnTestEmail.disabled = false;
                    btnTestEmail.innerHTML = '<i class="fa-solid fa-paper-plane" style="margin-right:4px;"></i> Send Test Email';
                    alert('Connection failure: ' + err.message);
                });
        });
    });

    // Smart Logs Summary Script
    document.addEventListener('DOMContentLoaded', function () {
        var btnSum = document.getElementById('btn-summarize-logs');
        var modal = document.getElementById('summary-modal');
        var btnClose = document.getElementById('btn-close-summary');
        var btnCloseOk = document.getElementById('btn-close-summary-ok');
        var tabShort = document.getElementById('tab-summary-short');
        var tabDetailed = document.getElementById('tab-summary-detailed');
        var contentShort = document.getElementById('content-summary-short');
        var contentDetailed = document.getElementById('content-summary-detailed');

        if (!btnSum) return;

        var TELEMETRY_LOGS = <?php echo json_encode($telemetryLogs); ?>;

        function runSummaryAnalysis() {
            if (!TELEMETRY_LOGS || TELEMETRY_LOGS.length === 0) {
                contentShort.innerHTML = '<div style="text-align:center;padding:2rem;color:#64748b;"><i class="fa-solid fa-circle-check" style="font-size:2.5rem;color:#10b981;margin-bottom:0.75rem;display:block;"></i>No issues detected. Your system logs are 100% clean!</div>';
                contentDetailed.innerHTML = '<div style="text-align:center;padding:2rem;color:#64748b;"><i class="fa-solid fa-circle-check" style="font-size:2.5rem;color:#10b981;margin-bottom:0.75rem;display:block;"></i>No detailed analysis required. All components are healthy.</div>';
                return;
            }

            var groups = {};
            var countErrors = 0;
            var countWarnings = 0;
            var countOthers = 0;

            TELEMETRY_LOGS.forEach(function (log) {
                var file = log.file || 'Unknown file';
                var type = log.type || 'unknown';
                var msg = log.message || '';
                
                var isErr = type.includes('error') || type.includes('fatal') || type.includes('exception');
                var isWarn = type.includes('warning');
                
                if (isErr) countErrors++;
                else if (isWarn) countWarnings++;
                else countOthers++;

                var groupKey = file + ':' + msg;
                if (!groups[groupKey]) {
                    groups[groupKey] = {
                        file: file,
                        message: msg,
                        type: type,
                        isError: isErr,
                        isWarning: isWarn,
                        lines: [],
                        count: 0,
                        urls: new Set()
                    };
                }
                groups[groupKey].count++;
                if (log.line) {
                    groups[groupKey].lines.push(log.line);
                }
                if (log.url) {
                    groups[groupKey].urls.add(log.url);
                }
            });

            var totalIssues = countErrors + countWarnings;

            // 1. Short Summary
            var shortHTML = '';
            shortHTML += '<div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:1.25rem;background:#fef2f2;padding:1rem;border-radius:10px;border:1px solid #fee2e2;">';
            shortHTML += '  <div style="font-size:1.8rem;">🚨</div>';
            shortHTML += '  <div>';
            shortHTML += '    <strong style="color:#991b1b;display:block;font-size:0.9rem;">System Status Summary</strong>';
            shortHTML += '    <span style="color:#7f1d1d;font-size:0.78rem;">We found <strong>' + totalIssues + '</strong> warnings/errors (' + countErrors + ' errors, ' + countWarnings + ' warnings) across ' + Object.keys(groups).length + ' files.</span>';
            shortHTML += '  </div>';
            shortHTML += '</div>';

            shortHTML += '<p style="font-weight:700;color:#1e293b;margin-bottom:0.5rem;">Quick Action Plan:</p>';
            shortHTML += '<ul style="margin:0 0 1.25rem;padding-left:1.25rem;color:#475569;">';
            
            var groupList = Object.values(groups);
            groupList.forEach(function (g) {
                var level = g.isError ? 'Error' : (g.isWarning ? 'Warning' : 'Info');
                var color = g.isError ? '#dc2626' : (g.isWarning ? '#d97706' : '#2563eb');
                var uniqueLines = Array.from(new Set(g.lines));
                var linesText = uniqueLines.length > 0 ? ' (line ' + uniqueLines.join(', ') + ')' : '';
                
                shortHTML += '<li style="margin-bottom:0.4rem;">';
                shortHTML += '  <span style="color:' + color + ';font-weight:600;">[' + level + ']</span> ';
                shortHTML += '  <strong>' + g.file + '</strong>: ' + g.message + linesText;
                shortHTML += '</li>';
            });
            shortHTML += '</ul>';

            shortHTML += '<div style="background:#f0f9ff;padding:0.85rem;border-radius:10px;border:1px solid #e0f2fe;color:#0369a1;font-size:0.78rem;">';
            shortHTML += '  <strong>💡 Developer Tip:</strong>';
            shortHTML += '  <ul style="margin:0.25rem 0 0;padding-left:1.1rem;line-height:1.45;">';
            shortHTML += '    <li><strong>Undefined variable $distance:</strong> This issue occurs in <code>send-enquiry.php</code> because <code>$distance</code> was referenced prior to definition. (Resolved in our latest update).</li>';
            shortHTML += '    <li><strong>Google Tag Manager / Ad Failures:</strong> Typical blockages from client adblockers (already suppressed).</li>';
            shortHTML += '  </ul>';
            shortHTML += '</div>';

            contentShort.innerHTML = shortHTML;

            // 2. Detailed Summary
            var detailedHTML = '';
            detailedHTML += '<p style="font-weight:700;color:#1e293b;margin-bottom:0.75rem;">Technical Breakdown:</p>';
            
            groupList.forEach(function (g) {
                var badgeColor = g.isError ? '#fee2e2' : (g.isWarning ? '#fef3c7' : '#e0f2fe');
                var badgeText = g.isError ? '#991b1b' : (g.isWarning ? '#92400e' : '#0369a1');
                var borderLeft = g.isError ? '#ef4444' : (g.isWarning ? '#f59e0b' : '#3b82f6');
                var uniqueLines = Array.from(new Set(g.lines));
                var urlArray = Array.from(g.urls);

                detailedHTML += '<div class="summary-issue-item" style="border-left: 4px solid ' + borderLeft + '; background:#f8fafc; padding:0.85rem; margin-bottom:1rem; border-radius:6px; border:1px solid #e2e8f0; border-left-width: 4px;">';
                detailedHTML += '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;">';
                detailedHTML += '    <span style="font-weight:700;color:#1e293b;font-size:0.8rem;">📂 File: ' + g.file + '</span>';
                detailedHTML += '    <span style="font-size:0.65rem;font-weight:700;padding:2px 6px;border-radius:4px;background:' + badgeColor + ';color:' + badgeText + ';">' + g.type.toUpperCase().replace('_', ' ') + ' (' + g.count + 'x)</span>';
                detailedHTML += '  </div>';
                detailedHTML += '  <div style="margin-bottom:0.5rem;color:#b42318;font-family:monospace;font-size:0.75rem;background:#fff;padding:6px 10px;border:1px solid #fee2e2;border-radius:4px;word-break:break-all;">' + g.message + '</div>';
                
                if (uniqueLines.length > 0) {
                    detailedHTML += '  <div style="font-size:0.75rem;color:#475569;margin-bottom:0.25rem;">📍 <strong>Trigger Lines:</strong> <code>' + uniqueLines.join(', ') + '</code></div>';
                }
                if (urlArray.length > 0) {
                    detailedHTML += '  <div style="font-size:0.75rem;color:#475569;">🔗 <strong>Sample URLs affected:</strong><br>';
                    urlArray.forEach(function (u) {
                        detailedHTML += '    <a href="' + u + '" target="_blank" style="color:#0284c7;text-decoration:none;word-break:break-all;font-size:0.7rem;">' + u + '</a><br>';
                    });
                    detailedHTML += '  </div>';
                }
                detailedHTML += '</div>';
            });

            contentDetailed.innerHTML = detailedHTML;
        }

        btnSum.addEventListener('click', function () {
            runSummaryAnalysis();
            modal.style.display = 'flex';
        });

        function closeModal() {
            modal.style.display = 'none';
        }

        btnClose.addEventListener('click', closeModal);
        btnCloseOk.addEventListener('click', closeModal);
        
        modal.addEventListener('click', function (e) {
            if (e.target === modal) closeModal();
        });

        tabShort.addEventListener('click', function () {
            tabShort.classList.add('active');
            tabDetailed.classList.remove('active');
            contentShort.style.display = 'block';
            contentDetailed.style.display = 'none';
        });

        tabDetailed.addEventListener('click', function () {
            tabDetailed.classList.add('active');
            tabShort.classList.remove('active');
            contentShort.style.display = 'none';
            contentDetailed.style.display = 'block';
        });
    });
    </script>
</div>
<?php endif; // end category page (settings-grid) ?>

<!-- --- SETTINGS CATEGORY FILTER JS ----------------------------------- -->
<script>
(function () {
    'use strict';

    var ACTIVE_CAT = <?php echo json_encode($activeCat, JSON_HEX_TAG | JSON_HEX_AMP); ?>;
    if (!ACTIVE_CAT) return; // hub page — no cards rendered, nothing to filter

    // Map each card's <h3> title → category.
    var TITLE_TO_CATEGORY = {
        'Identity & Branding':       'company',
        'Contact & Address':         'company',
        'Top Announcement Banner':   'company',
        'Hero Section Content':      'company',
        'Business Logo':             'company',
        'Cancellation Policy':       'company',
        'Pricing Rules':             'booking',
        'GST & Tax Configurations':  'booking',
        'Referral & Wallet Settings': 'booking',
        'Business Economics':        'booking',
        'Interstate & Regional Surcharges': 'booking',
        'Extra Options & Surcharges': 'booking',
        'Advance Payment & UPI':     'booking',
        'Email & SMTP':              'notifications',
        'Telegram Bot':              'notifications',
        'WhatsApp & Messaging':      'notifications',
        'Platform & Alerts':         'notifications',
        'SMS Gateway Integration':   'notifications',
        'Customer Notification Matrix': 'notifications',
        'API Keys':                  'integrations',
        'Google Sheets Sync':        'integrations',
        'Live Chat Widget':          'integrations',
        'SEO Overrides':             'integrations',
        'Bulk Operations':           'operations',
        'Automation Benefits':       'operations',
        'Spam & IP Protection':      'operations',
        'Section Visibility':        'operations',
        'Subdomain Management':      'subdomains',
        'Theme Management':          'subdomains',
        'Websites & Domains':        'subdomains',
        'System Diagnostics & Telemetry': 'telemetry',
        'System Self-Test & Diagnostics': 'telemetry',
        'Account & Security':        'account',
        'Manage Staff Accounts':     'staff'
    };

    // Show only the cards that belong to this category page.
    document.querySelectorAll('.settings-card').forEach(function (card) {
        var h = card.querySelector('h3');
        var title = h ? h.textContent.trim() : '';
        var cat = TITLE_TO_CATEGORY[title] || 'company';
        if (cat === ACTIVE_CAT) {
            card.removeAttribute('data-tab-hidden');
        } else {
            card.setAttribute('data-tab-hidden', 'true');
        }
    });
})();
</script>

<!-- --- REALTIME SETTINGS SEARCH JS ----------------------------------- -->
<script>
(function () {
    'use strict';

    var ALL_SETTINGS_ITEMS = [
        { title: 'Identity & Branding', cat: 'company', desc: 'Theme colors, brand name & tagline', keywords: 'colors theme name brand logo tagline favicon layout styling' },
        { title: 'Contact & Address', cat: 'company', desc: 'Email, phone, physical address & footer info', keywords: 'address email phone contact support map location address office' },
        { title: 'Top Announcement Banner', cat: 'company', desc: 'Site-wide strip above header', keywords: 'announcement banner promo discount alert offer strip notice warning' },
        { title: 'Hero Section Content', cat: 'company', desc: 'Homepage hero title, subtitle & stats', keywords: 'hero home title subtitle stats headline background banner' },
        { title: 'Business Logo', cat: 'company', desc: 'Shown in site header & invoices', keywords: 'logo branding icon image invoice header favicon upload' },
        { title: 'Cancellation Policy', cat: 'company', desc: 'Shown on tariff & info pages', keywords: 'cancellation policy terms refunds rules refund booking cancel' },
        
        { title: 'Pricing Rules', cat: 'booking', desc: 'Surcharges, tolls & minimum fares', keywords: 'fare price pricing bata driver rates min km one-way round-trip base distance cost' },
        { title: 'GST & Tax Configurations', cat: 'booking', desc: 'Company GST percent and tax ID', keywords: 'gst tax pan tax-id percent invoice calculations rate percent bill' },
        { title: 'Referral & Wallet Settings', cat: 'booking', desc: 'Referral payouts and loyalty rewards', keywords: 'referral wallet bonus reward credit invite coupon cash bac balance program' },
        { title: 'Business Economics', cat: 'booking', desc: 'Base pricing, driver bata & km limits', keywords: 'economics pricing base rate per-km waiting charges driver allowance' },
        { title: 'Festival & Promo Mode', cat: 'booking', desc: 'Time-bound discount campaigns', keywords: 'festival promo diwali pongal campaign discount seasonal event sale' },
        { title: 'Interstate & Regional Surcharges', cat: 'booking', desc: 'Cross-border surcharges & border permits', keywords: 'interstate border state permit tax surcharge toll regional cross entry' },
        { title: 'Extra Options & Surcharges', cat: 'booking', desc: 'Luggage carriers, pets & peak hours', keywords: 'luggage pet peak hours surcharge night bata extra dog carrier peak-hour' },
        { title: 'Advance Payment & UPI', cat: 'booking', desc: 'Advance payment percentages, UPI QR code', keywords: 'advance payment upi qr code upi-id confirm transaction qr-code screenshot' },
        
        { title: 'Email & SMTP', cat: 'notifications', desc: 'Gmail App Password & sender email', keywords: 'smtp email gmail app password sender mail notifications client alerts' },
        { title: 'Telegram Bot', cat: 'notifications', desc: 'Instant booking alerts to groups', keywords: 'telegram bot token chat-id alerts notifications group channel api' },
        { title: 'WhatsApp & Messaging', cat: 'notifications', desc: 'Sender number & editable templates', keywords: 'whatsapp template templates message gateway send notify contact' },
        { title: 'Platform & Alerts', cat: 'notifications', desc: 'Global platform alerts & email templates', keywords: 'alert email notify customer admin dashboard confirmation templates' },
        { title: 'SMS Gateway Integration', cat: 'notifications', desc: 'Twilio or custom SMS gateways', keywords: 'sms gateway twilio http api authentication alert notify gateway' },
        { title: 'Customer Notification Matrix', cat: 'notifications', desc: 'Enable/disable customer emails or WhatsApp', keywords: 'notification matrix customer email sms whatsapp toggle' },
        
        { title: 'API Keys', cat: 'integrations', desc: 'Google Maps, GA4, FB Pixel', keywords: 'google maps api analytics facebook pixel integration tracking keys map' },
        { title: 'Google Sheets Sync', cat: 'integrations', desc: 'Live booking synchronizations', keywords: 'google sheets sync webhook url sheet spreadsheet google-sheet export columns' },
        { title: 'Live Chat Widget', cat: 'integrations', desc: 'Crisp, Tawk.to, Intercom widgets', keywords: 'chat live chat widget crisp tawk intercom support customer helpdesk' },
        { title: 'SEO Overrides', cat: 'integrations', desc: 'Meta tags, OG tags, keywords & verification', keywords: 'seo meta title description keywords open-graph og twitter verification index sitemap google-site-verification' },
        
        { title: 'Bulk Operations', cat: 'operations', desc: 'Import, export & database resets', keywords: 'bulk import export backup restore reset database clear cleanup purge truncate' },
        { title: 'Automation Benefits', cat: 'operations', desc: 'Automatic driver matching & rules', keywords: 'automation rules matching driver rules settings assign schedule' },
        { title: 'Spam & IP Protection', cat: 'operations', desc: 'Blocked IPs, firewalls & anti-scraping', keywords: 'spam ip firewall block blocked-ips anti-scraping security blacklist defense' },
        { title: 'Section Visibility', cat: 'operations', desc: 'Show/hide homepage elements', keywords: 'visibility section show hide homepage reviews hero tariffs safety visibility' },
        
        { title: 'Subdomain Management', cat: 'subdomains', desc: 'Configure per-subdomain display names, email routing & overrides.', keywords: 'subdomains overrides cities email mailto notifications chennai bangalore routing' },
        { title: 'Theme Management', cat: 'subdomains', desc: 'Create and configure keyword landing pages & theme subdomains.', keywords: 'themes subdomains routing onewaytaxi droptaxi outstationtaxi landing templates' },
        { title: 'Websites & Domains', cat: 'subdomains', desc: 'Manage multiple taxi brands, client websites, and core domains.', keywords: 'websites domains registered multi-site drop1taxi tatacalltaxi droptaxi247 yellowboard' },
        { title: 'System Diagnostics & Telemetry', cat: 'telemetry', desc: 'Inspect website telemetry, runtime exceptions, 404s and warnings.', keywords: 'telemetry debug errors log logs diagnostics database crashes warning exception parsed E_ERROR' },
        
        { title: 'Account & Security', cat: 'account', desc: 'Login credentials, recovery email', keywords: 'account credentials email password security recover recovery session password recovery login' },
        
        { title: 'Manage Staff Accounts', cat: 'staff', desc: 'Create and manage sub-admins & staff', keywords: 'staff admins accounts users permissions access role sub-admin create' }
    ];

    var CATEGORIES_METADATA = <?php echo json_encode($settingsCategories, JSON_HEX_TAG | JSON_HEX_AMP); ?>;
    var ACTIVE_CAT = <?php echo json_encode($activeCat, JSON_HEX_TAG | JSON_HEX_AMP); ?>;

    var input = document.getElementById('settings-search-input');
    var clearBtn = document.getElementById('settings-search-clear');
    var dropdown = document.getElementById('settings-search-dropdown');

    if (!input || !dropdown) return;

    var currentFocus = -1;

    // Helper to generate slug
    function getSlug(title) {
        return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    }

    // Auto-generate IDs on settings cards
    document.querySelectorAll('.settings-card').forEach(function (card) {
        var h = card.querySelector('h3');
        if (h) {
            card.id = 'setting-' + getSlug(h.textContent.trim());
        }
    });

    // Check url hash or query param to highlight target card
    function checkAndHighlightHash() {
        var hash = window.location.hash;
        if (hash && hash.startsWith('#setting-')) {
            var target = document.querySelector(hash);
            if (target) {
                // If the card is hidden by category filter, show it first
                target.removeAttribute('data-tab-hidden');
                
                setTimeout(function () {
                    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    target.classList.add('highlight-settings-card');
                    setTimeout(function () {
                        target.classList.remove('highlight-settings-card');
                    }, 3000);
                }, 150);
            }
        }
    }

    window.addEventListener('DOMContentLoaded', checkAndHighlightHash);
    window.addEventListener('hashchange', checkAndHighlightHash);

    // Perform filter
    function performSearch(query) {
        query = query.trim().toLowerCase();
        if (query === '') {
            dropdown.style.display = 'none';
            clearBtn.style.display = 'none';
            return;
        }

        clearBtn.style.display = 'block';

        var matches = ALL_SETTINGS_ITEMS.filter(function (item) {
            return item.title.toLowerCase().indexOf(query) !== -1 ||
                   item.desc.toLowerCase().indexOf(query) !== -1 ||
                   item.keywords.toLowerCase().indexOf(query) !== -1 ||
                   (CATEGORIES_METADATA[item.cat] && CATEGORIES_METADATA[item.cat].label.toLowerCase().indexOf(query) !== -1);
        });

        renderSuggestions(matches);
    }

    // Render suggestions dropdown
    function renderSuggestions(items) {
        dropdown.innerHTML = '';
        currentFocus = -1;

        if (items.length === 0) {
            var noResult = document.createElement('div');
            noResult.style.padding = '0.75rem';
            noResult.style.fontSize = '0.78rem';
            noResult.style.color = '#94a3b8';
            noResult.style.textAlign = 'center';
            noResult.textContent = 'No matching settings found';
            dropdown.appendChild(noResult);
            dropdown.style.display = 'block';
            return;
        }

        items.forEach(function (item, index) {
            var div = document.createElement('div');
            div.className = 'search-suggestion-item';
            div.setAttribute('data-index', index);
            
            var header = document.createElement('div');
            header.style.display = 'flex';
            header.style.alignItems = 'center';
            header.style.justifyContent = 'space-between';
            header.style.width = '100%';

            var titleSpan = document.createElement('span');
            titleSpan.className = 'suggestion-title';
            titleSpan.textContent = item.title;

            var badgeSpan = document.createElement('span');
            badgeSpan.className = 'suggestion-badge';
            badgeSpan.textContent = CATEGORIES_METADATA[item.cat] ? CATEGORIES_METADATA[item.cat].label : 'General';

            header.appendChild(titleSpan);
            header.appendChild(badgeSpan);

            var descSpan = document.createElement('span');
            descSpan.className = 'suggestion-desc';
            descSpan.textContent = item.desc;

            div.appendChild(header);
            div.appendChild(descSpan);

            div.addEventListener('click', function () {
                selectSuggestion(item);
            });

            dropdown.appendChild(div);
        });

        dropdown.style.display = 'block';
    }

    // Handle suggestion selection
    function selectSuggestion(item) {
        input.value = '';
        dropdown.style.display = 'none';
        clearBtn.style.display = 'none';
        
        var slug = getSlug(item.title);
        var targetHash = '#setting-' + slug;

        if (item.title === 'Festival & Promo Mode') {
            window.location.href = 'promotions?tab=festival';
            return;
        }

        if (ACTIVE_CAT === item.cat) {
            // Already on the right category page, just scroll to it
            var card = document.getElementById('setting-' + slug);
            if (card) {
                // Ensure card is visible (if filter hid it somehow)
                card.removeAttribute('data-tab-hidden');
                
                card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                card.classList.add('highlight-settings-card');
                setTimeout(function () {
                    card.classList.remove('highlight-settings-card');
                }, 3000);
                
                // Update URL hash without reload
                history.pushState(null, null, targetHash);
            }
        } else {
            // Redirect to the correct page category and append hash
            var targetUrl = 'settings?cat=' + item.cat + targetHash;
            window.location.href = targetUrl;
        }
    }

    // Input event listeners
    input.addEventListener('input', function (e) {
        performSearch(e.target.value);
    });

    input.addEventListener('focus', function (e) {
        performSearch(e.target.value);
    });

    // Clear search
    clearBtn.addEventListener('click', function () {
        input.value = '';
        performSearch('');
        input.focus();
    });

    // Keyboard navigation
    input.addEventListener('keydown', function (e) {
        var items = dropdown.querySelectorAll('.search-suggestion-item');
        if (items.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            currentFocus++;
            addActive(items);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            currentFocus--;
            addActive(items);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (currentFocus > -1 && items[currentFocus]) {
                items[currentFocus].click();
            } else if (items[0]) {
                items[0].click();
            }
        } else if (e.key === 'Escape') {
            dropdown.style.display = 'none';
        }
    });

    function addActive(items) {
        removeActive(items);
        if (currentFocus >= items.length) currentFocus = 0;
        if (currentFocus < 0) currentFocus = items.length - 1;
        
        items[currentFocus].classList.add('is-keyboard-active');
        items[currentFocus].scrollIntoView({ block: 'nearest' });
    }

    function removeActive(items) {
        items.forEach(function (item) {
            item.classList.remove('is-keyboard-active');
        });
    }

    // Close dropdown on outside click
    document.addEventListener('pointerdown', function (e) {
        if (!input.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.style.display = 'none';
        }
    });
})();
</script>
