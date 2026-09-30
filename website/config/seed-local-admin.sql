-- Local dev: single admin account (import in phpMyAdmin after hostinger-schema.sql).
-- Username: admin  |  Email: admin@dropcars.in  |  Password: admin@dc

DELETE FROM `admins`;

INSERT INTO `admins` (`name`, `username`, `email`, `password`)
VALUES (
  'Admin',
  'admin',
  'admin@dropcars.in',
  '$2y$10$sQIDgmTW9xhEg/Mru/t87.Pt5zTOlgPgpdydK7A65lYFIBIC56ksC'
);

