-- Debt & Pawn Tracker — MySQL schema
-- Import this in your hosting's phpMyAdmin (InfinityFree or equivalent) before deploying the API.

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(64) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NULL,
  phone VARCHAR(30) NULL,
  pin_hash VARCHAR(255) NULL,
  google_id VARCHAR(255) NULL UNIQUE,
  email VARCHAR(255) NULL,
  fcm_token VARCHAR(255) NULL,
  warn_days INT NOT NULL DEFAULT 3,
  auto_lock TINYINT(1) NOT NULL DEFAULT 1,
  failed_attempts INT NOT NULL DEFAULT 0,
  locked_until DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS debts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  total_amount DECIMAL(12,2) NOT NULL,
  remaining_amount DECIMAL(12,2) NOT NULL,
  payment_type ENUM('installment','lump_sum') NOT NULL DEFAULT 'installment',
  due_day INT NULL,
  installment_amount DECIMAL(12,2) NULL,
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
  amount DECIMAL(12,2) NOT NULL,
  interest DECIMAL(12,2) NULL,
  due_date DATE NOT NULL,
  period_unit ENUM('day','month') NULL,
  period_value INT NULL,
  status ENUM('active','redeemed','renewed') NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS recurring_expenses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  due_day INT NOT NULL DEFAULT 5,
  last_paid_month CHAR(7) NULL,  -- 'YYYY-MM' of the most recent month marked paid
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notification_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  ref_type ENUM('installment','pawn','expense') NOT NULL,
  ref_id INT NOT NULL,
  sent_date DATE NOT NULL,
  sent_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_daily (user_id, ref_type, ref_id, sent_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
