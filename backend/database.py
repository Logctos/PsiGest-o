import sqlite3
import os
from contextlib import contextmanager
from datetime import date, timedelta

DB_PATH = os.environ.get("DB_PATH", "./production.db")

SCHEMA = """
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    code TEXT,
    monthly_target INTEGER NOT NULL DEFAULT 0,
    current_stock INTEGER NOT NULL DEFAULT 0,
    min_batch INTEGER DEFAULT 1,
    priority INTEGER DEFAULT 5,
    notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS machines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    code TEXT,
    capacity_per_day INTEGER NOT NULL DEFAULT 100,
    working_days TEXT DEFAULT 'MTWTF',
    notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS machine_products (
    machine_id INTEGER NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    PRIMARY KEY (machine_id, product_id)
);

CREATE TABLE IF NOT EXISTS daily_tracking (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tracking_date TEXT NOT NULL,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    stock_start INTEGER DEFAULT 0,
    produced INTEGER DEFAULT 0,
    sold INTEGER DEFAULT 0,
    stock_end INTEGER DEFAULT 0,
    UNIQUE(tracking_date, product_id)
);

CREATE TABLE IF NOT EXISTS production_schedule (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    week_start TEXT NOT NULL,
    scheduled_date TEXT NOT NULL,
    machine_id INTEGER NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    planned_quantity INTEGER NOT NULL DEFAULT 0,
    actual_quantity INTEGER DEFAULT 0,
    status TEXT DEFAULT 'planned',
    notes TEXT,
    agent_reasoning TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS agent_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rule_type TEXT NOT NULL DEFAULT 'custom',
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    active INTEGER DEFAULT 1,
    priority INTEGER DEFAULT 5,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
"""


@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db():
    with get_db() as conn:
        conn.executescript(SCHEMA)
        count = conn.execute("SELECT COUNT(*) FROM products").fetchone()[0]
        if count == 0:
            _insert_sample_data(conn)


def _insert_sample_data(conn):
    conn.execute("INSERT INTO machines (name, code, capacity_per_day) VALUES (?, ?, ?)", ("Maquina A", "MA01", 200))
    conn.execute("INSERT INTO machines (name, code, capacity_per_day) VALUES (?, ?, ?)", ("Maquina B", "MB02", 150))
    conn.execute("INSERT INTO machines (name, code, capacity_per_day) VALUES (?, ?, ?)", ("Maquina C", "MC03", 100))

    conn.execute("INSERT INTO products (name, code, monthly_target, current_stock, priority) VALUES (?, ?, ?, ?, ?)", ("Produto X", "PRX", 500, 30, 8))
    conn.execute("INSERT INTO products (name, code, monthly_target, current_stock, priority) VALUES (?, ?, ?, ?, ?)", ("Produto Y", "PRY", 300, 80, 6))
    conn.execute("INSERT INTO products (name, code, monthly_target, current_stock, priority) VALUES (?, ?, ?, ?, ?)", ("Produto Z", "PRZ", 200, 60, 5))
    conn.execute("INSERT INTO products (name, code, monthly_target, current_stock, priority) VALUES (?, ?, ?, ?, ?)", ("Produto W", "PRW", 150, 40, 4))

    for mp in [(1, 1), (1, 2), (2, 2), (2, 3), (3, 3), (3, 4)]:
        conn.execute("INSERT INTO machine_products VALUES (?, ?)", mp)

    rules = [
        ("sequencing", "X antes de Y na Maquina A",
         "Na Maquina A, sempre produzir Produto X antes do Produto Y para reduzir tempo de setup e limpeza de linha", 8),
        ("priority", "Prioridade para estoque critico",
         "Produtos com estoque abaixo de 30% da meta mensal devem ter prioridade maxima independentemente do sequenciamento normal", 9),
        ("constraint", "Lote minimo de 50 unidades",
         "Nunca programar menos de 50 unidades por turno para evitar setup desnecessario e perda de eficiencia", 7),
    ]
    for r in rules:
        conn.execute("INSERT INTO agent_rules (rule_type, name, description, priority) VALUES (?, ?, ?, ?)", r)

    today = date.today()
    start = today.replace(day=1)
    stocks = {1: 30, 2: 80, 3: 60, 4: 40}
    daily_sales = {1: 35, 2: 14, 3: 9, 4: 7}
    daily_prod = {1: 20, 2: 10, 3: 8, 4: 5}

    d = start
    while d < today:
        if d.weekday() < 5:
            for pid in [1, 2, 3, 4]:
                s0 = stocks[pid]
                prod = daily_prod[pid]
                sold = daily_sales[pid]
                s1 = max(0, s0 + prod - sold)
                conn.execute("""
                    INSERT OR REPLACE INTO daily_tracking
                    (tracking_date, product_id, stock_start, produced, sold, stock_end)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, (d.isoformat(), pid, s0, prod, sold, s1))
                stocks[pid] = s1
        d += timedelta(days=1)

    for pid, stock in stocks.items():
        conn.execute("UPDATE products SET current_stock = ? WHERE id = ?", (stock, pid))
