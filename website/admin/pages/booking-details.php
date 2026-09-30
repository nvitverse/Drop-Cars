<?php
/**
 * Admin Booking Detail / Manage Page - Redirect to Customize Booking
 */

$bookingId = $_GET['id'] ?? null;
if ($bookingId) {
    header('Location: ' . admin_url('customize-booking', ['id' => $bookingId, 'source' => 'booking']));
    exit;
} else {
    header('Location: ' . admin_url('bookings'));
    exit;
}
