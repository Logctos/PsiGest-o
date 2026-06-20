"""
Modulo de analise preditiva de vendas e estoque usando XGBoost.

Fluxo:
  1. Carrega historico de daily_tracking do banco
  2. Engenharia de features por produto (lag, rolling mean, dia da semana, etc.)
  3. Treina um modelo XGBoostRegressor por produto (ou reutiliza modelo em cache)
  4. Gera previsao de vendas para os proximos N dias
  5. Calcula previsao de estoque com base no plano de producao existente
  6. Retorna alertas automaticos de risco de ruptura
"""

from __future__ import annotations

import warnings
from datetime import date, timedelta
from typing import Optional

import numpy as np
import pandas as pd
from xgboost import XGBRegressor
from sklearn.preprocessing import LabelEncoder

warnings.filterwarnings("ignore", category=UserWarning)

# Cache simples em memoria: {product_id: (model, feature_cols, trained_at)}
_model_cache: dict[int, tuple] = {}
CACHE_MINUTES = 30


# ---------------------------------------------------------------------------
# Feature engineering
# ---------------------------------------------------------------------------

def _build_features(df: pd.DataFrame) -> pd.DataFrame:
    """Recebe dataframe de uma serie diaria de um produto e adiciona features."""
    df = df.sort_values("ds").copy()
    df["day_of_week"]  = df["ds"].dt.dayofweek          # 0=Mon
    df["day_of_month"] = df["ds"].dt.day
    df["week_of_year"] = df["ds"].dt.isocalendar().week.astype(int)
    df["month"]        = df["ds"].dt.month
    df["is_monday"]    = (df["day_of_week"] == 0).astype(int)
    df["is_friday"]    = (df["day_of_week"] == 4).astype(int)

    for lag in [1, 2, 3, 5, 7]:
        df[f"lag_{lag}"] = df["y"].shift(lag)

    for window in [3, 5, 7, 14]:
        df[f"roll_mean_{window}"] = df["y"].shift(1).rolling(window).mean()
        df[f"roll_std_{window}"]  = df["y"].shift(1).rolling(window).std()

    df["roll_max_7"] = df["y"].shift(1).rolling(7).max()
    df["roll_min_7"] = df["y"].shift(1).rolling(7).min()
    df["trend"]      = np.arange(len(df))

    return df


def _feature_cols() -> list[str]:
    return [
        "day_of_week", "day_of_month", "week_of_year", "month",
        "is_monday", "is_friday",
        "lag_1", "lag_2", "lag_3", "lag_5", "lag_7",
        "roll_mean_3", "roll_mean_5", "roll_mean_7", "roll_mean_14",
        "roll_std_3", "roll_std_5", "roll_std_7", "roll_std_14",
        "roll_max_7", "roll_min_7",
        "trend",
    ]


# ---------------------------------------------------------------------------
# Treinamento
# ---------------------------------------------------------------------------

def _train_model(series: pd.DataFrame) -> Optional[XGBRegressor]:
    """Treina XGBoost numa serie temporal de um produto. Retorna None se dados insuficientes."""
    df = _build_features(series)
    feats = _feature_cols()
    df_clean = df.dropna(subset=feats + ["y"])

    # Minimo de 10 amostras para treinar
    if len(df_clean) < 10:
        return None

    X = df_clean[feats].values
    y = df_clean["y"].values

    model = XGBRegressor(
        n_estimators=200,
        max_depth=4,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        min_child_weight=2,
        reg_alpha=0.1,
        reg_lambda=1.0,
        random_state=42,
        verbosity=0,
        n_jobs=1,
    )
    model.fit(X, y)
    return model


# ---------------------------------------------------------------------------
# Previsao recursiva
# ---------------------------------------------------------------------------

