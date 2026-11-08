-- NAMESPACE: default-data

INSERT INTO roles
    (role_uid, title)
VALUES
    (1, 'admin'),
    (2, 'member'),
    (3, 'pending');

INSERT INTO users
    (user_uid, email, password, administrator, reset_key, verified)
VALUES
    (-1, 'guest', crypt('disabled_guest_password', gen_salt('bf')), false, null, true)
ON CONFLICT (email) DO NOTHING;
