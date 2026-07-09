<?php
// Handles the Contact page form submission and emails it to info@synergetic-consulting.com.
// Requires PHP hosting with mail() enabled (standard on GoDaddy cPanel hosting).

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'Method not allowed.']);
    exit;
}

// Honeypot field (hidden from real visitors via CSS) — bots tend to fill every field.
if (!empty($_POST['website'])) {
    echo json_encode(['ok' => true]);
    exit;
}

function clean_field($value) {
    return trim(str_replace(["\r", "\n"], '', (string) $value));
}

$name = clean_field($_POST['name'] ?? '');
$organization = clean_field($_POST['organization'] ?? '');
$email = clean_field($_POST['email'] ?? '');
$phone = clean_field($_POST['phone'] ?? '');
$service = clean_field($_POST['service'] ?? '');
$message = trim((string) ($_POST['message'] ?? ''));

if ($name === '' || $email === '' || $message === '') {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Please fill in all required fields.']);
    exit;
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Please provide a valid email address.']);
    exit;
}

$to = 'info@synergetic-consulting.com';
$subject = 'New website inquiry from ' . $name;

$body = "You have a new message from the Synergetic Insights and Consulting website contact form.\n\n";
$body .= "Name: $name\n";
$body .= "Organization: " . ($organization !== '' ? $organization : '-') . "\n";
$body .= "Email: $email\n";
$body .= "Phone: " . ($phone !== '' ? $phone : '-') . "\n";
$body .= "Service of Interest: " . ($service !== '' ? $service : '-') . "\n\n";
$body .= "Message:\n$message\n";

$headers = "From: Synergetic Website <website@synergetic-consulting.com>\r\n";
$headers .= "Reply-To: " . str_replace(["\r", "\n"], '', "$name <$email>") . "\r\n";
$headers .= "Content-Type: text/plain; charset=UTF-8\r\n";

$sent = @mail($to, $subject, $body, $headers);

if ($sent) {
    echo json_encode(['ok' => true]);
} else {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'The message could not be sent. Please try again or email us directly.']);
}
