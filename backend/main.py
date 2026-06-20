import os
import calendar
from datetime import date, timedelta
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

from database import init_db, get_db
from agent import run_scheduling_agent

load_dotenv()

app = FastAPI(title="PsiGest-O")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.on_event("startup")
def startup():
    init_db()


class ProductIn(BaseModel):
    name: str
    code: Optional[str] = None
    monthly_target: int = 0
    current_stock: int = 0
    min_batch: int = 1
    priority: int = 5
    notes: Optional[str] = None

class MachineIn(BaseModel):
    name: str
    code: Optional[str] = None
    capacity_per_day: int = 100
    working_days: str = "MTWTF"
    notes: Optional[str] = None

class TrackingIn(BaseModel):
    tracking_date: str
    product_id: int
    stock_start: int = 0
    produced: int = 0
    sold: int = 0

class ScheduleIn(BaseModel):
    week_start: str
    scheduled_date: str
    machine_id: int
    product_id: int
    planned_quantity: int = 0
    actual_quantity: int = 0
    status: str = "planned"
    notes: Optional[str] = None

class SchedulePatch(BaseModel):
    planned_quantity: Optional[int] = None
    actual_quantity: Optional[int] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    machine_id: Optional[int] = None
    product_id: Optional[int] = None

class RuleIn(BaseModel):
    rule_type: str = "custom"
    name: str
    description: str
    active: int = 1
    priority: int = 5

class GenerateIn(BaseModel):
    week_start: str
    regenerate: bool = False


# --- Products ---

@app.get("/api/products")
def list_products():
    with get_db() as conn:
        return [dict(r) for r in conn.execute("SELECT * FROM products ORDER BY priority DESC, name").fetchall()]

@app.post("/api/products", status_code=201)
def create_product(data: ProductIn):
    with get_db() as conn:
        cur = conn.execute(
            "INSERT INTO products (name,code,monthly_target,current_stock,min_batch,priority,notes) VALUES (?,?,?,?,?,?,?)",
            (data.name, data.code, data.monthly_target, data.current_stock, data.min_batch, data.priority, data.notes)
        )
        return {"id": cur.lastrowid, **data.model_dump()}

@app.put("/api/products/{pid}")
def update_product(pid: int, data: ProductIn):
    with get_db() as conn:
        conn.execute(
            "UPDATE products SET name=?,code=?,monthly_target=?,current_stock=?,min_batch=?,priority=?,notes=? WHERE id=?",
            (data.name, data.code, data.monthly_target, data.current_stock, data.min_batch, data.priority, data.notes, pid)
        )
        return {"id": pid, **data.model_dump()}

@app.delete("/api/products/{pid}")
def delete_product(pid: int):
    with get_db() as conn:
        conn.execute("DELETE FROM products WHERE id=?", (pid,))
    return {"ok": True}


# --- Machines ---

@app.get("/api/machines")
def list_machines():
    with get_db() as conn:
        machines = [dict(r) for r in conn.execute("SELECT * FROM machines ORDER BY name").fetchall()]
        for m in machines:
            m["products"] = [dict(r) for r in conn.execute(
                "SELECT p.id,p.name,p.code FROM products p JOIN machine_products mp ON mp.product_id=p.id WHERE mp.machine_id=?",
                (m["id"],)
            ).fetchall()]
        return machines

@app.post("/api/machines", status_code=201)
def create_machine(data: MachineIn):
    with get_db() as conn:
        cur = conn.execute(
            "INSERT INTO machines (name,code,capacity_per_day,working_days,notes) VALUES (?,?,?,?,?)",
            (data.name, data.code, data.capacity_per_day, data.working_days, data.notes)
        )
        return {"id": cur.lastrowid, **data.model_dump()}

@app.put("/api/machines/{mid}")
def update_machine(mid: int, data: MachineIn):
    with get_db() as conn:
        conn.execute(
            "UPDATE machines SET name=?,code=?,capacity_per_day=?,working_days=?,notes=? WHERE id=?",
            (data.name, data.code, data.capacity_per_day, data.working_days, data.notes, mid)
        )
        return {"id": mid, **data.model_dump()}

