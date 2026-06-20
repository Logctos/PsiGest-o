import anthropic
import json
import os
import re
import calendar
from datetime import date, timedelta

from database import get_db

AGENT_MODEL = os.environ.get("AGENT_MODEL", "claude-sonnet-4-6")


def _extract_json(text: str) -> dict:
    m = re.search(r'```(?:json)?\s*(\{[\s\S]*?\})\s*```', text)
    if m:
        return json.loads(m.group(1))
    m = re.search(r'\{[\s\S]*\}', text)
    if m:
        return json.loads(m.group())
    raise ValueError("No JSON found in agent response")


def run_scheduling_agent(week_start: str, regenerate: bool = False) -> dict:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise ValueError("ANTHROPIC_API_KEY not set")

    client = anthropic.Anthropic(api_key=api_key)

    ws_date = date.fromisoformat(week_start)
    we_date = ws_date + timedelta(days=4)

    with get_db() as conn:
        if regenerate:
            conn.execute("DELETE FROM production_schedule WHERE week_start = ?", (week_start,))

        products = [dict(r) for r in conn.execute("SELECT * FROM products ORDER BY priority DESC").fetchall()]
        machines = [dict(r) for r in conn.execute("SELECT * FROM machines").fetchall()]
        rules = [dict(r) for r in conn.execute(
            "SELECT * FROM agent_rules WHERE active = 1 ORDER BY priority DESC"
        ).fetchall()]

        mp_rows = conn.execute("SELECT * FROM machine_products").fetchall()
        machine_products: dict[int, list[int]] = {}
        for row in mp_rows:
            machine_products.setdefault(row["machine_id"], []).append(row["product_id"])

        today = date.today()
        month = ws_date.strftime("%Y-%m")
        yr, mo = int(month[:4]), int(month[5:])
        _, days_in = calendar.monthrange(yr, mo)

        total_wd = sum(1 for d in range(1, days_in + 1) if date(yr, mo, d).weekday() < 5)
        elapsed_wd = sum(
            1 for d in range(1, min(today.day + 1, days_in + 1))
            if date(yr, mo, d).weekday() < 5 and date(yr, mo, d) <= today
        )
        remaining_wd = total_wd - elapsed_wd

        performance = []
        for p in products:
            pid = p["id"]
            agg = conn.execute("""
                SELECT COALESCE(SUM(sold),0) ts, COALESCE(SUM(produced),0) tp
                FROM daily_tracking WHERE product_id=? AND tracking_date LIKE ?
            """, (pid, f"{month}%")).fetchone()

            total_sold = agg["ts"]
            expected = round(p["monthly_target"] * elapsed_wd / total_wd) if total_wd else 0
            prod_needed = max(0, p["monthly_target"] - total_sold - p["current_stock"])
            avg_daily = round(total_sold / elapsed_wd, 1) if elapsed_wd else 0

            performance.append({
                "id": pid,
                "name": p["name"],
                "code": p.get("code"),
                "monthly_target": p["monthly_target"],
                "total_sold_so_far": total_sold,
                "expected_sold_by_today": expected,
                "sales_vs_expected": total_sold - expected,
                "current_stock": p["current_stock"],
                "production_needed_this_month": prod_needed,
                "avg_daily_sales": avg_daily,
                "next_month_stock_consumed": max(0, total_sold - p["monthly_target"]),
                "priority": p["priority"],
                "min_batch": p.get("min_batch", 1),
                "eligible_machine_ids": machine_products.get(pid, []),
            })

        machines_ctx = []
        for m in machines:
            mc = dict(m)
            mc["eligible_product_ids"] = machine_products.get(m["id"], [])
            machines_ctx.append(mc)

        week_days = []
        d = ws_date
        while d <= we_date:
            if d.weekday() < 5:
                week_days.append(d.isoformat())
            d += timedelta(days=1)

        rules_text = "\n".join(
            f"{i+1}. [{r['rule_type'].upper()} P{r['priority']}] {r['name']}: {r['description']}"
            for i, r in enumerate(rules)
        ) if rules else "Nenhuma regra especifica. Siga boas praticas industriais."

        prompt = f"""Voce e um agente especialista em programacao de producao industrial. Gere a programacao semanal.

DATA DE HOJE: {today.isoformat()}
SEMANA: {week_start} a {we_date.isoformat()}
DIAS UTEIS DA SEMANA: {", ".join(week_days)}
DIAS UTEIS DO MES: {elapsed_wd} decorridos / {total_wd} total / {remaining_wd} restantes

PERFORMANCE DOS PRODUTOS:
{json.dumps(performance, ensure_ascii=False, indent=2)}

MAQUINAS:
{json.dumps(machines_ctx, ensure_ascii=False, indent=2)}

REGRAS OBRIGATORIAS:
{rules_text}

INSTRUCOES:
1. Calcule a producao necessaria para cada produto nesta semana
2. Produtos com next_month_stock_consumed > 0 estao em crise - priorize reposicao
3. Produtos com current_stock < avg_daily_sales * 5 estao com estoque critico
4. Respeite capacity_per_day de cada maquina (soma das quantidades por maquina/dia <= capacity_per_day)
5. So aloque produto em maquina se o machine.id estiver em product.eligible_machine_ids
6. Respeite as regras de sequenciamento e restricoes listadas acima
7. Distribua a carga ao longo da semana de forma equilibrada

Retorne APENAS JSON valido:
{{
  "schedule": [
    {{"date": "YYYY-MM-DD", "machine_id": 1, "product_id": 1, "planned_quantity": 100, "reasoning": "..."}}
  ],
  "summary": "Resumo das principais decisoes",
  "alerts": ["Alerta critico 1", "..."]
}}"""

        msg = client.messages.create(
            model=AGENT_MODEL,
            max_tokens=4096,
            messages=[{"role": "user", "content": prompt}]
        )

        output = _extract_json(msg.content[0].text)

        for entry in output.get("schedule", []):
            conn.execute("""
                INSERT INTO production_schedule
                (week_start, scheduled_date, machine_id, product_id, planned_quantity, agent_reasoning, status)
                VALUES (?, ?, ?, ?, ?, ?, 'planned')
            """, (week_start, entry["date"], entry["machine_id"], entry["product_id"],
                  entry["planned_quantity"], entry.get("reasoning", "")))

        return {
            "week_start": week_start,
            "schedule_count": len(output.get("schedule", [])),
            "summary": output.get("summary", ""),
            "alerts": output.get("alerts", []),
        }
