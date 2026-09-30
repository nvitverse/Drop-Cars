<?php
/**
 * Logout Page
 * Clears both the PHP session and the persistent remember-me cookie/DB token.
 */
// Clear the persistent DB token for this device before destroying the session
if (isset($pdo) && function_exists('dropcars_clear_remember_token')) {
    dropcars_clear_remember_token($pdo);
}
logout();
