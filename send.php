<?php
// Wave Cyber Security: contact and incident form handler.
//
// Receives a form post, checks it, and sends one email to TO_ADDRESS.
// It does not use a database, does not write files and does not set cookies.
// It does not record the sender's IP address.

const TO_ADDRESS     = 'info@wavecyber.co.zm';
// Must be a real mailbox on your own domain, or mail may be rejected as spoofed.
const FROM_ADDRESS   = 'info@wavecyber.co.zm';
const POLICY_VERSION = '2026-10-22';

header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function wants_json() {
    $accept = isset($_SERVER['HTTP_ACCEPT']) ? $_SERVER['HTTP_ACCEPT'] : '';
    return strpos($accept, 'application/json') !== false;
}

// Success or failure, as JSON for the page script, or a redirect for plain form posts.
function finish($ok, $status, $code = '', $fields = array()) {
    if (wants_json()) {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        $out = $ok ? array('ok' => true) : array('ok' => false, 'error' => $code);
        if (!$ok && $fields) { $out['fields'] = $fields; }
        echo json_encode($out);
    } else {
        header('Location: ' . ($ok ? '/message-sent' : '/message-failed'), true, 303);
    }
    exit;
}

function text_len($s) {
    return function_exists('mb_strlen') ? mb_strlen($s, 'UTF-8') : strlen($s);
}

// One-line field: strip control characters and line breaks.
function one_line($v) {
    $v = is_string($v) ? $v : '';
    $v = preg_replace('/[\x00-\x1F\x7F]+/u', ' ', $v);
    if ($v === null) { $v = ''; }
    return trim($v);
}

function field($name) {
    return isset($_POST[$name]) ? $_POST[$name] : '';
}

// ---- method and size
if (!isset($_SERVER['REQUEST_METHOD']) || $_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Allow: POST');
    http_response_code(405);
    exit('Method not allowed');
}
if (isset($_SERVER['CONTENT_LENGTH']) && (int) $_SERVER['CONTENT_LENGTH'] > 20000) {
    finish(false, 413, 'invalid');
}

// ---- same-site check (browsers always send Origin on a form post)
if (!empty($_SERVER['HTTP_ORIGIN'])) {
    $originHost = strtolower((string) parse_url($_SERVER['HTTP_ORIGIN'], PHP_URL_HOST));
    $thisHost   = strtolower(preg_replace('/:\d+$/', '', isset($_SERVER['HTTP_HOST']) ? $_SERVER['HTTP_HOST'] : ''));
    $strip = function ($h) { return preg_replace('/^www\./', '', $h); };
    if ($originHost === '' || $strip($originHost) !== $strip($thisHost)) {
        finish(false, 403, 'origin');
    }
}

// ---- honeypot: real visitors never see or fill this field. Pretend it worked.
if (field('hp_field') !== '') {
    finish(true, 200);
}

// ---- read and check the fields
$kind    = one_line(field('kind'));
$name    = one_line(field('name'));
$org     = one_line(field('organisation'));
$email   = one_line(field('email'));
$phone   = one_line(field('phone'));
$topic   = one_line(field('topic'));
$message = field('message');
$message = is_string($message) ? trim(str_replace(array("\r\n", "\r"), "\n", $message)) : '';
$message = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]+/u', '', $message);
if ($message === null) { $message = ''; }
$consent = field('consent');

$errors = array();
if ($kind !== 'contact' && $kind !== 'incident') { $errors['form'] = 'This form is not recognised.'; }
if ($name === '')                  { $errors['name'] = 'Please enter your name.'; }
elseif (text_len($name) > 100)     { $errors['name'] = 'Please use 100 characters or fewer for your name.'; }
if (text_len($org) > 150)          { $errors['organisation'] = 'Please use 150 characters or fewer.'; }
if (text_len($topic) > 80)         { $errors['topic'] = 'That topic is too long.'; }
if ($message === '')               { $errors['message'] = 'Please write a message.'; }
elseif (text_len($message) > 4000) { $errors['message'] = 'Please keep your message under 4000 characters.'; }
if ($consent !== 'on')             { $errors['consent'] = 'Please tick the box if you are happy for us to use your details in this way.'; }
if ($email !== '' && (strlen($email) > 254 || !filter_var($email, FILTER_VALIDATE_EMAIL) || strpos($email, '.', strrpos($email, '@')) === false)) {
    $errors['email'] = 'That email address does not look right.';
}
if ($phone !== '' && !preg_match('/^[0-9 +().\-]{5,40}$/', $phone)) {
    $errors['phone'] = 'Please use numbers only, with spaces, + or dashes if you like (5 to 40 characters).';
}
if ($kind === 'contact' && $email === '' && !isset($errors['email'])) {
    $errors['email'] = 'Please enter your email address so we can reply.';
}
if ($kind === 'incident' && $email === '' && $phone === '') {
    $errors['phone'] = 'Please give a phone number or an email address so we can reach you.';
}
if ($errors) {
    finish(false, 400, 'invalid', $errors);
}

// ---- build the email
$label   = $kind === 'incident' ? 'incident report' : 'contact message';
$subject = 'Website ' . $label . ': ' . $name;
$subject = '=?UTF-8?B?' . base64_encode($subject) . '?=';

$lines = array(
    'Type: ' . ($kind === 'incident' ? 'Incident report' : 'Contact message'),
    'Name: ' . $name,
    'Organisation: ' . ($org !== '' ? $org : '(not given)'),
    'Email: ' . ($email !== '' ? $email : '(not given)'),
    'Phone: ' . ($phone !== '' ? $phone : '(not given)'),
    'Topic: ' . ($topic !== '' ? $topic : '(not given)'),
    '',
    'Message:',
    $message,
    '',
    '---',
    'Consent: the sender ticked the consent box on the website form on ' . gmdate('Y-m-d H:i') . ' UTC (privacy policy version ' . POLICY_VERSION . ').',
);
$body = chunk_split(base64_encode(implode("\n", $lines)));

$headers = array(
    'From: Wave Cyber Security website <' . FROM_ADDRESS . '>',
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
);
if ($email !== '') {
    $headers[] = 'Reply-To: ' . $email;   // already validated, so it holds no line breaks
}

$sent = @mail(TO_ADDRESS, $subject, $body, implode("\r\n", $headers), '-f' . FROM_ADDRESS);
if (!$sent) {
    finish(false, 500, 'send');
}
finish(true, 200);
