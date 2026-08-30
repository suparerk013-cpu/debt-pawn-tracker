-- Debt & Pawn Tracker — MySQL schema
-- Import this in your hosting's phpMyAdmin (InfinityFree or equivalent) before deploying the API.

-- Two fixed users, no password/PIN — logging in is just typing your username (see
-- api/auth/login.php). `is_admin` can switch to view/edit the other user's data
-- (see api/auth/switch-user.php).
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(64) NOT NULL UNIQUE,
  is_admin TINYINT(1) NOT NULL DEFAULT 0,
  fcm_token VARCHAR(255) NULL,
  warn_days INT NOT NULL DEFAULT 3,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO users (username, is_admin) VALUES ('not', 1), ('lek', 0);

CREATE TABLE IF NOT EXISTS debts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  total_amount DECIMAL(12,2) NOT NULL,
  remaining_amount DECIMAL(12,2) NOT NULL,
  payment_type ENUM('installment','lump_sum') NOT NULL DEFAULT 'installment',
  due_day INT NULL,
  installment_amount DECIMAL(12,2) NULL,
  status ENUM('active','closed') NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS installments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  debt_id INT NOT NULL,
  due_date DATE NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  paid TINYINT(1) NOT NULL DEFAULT 0,
  paid_at DATETIME NULL,
  FOREIGN KEY (debt_id) REFERENCES debts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pawn_tickets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  ticket_code VARCHAR(100) NULL,
  shop_name VARCHAR(255) NULL,
  item_name VARCHAR(255) NOT NULL,
  category ENUM('jewelry','car','electronics','other') NOT NULL DEFAULT 'other',
  amount DECIMAL(12,2) NOT NULL,
  interest DECIMAL(12,2) NULL,
  due_date DATE NOT NULL,
  period_unit ENUM('day','month') NULL,
  period_value INT NULL,
  -- Jewelry tickets can only be renewed 4 times (see api/pawns/renew.php); this counts
  -- renewals for all categories but the cap only applies to 'jewelry'.
  renewal_count INT NOT NULL DEFAULT 0,
  status ENUM('active','redeemed','renewed') NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 'fixed'    = same amount every month (rent, child support) — `amount` is the template.
-- 'variable' = must pay every month but the amount changes (water/electric/internet) —
--              `amount` is NULL; the real amount is entered each time in expense_payments.
CREATE TABLE IF NOT EXISTS recurring_expenses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  expense_type ENUM('fixed','variable') NOT NULL DEFAULT 'fixed',
  amount DECIMAL(12,2) NULL,
  due_day INT NOT NULL DEFAULT 5,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- One row per month actually paid for a recurring expense (both fixed and variable types).
-- "Paid this month?" is just "does a row exist for this expense + the current month".
CREATE TABLE IF NOT EXISTS expense_payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  expense_id INT NOT NULL,
  month CHAR(7) NOT NULL,  -- 'YYYY-MM'
  amount DECIMAL(12,2) NOT NULL,
  paid_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_expense_month (expense_id, month),
  FOREIGN KEY (expense_id) REFERENCES recurring_expenses(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Doubles as the daily-send dedup key (uniq_daily) AND the notification history shown
-- behind the bell icon in the app — title/body/read_at are only used for the latter.
CREATE TABLE IF NOT EXISTS notification_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  ref_type ENUM('installment','pawn','expense') NOT NULL,
  ref_id INT NOT NULL,
  title VARCHAR(255) NULL,
  body VARCHAR(500) NULL,
  sent_date DATE NOT NULL,
  sent_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_at DATETIME NULL,
  UNIQUE KEY uniq_daily (user_id, ref_type, ref_id, sent_date),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