def _predict_future(
    model: XGBRegressor,
    history: pd.DataFrame,
    horizon: int,
) -> list[dict]:
    """Gera previsoes dia a dia (recursivamente) para os proximos `horizon` dias uteis."""
    feats = _feature_cols()
    df = _build_features(history.copy())
    last_trend = int(df["trend"].iloc[-1])

    predictions: list[dict] = []
    rolling_history = list(df["y"].values)

    next_date = history["ds"].max() + timedelta(days=1)

    while len(predictions) < horizon:
        if next_date.weekday() >= 5:  # pula fim de semana
            next_date += timedelta(days=1)
            continue

        last_trend += 1
        arr = np.array(rolling_history)

        def lag(n: int) -> float:
            return float(arr[-n]) if len(arr) >= n else float(arr.mean())

        def roll_mean(w: int) -> float:
            return float(arr[-w:].mean()) if len(arr) >= w else float(arr.mean())

        def roll_std(w: int) -> float:
            return float(arr[-w:].std()) if len(arr) >= w else 0.0

        row = [
            next_date.weekday(),
            next_date.day,
            next_date.isocalendar()[1],
            next_date.month,
            int(next_date.weekday() == 0),
            int(next_date.weekday() == 4),
            lag(1), lag(2), lag(3), lag(5), lag(7),
            roll_mean(3), roll_mean(5), roll_mean(7), roll_mean(14),
            roll_std(3), roll_std(5), roll_std(7), roll_std(14),
            float(arr[-7:].max()) if len(arr) >= 7 else float(arr.max()),
            float(arr[-7:].min()) if len(arr) >= 7 else float(arr.min()),
            float(last_trend),
        ]

        pred = float(model.predict(np.array([row]))[0])
        pred = max(0.0, pred)

        predictions.append({"date": next_date.isoformat(), "predicted_sales": round(pred, 2)})
        rolling_history.append(pred)
        next_date += timedelta(days=1)

    return predictions


# ---------------------------------------------------------------------------
# Importancia de features
# ---------------------------------------------------------------------------

def _feature_importance(model: XGBRegressor) -> list[dict]:
    scores = model.feature_importances_
    feats  = _feature_cols()
    pairs = sorted(zip(feats, scores), key=lambda x: x[1], reverse=True)
    total = sum(s for _, s in pairs) or 1.0
    return [
        {"feature": f, "importance": round(float(s / total * 100), 1)}
        for f, s in pairs[:10]
    ]


# ---------------------------------------------------------------------------
# Ponto de entrada principal
# ---------------------------------------------------------------------------