@app.post("/api/machines/{mid}/products/{pid}")
def assign_product(mid: int, pid: int):
    with get_db() as conn:
        conn.execute("INSERT OR IGNORE INTO machine_products VALUES (?,?)", (mid, pid))
    return {"ok": True}

@app.delete("/api/machines/{mid}/products/{pid}")
def unassign_product(mid: int, pid: int):
    with get_db() as conn:
        conn.execute("DELETE FROM machine_products WHERE machine_id=? AND product_id=?", (mid, pid))
    return {"ok": True}


# --- Tracking ---

@app.get("/api/tracking")
def get_tracking(month: Optional[str] = None, product_id: Optional[int] = None):
    with get_db() as conn:
        q = "SELECT dt.*,p.name product_name,p.monthly_target FROM daily_tracking dt JOIN products p ON p.id=dt.product_id WHERE 1=1"
        params: list = []
        if month:
            q += " AND dt.tracking_date LIKE ?"
            params.append(f"{month}%")
        if product_id:
            q += " AND dt.product_id=?"
            params.append(product_id)
        return [dict(r) for r in conn.execute(q + " ORDER BY dt.tracking_date DESC", params).fetchall()]

@app.post("/api/tracking", status_code=201)
def create_tracking(data: TrackingIn):
    stock_end = max(0, data.stock_start + data.produced - data.sold)
    with get_db() as conn:
        conn.execute("""
            INSERT OR REPLACE INTO daily_tracking
            (tracking_date,product_id,stock_start,produced,sold,stock_end)
            VALUES (?,?,?,?,?,?)
        """, (data.tracking_date, data.product_id, data.stock_start, data.produced, data.sold, stock_end))
        conn.execute("UPDATE products SET current_stock=? WHERE id=?", (stock_end, data.product_id))
    return {"ok": True, "stock_end": stock_end}


# --- Analytics ---

@app.get("/api/analytics/performance")
def get_performance(month: Optional[str] = None):
    if not month:
        month = date.today().strftime("%Y-%m")
    today = date.today()
    yr, mo = int(month[:4]), int(month[5:])
    _, days_in = calendar.monthrange(yr, mo)
    total_wd = sum(1 for d in range(1, days_in + 1) if date(yr, mo, d).weekday() < 5)
    elapsed_wd = sum(
        1 for d in range(1, min(today.day + 1, days_in + 1))
        if date(yr, mo, d).weekday() < 5 and date(yr, mo, d) <= today
    )
    remaining_wd = total_wd - elapsed_wd

    with get_db() as conn:
        products = [dict(r) for r in conn.execute("SELECT * FROM products").fetchall()]
        result = []
        for p in products:
            pid = p["id"]
            agg = conn.execute("""
                SELECT COALESCE(SUM(sold),0) ts, COALESCE(SUM(produced),0) tp
                FROM daily_tracking WHERE product_id=? AND tracking_date LIKE ?
            """, (pid, f"{month}%")).fetchone()
            total_sold, total_prod = agg["ts"], agg["tp"]
            mt = p["monthly_target"]
            stock = p["current_stock"]
            expected = round(mt * elapsed_wd / total_wd) if total_wd else 0
            avg_daily = round(total_sold / elapsed_wd, 1) if elapsed_wd else 0
            prod_needed = max(0, mt - total_sold - stock)
            stock_days = round(stock / avg_daily) if avg_daily > 0 else 999

            result.append({
                "product_id": pid,
                "product_name": p["name"],
                "product_code": p.get("code"),
                "monthly_target": mt,
                "total_sold": total_sold,
                "total_produced": total_prod,
                "expected_sold_by_today": expected,
                "sales_delta": total_sold - expected,
                "current_stock": stock,
                "production_needed": prod_needed,
                "remaining_target": max(0, mt - total_sold),
                "stock_coverage_days": stock_days,
                "next_month_consumed": max(0, total_sold - mt),
                "is_critical": avg_daily > 0 and stock < avg_daily * 3,
                "elapsed_working_days": elapsed_wd,
                "remaining_working_days": remaining_wd,
                "total_working_days": total_wd,
                "avg_daily_sales": avg_daily,
            })

    return {
        "month": month,
        "elapsed_working_days": elapsed_wd,
        "remaining_working_days": remaining_wd,
        "total_working_days": total_wd,
        "products": result,
    }


