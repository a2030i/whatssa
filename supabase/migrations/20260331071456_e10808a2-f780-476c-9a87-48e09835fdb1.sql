UPDATE plans SET max_phone_numbers = 0, max_unofficial_phones = 1 WHERE name = 'free';
UPDATE plans SET max_unofficial_phones = 1 WHERE name = 'basic';
UPDATE plans SET max_unofficial_phones = 3 WHERE name = 'professional';
UPDATE plans SET max_unofficial_phones = 10 WHERE name = 'enterprise';