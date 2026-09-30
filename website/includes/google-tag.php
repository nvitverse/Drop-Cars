<?php
/**
 * Google tag (gtag.js) — Google Ads conversion tracking.
 *
 * Include this from each customer-facing page right before the closing </head> tag:
 *     <?php include __DIR__ . '/../includes/google-tag.php'; ?>
 *
 * The Ads conversion ID + call/form conversion labels are read from
 * data/config.json ("googleAds" section) so they're admin-editable rather
 * than hardcoded. Leave a label blank to skip firing that conversion event
 * (e.g. until it's been created in Google Ads and the label copied in).
 */

$googleTagIds = [
    'AW-17389722138', // Google Ads conversion tracking
];

$adsConversionId = $googleTagIds[0] ?? '';
$adsCallLabel = '';
$adsFormLabel = '';
$configFile = __DIR__ . '/../data/config.json';
if (is_file($configFile)) {
    $cfg = json_decode((string) file_get_contents($configFile), true);
    if (is_array($cfg) && !empty($cfg['googleAds'])) {
        $adsConversionId = trim((string) ($cfg['googleAds']['conversionId'] ?? '')) ?: $adsConversionId;
        $adsCallLabel = trim((string) ($cfg['googleAds']['callConversionLabel'] ?? ''));
        $adsFormLabel = trim((string) ($cfg['googleAds']['formConversionLabel'] ?? ''));
        $ga4Id = trim((string) ($cfg['googleAds']['ga4MeasurementId'] ?? ''));
        if ($ga4Id !== '' && !in_array($ga4Id, $googleTagIds, true)) {
            $googleTagIds[] = $ga4Id;
        }
    }
}

if (empty($googleTagIds)) {
    return;
}

$primary = $googleTagIds[0];
?>
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=<?php echo htmlspecialchars($primary, ENT_QUOTES, 'UTF-8'); ?>"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
<?php foreach ($googleTagIds as $id): ?>
  gtag('config', '<?php echo htmlspecialchars($id, ENT_QUOTES, 'UTF-8'); ?>');
<?php endforeach; ?>
  window.DropCarsGoogleAdsConversions = {
    conversionId: '<?php echo htmlspecialchars($adsConversionId, ENT_QUOTES, 'UTF-8'); ?>',
    callLabel: '<?php echo htmlspecialchars($adsCallLabel, ENT_QUOTES, 'UTF-8'); ?>',
    formLabel: '<?php echo htmlspecialchars($adsFormLabel, ENT_QUOTES, 'UTF-8'); ?>'
  };
</script>
<script src="<?php echo htmlspecialchars((function_exists('dropcars_base_path') ? rtrim(dropcars_base_path(), '/') : ''), ENT_QUOTES, 'UTF-8'); ?>/assets/js/conversion-tracking.js" defer></script>