# --- Schedule ---

@app.get("/api/schedule")
def get_schedule(week_start: Optional[str] = None):
    if not week_start:
        today = date.today()
        week_start = (today - timedelta(days=today.weekday())).isoformat()
    with get_db() as conn:
        rows = [dict(r) for r in conn.execute("""
            SELECT ps.*,
                   p.name product_name, p.code product_code,
                   m.name machine_name, m.code machine_code, m.capacity_per_day
            FROM production_schedule ps
            JOIN products p ON p.id=ps.product_id
            JOIN machines m ON m.id=ps.machine_id
            WHERE ps.week_start=?
            ORDER BY ps.machine_id, ps.scheduled_date
        """, (week_start,)).fetchall()]

        by_machine: dict[int, dict] = {}
        for r in rows:
            mid = r["machine_id"]
            if mid not in by_machine:
                by_machine[mid] = {
                    "machine_id": mid,
                    "machine_name": r["machine_name"],
                    "machine_code": r["machine_code"],
                    "capacity_per_day": r["capacity_per_day"],
                    "schedule": [],
                }
            by_machine[mid]["schedule"].append(r)

    return {"week_start": week_start, "machines": list(by_machine.values())}

@app.post("/api/schedule", status_code=201)
def create_schedule(data: ScheduleIn):
    with get_db() as conn:
        cur = conn.execute("""
            INSERT INTO production_schedule
            (week_start,scheduled_date,machine_id,product_id,planned_quantity,actual_quantity,status,notes)
            VALUES (?,?,?,?,?,?,?,?)
        """, (data.week_start, data.scheduled_date, data.machine_id, data.product_id,
              data.planned_quantity, data.actual_quantity, data.status, data.notes))
        return {"id": cur.lastrowid, **data.model_dump()}

@app.put("/api/schedule/{sid}")
def update_schedule(sid: int, data: SchedulePatch):
    with get_db() as conn:
        updates = {k: v for k, v in data.model_dump().items() if v is not None}
        if updates:
            sets = ", ".join(f"{k}=?" for k in updates)
            conn.execute(f"UPDATE production_schedule SET {sets} WHERE id=?", [*updates.values(), sid])
        row = conn.execute("SELECT * FROM production_schedule WHERE id=?", (sid,)).fetchone()
        if not row:
            raise HTTPException(404, "Not found")
        return dict(row)

@app.delete("/api/schedule/{sid}")
def delete_schedule(sid: int):
    with get_db() as conn:
        conn.execute("DELETE FROM production_schedule WHERE id=?", (sid,))
    return {"ok": True}

@app.post("/api/schedule/generate")
def generate_schedule(data: GenerateIn):
    try:
        return run_scheduling_agent(data.week_start, data.regenerate)
    except Exception as e:
        raise HTTPException(500, str(e))


# --- Rules ---

@app.get("/api/rules")
def list_rules():
    with get_db() as conn:
        return [dict(r) for r in conn.execute(
            "SELECT * FROM agent_rules ORDER BY priority DESC, created_at"
        ).fetchall()]

@app.post("/api/rules", status_code=201)
def create_rule(data: RuleIn):
    with get_db() as conn:
        cur = conn.execute(
            "INSERT INTO agent_rules (rule_type,name,description,active,priority) VALUES (?,?,?,?,?)",
            (data.rule_type, data.name, data.description, data.active, data.priority)
        )
        return {"id": cur.lastrowid, **data.model_dump()}

@app.put("/api/rules/{rid}")
def update_rule(rid: int, data: RuleIn):
    with get_db() as conn:
        conn.execute(
            "UPDATE agent_rules SET rule_type=?,name=?,description=?,active=?,priority=? WHERE id=?",
            (data.rule_type, data.name, data.description, data.active, data.priority, rid)
        )
        return {"id": rid, **data.model_dump()}

@app.delete("/api/rules/{rid}")
def delete_rule(rid: int):
    with get_db() as conn:
        conn.execute("DELETE FROM agent_rules WHERE id=?", (rid,))
    return {"ok": True}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
