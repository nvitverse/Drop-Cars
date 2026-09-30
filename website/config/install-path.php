<?php
/**
 * Subdirectory install only: URL segment(s) with NO leading/trailing slashes.
 * Example: site at http://localhost:8080/drop-cars/ → return 'drop-cars';
 * Production at https://dropcars.in/ (root) → return '';
 *
 * If you use Apache under a subfolder, set RewriteBase in .htaccess to match.
 */
return '';