def run_prediction(
    product_id: int,
    history_rows: list[dict],
    current_stock: int,
    planned_production: list[dict],  # [{"date": "YYYY-MM-DD", "quantity": int}]
    horizon: int = 21,
    monthly_target: int = 0,
) -> dict:
    """
    Executa o pipeline completo de previsao para um produto.

    Parametros
    ----------
    product_id       : ID do produto
    history_rows     : lista de {"date": str, "sold": int} vindos do DB
    current_stock    : estoque atual
    planned_production: producao ja programada nos proximos dias
    horizon          : quantos dias uteis prever (default 21 = ~1 mes)
    monthly_target   : meta mensal para calcular gap

    Retorno
    -------
    dict com previsoes diarias, alertas e metricas do modelo
    """
    import warnings as _w
    _w.filterwarnings("ignore")

    if len(history_rows) < 5:
        return {
            "product_id": product_id,
            "status": "insufficient_data",
            "message": "Dados insuficientes para treinar o modelo (minimo 5 dias com venda registrada).",
            "predictions": [],
            "alerts": [],
            "feature_importance": [],
            "model_info": {},
        }

    # Monta serie temporal
    series = (
        pd.DataFrame(history_rows)
        .rename(columns={"date": "ds", "sold": "y"})
        .assign(ds=lambda d: pd.to_datetime(d["ds"]), y=lambda d: d["y"].astype(float))
        .sort_values("ds")
        .drop_duplicates("ds")
    )

    # Treina (ou usa cache)
    import time as _time
    cached = _model_cache.get(product_id)
    now_ts = _time.time()
    if cached and (now_ts - cached[2]) < CACHE_MINUTES * 60:
        model = cached[0]
        from_cache = True
    else:
        model = _train_model(series)
        if model is None:
            return {
                "product_id": product_id,
                "status": "insufficient_data",
                "message": "Serie historica insuficiente para treinar o modelo.",
                "predictions": [],
                "alerts": [],
                "feature_importance": [],
                "model_info": {},
            }
        _model_cache[product_id] = (model, _feature_cols(), now_ts)
        from_cache = False

    # Previsoes futuras
    raw_preds = _predict_future(model, series, horizon)

    # Producao planejada indexada por data
    prod_by_date: dict[str, int] = {}
    for p in planned_production:
        d = p["date"]
        prod_by_date[d] = prod_by_date.get(d, 0) + p["quantity"]

    # Simula estoque dia a dia
    stock = float(current_stock)
    enriched: list[dict] = []
    for pred in raw_preds:
        d = pred["date"]
        produced = prod_by_date.get(d, 0)
        sold_hat = pred["predicted_sales"]
        stock = max(0.0, stock + produced - sold_hat)
        enriched.append({
            **pred,
            "planned_production": produced,
            "stock_after": round(stock, 0),
        })

    # Alertas automaticos
    alerts: list[dict] = []
    avg_daily = series["y"].tail(14).mean()

    # Ruptura de estoque (stock_after == 0)
    ruptura_days = [e for e in enriched if e["stock_after"] <= 0]
    if ruptura_days:
        alerts.append({
            "level": "critical",
            "type": "stockout",
            "message": f"Ruptura de estoque prevista em {ruptura_days[0]['date']}. "
                       f"{len(ruptura_days)} dias sem estoque nos proximos {horizon} dias uteis.",
        })

    # Estoque critico (< 3 dias de venda)
    elif any(e["stock_after"] < avg_daily * 3 for e in enriched[:10]):
        first = next(e for e in enriched[:10] if e["stock_after"] < avg_daily * 3)
        alerts.append({
            "level": "warning",
            "type": "low_stock",
            "message": f"Estoque critico previsto em {first['date']}: "
                       f"{int(first['stock_after'])} und. (menos de 3 dias de cobertura).",
        })

    # Demanda acima do esperado
    total_predicted = sum(e["predicted_sales"] for e in enriched)
    if monthly_target > 0:
        expected_21d = monthly_target * (horizon / 22)
        if total_predicted > expected_21d * 1.2:
            pct = round((total_predicted / expected_21d - 1) * 100)
            alerts.append({
                "level": "info",
                "type": "high_demand",
                "message": f"Demanda prevista {pct}% acima da meta proporcional nos proximos {horizon} dias uteis.",
            })
        elif total_predicted < expected_21d * 0.8:
            pct = round((1 - total_predicted / expected_21d) * 100)
            alerts.append({
                "level": "info",
                "type": "low_demand",
                "message": f"Demanda prevista {pct}% abaixo da meta. Pode haver sobra de estoque.",
            })

    # MAPE aproximado no treino (ultimos 20%)
    train_df = _build_features(series).dropna()
    feats = _feature_cols()
    if len(train_df) >= 5:
        split = max(1, int(len(train_df) * 0.8))
        val_df = train_df.iloc[split:]
        if len(val_df) > 0:
            y_true = val_df["y"].values
            y_pred = model.predict(val_df[feats].values)
            mask   = y_true > 0
            mape   = float(np.mean(np.abs((y_true[mask] - y_pred[mask]) / y_true[mask])) * 100) if mask.any() else None
        else:
            mape = None
    else:
        mape = None

    return {
        "product_id": product_id,
        "status": "ok",
        "horizon_days": horizon,
        "predictions": enriched,
        "total_predicted_sales": round(total_predicted, 1),
        "avg_daily_predicted": round(total_predicted / horizon, 2),
        "alerts": alerts,
        "feature_importance": _feature_importance(model),
        "model_info": {
            "algorithm": "XGBoost",
            "n_estimators": 200,
            "training_samples": int(len(series)),
            "from_cache": from_cache,
            "mape_pct": round(mape, 1) if mape is not None else None,
        },
    }
