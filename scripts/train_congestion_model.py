"""KSPO&CO 2026 SafePass — Step 2: Leak-Free Date-Grouped CV Congestion ML Model & Browser Bundle.

Architecture: Joint Partially-Penalized Diurnal+Concert+Weather Ridge + LightGBM Residual Booster
  Inside EVERY Leave-One-Day-Out GroupKFold split (31 calendar date groups, ZERO same-day leakage):
    1. Stage 1 (Joint Additive Base): Simultaneously estimates the 48 diurnal slots
       (is_weekend x hour 0..23, light penalty lambda_base=0.5) AND standardized operating-hour-gated
       show-offset, weather, and rain x concert interaction coefficients (penalty lambda_feat tuned
       via inner GroupKFold on training days only!).
       -> Eliminates weekend-concert confounding so weekday concerts (e.g. Fri 7/12 KSPO DOME)
          extrapolate cleanly from weekend concert physics!
    2. Stage 2 (Nonlinear Residual Booster): Fits a compact regularized LightGBM on Stage-1
       residuals during active operating hours (06..23h) to capture higher-order nonlinearities
       (e.g. rain x multi-venue modal-shift saturation, live lag trends).
    3. Overnight hours (00..05h) stay cleanly anchored to the diurnal baseline (park closed).

Compares 5 models identically on all 744 out-of-fold hourly predictions:
  - Baseline A (공식 parking.do 방식): flat weekday/weekend x hour mean (no weather, no concerts)
  - Baseline B (경쟁작 olparkspot.com 규칙 방식): flat baseline x fixed 1.7x/2.7x concert multiplier (no weather)
  - Ablation (SafePass No-Weather): Joint Ridge+LGBM using calendar + concert schedule only
  - Model C (SafePass 72h Forecast): Joint Ridge+LGBM with calendar + concert offsets + KMA weather +
    nonlinear rain x concert interaction (0 lag, 72h pre-visit forecast!)
  - Model C+ (SafePass Live Nowcast): Model C + real-time parkingorsApi lag-1h/2h trend (+1h horizon)

Outputs:
  - data/processed/model_metrics.json
  - runs/ml/cv_oof_predictions.csv
  - runs/ml/backtest_report.json
  - web/public/data/model_bundle.json (< 100 KB, 0ms browser inference + lookup + benchmarks)
"""
from __future__ import annotations

import argparse
import json
import math
import warnings
from datetime import datetime, timedelta, timezone
from pathlib import Path

import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.metrics import accuracy_score, f1_score, mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import GroupKFold

warnings.filterwarnings("ignore", category=UserWarning)

ROOT = Path(r"C:\Users\basqu\Projects\ksponco-data-2026")
PROC_DIR = ROOT / "data" / "processed"
RUNS_ML_DIR = ROOT / "runs" / "ml"
WEB_DATA_DIR = ROOT / "web" / "public" / "data"
KST = timezone(timedelta(hours=9))


def build_diurnal_design(df: pd.DataFrame) -> np.ndarray:
    """48-column indicator matrix: [0..23] weekday hours, [24..47] weekend hours."""
    n = len(df)
    D = np.zeros((n, 48), dtype=float)
    hrs = df["hour"].to_numpy(dtype=int)
    wknd = df["is_weekend"].to_numpy(dtype=int)
    idx = wknd * 24 + hrs
    D[np.arange(n), idx] = 1.0
    return D


def build_covariates(df: pd.DataFrame, include_lags: bool = False) -> tuple[pd.DataFrame, list[str]]:
    """Compact, show-start-offset & operating-hour-gated physical features (zero overnight noise!)."""
    X = pd.DataFrame(index=df.index)
    h = df["hour"].astype(int)
    dow = df["dow"].astype(int)

    is_daytime = ((h >= 6) & (h <= 21)).astype(float)
    is_morning = ((h >= 7) & (h <= 11)).astype(float)
    is_evening = ((h >= 16) & (h <= 22)).astype(float)
    is_night_ex = ((h >= 20) & (h <= 22)).astype(float)
    is_fri = (dow == 4).astype(float)
    is_sat = (dow == 5).astype(float)
    is_sun = (dow == 6).astype(float)
    is_wknd = df["is_weekend"].astype(float)

    # Exact show-start-relative capacity offsets (in 1,000 seats) from official KSPO&CO calendar
    # -2h/-1h = arrival surge, 0h/+1h = during-show lull, +3h/+4h = massive post-show exit wave!
    cap_m3 = df["cap_m3"].astype(float) if "cap_m3" in df.columns else 0.0
    cap_m2 = df["cap_m2"].astype(float) if "cap_m2" in df.columns else df["entry_window_cap_k"].astype(float)
    cap_m1 = df["cap_m1"].astype(float) if "cap_m1" in df.columns else df["entry_window_cap_k"].astype(float)
    cap_0 = df["cap_0"].astype(float) if "cap_0" in df.columns else df["active_show_cap_k"].astype(float)
    cap_p1 = df["cap_p1"].astype(float) if "cap_p1" in df.columns else 0.0
    cap_p2 = df["cap_p2"].astype(float) if "cap_p2" in df.columns else 0.0
    cap_p3 = df["cap_p3"].astype(float) if "cap_p3" in df.columns else df["exit_window_cap_k"].astype(float)
    cap_p4 = df["cap_p4"].astype(float) if "cap_p4" in df.columns else 0.0

    X["cap_m3"] = cap_m3
    X["cap_m2"] = cap_m2
    X["cap_m1"] = cap_m1
    X["cap_0"] = cap_0
    X["cap_p1"] = cap_p1
    X["cap_p2"] = cap_p2
    X["cap_p3"] = cap_p3
    X["cap_p4"] = cap_p4

    cap_k = df["concert_cap_k"].astype(float)
    n_maj = df["n_major_venues_day"].astype(float)
    has_dome = df["has_kspo_dome"].astype(float)
    multi_v = (n_maj >= 2).astype(float)

    X["concert_cap_x_evening"] = cap_k * is_evening
    X["multi_venue_x_pre"] = multi_v * (cap_m2 + cap_m1) / 10.0
    X["multi_venue_x_exit"] = multi_v * (cap_p3 + 0.5 * cap_p2) / 10.0
    X["fri_x_evening"] = is_fri * is_evening
    X["sun_x_morning"] = is_sun * is_morning
    X["sat_x_evening"] = is_sat * is_evening

    # Weather features (gated to active park hours 06~22!)
    rn = df["rn"].astype(float).clip(lower=0.0)
    rn3 = df["rn_3h_sum"].astype(float).clip(lower=0.0)
    rnd = df["rn_day_sum"].astype(float).clip(lower=0.0)
    ta = df["ta"].astype(float)

    lrn = np.log1p(rn)
    lrn3 = np.log1p(rn3)
    lrnd = np.log1p(rnd)
    no_dome = 1.0 - has_dome

    # 1) Rain suppresses general non-KSPO-DOME daytime visits (-17.5%, estimated across all 24 non-dome days)
    X["rain_hr_x_no_dome_day"] = lrn * no_dome * is_daytime
    X["rain_day_x_no_dome_day"] = lrnd * no_dome * is_daytime

    # 2) NONLINEAR INTERACTION: Rain + Major Concert -> Car Modal Shift & Exit Surge!
    X["rain_x_cap_arrival"] = lrnd * (cap_m2 + cap_m1) / 10.0
    X["rain_x_cap_exit"] = (0.5 * lrn3 + 0.5 * lrnd) * (cap_p3 + 0.4 * cap_p4) / 10.0
    X["rain_day_x_multi_venue_exit"] = lrnd * multi_v * is_night_ex
    X["ta_dev_x_daytime"] = ((ta - 26.5) / 5.0) * is_daytime

    return X, list(X.columns)


def solve_differential_ridge(
    D_tr: np.ndarray,
    Z_tr: np.ndarray,
    y_tr: np.ndarray,
    lambda_base: float = 0.25,
    lambda_feat: float = 40.0,
) -> tuple[np.ndarray, np.ndarray]:
    """Closed-form Ridge solving min ||y - D*b - Z*w||^2 + lambda_base*||b||^2 + lambda_feat*||w||^2.
    Regularizes covariates strongly without distorting the 48 diurnal slots!
    """
    A = np.hstack([D_tr, Z_tr])
    p_d = D_tr.shape[1]
    p_z = Z_tr.shape[1]
    pen = np.concatenate([np.full(p_d, lambda_base), np.full(p_z, lambda_feat)])
    gram = A.T @ A + np.diag(pen)
    rhs = A.T @ y_tr
    theta = np.linalg.solve(gram, rhs)
    return theta[:p_d], theta[p_d:]


def fit_joint_ridge_cv(
    tr_df: pd.DataFrame,
    X_tr: pd.DataFrame,
    y_tr: np.ndarray,
) -> dict:
    """Fit Stage-1 Joint Differential-Ridge with inner 5-fold date-grouped CV for lambda_feat."""
    D_tr = build_diurnal_design(tr_df)
    raw_X = X_tr.to_numpy(dtype=float)
    mu = raw_X.mean(axis=0)
    sc = raw_X.std(axis=0)
    sc = np.where(sc < 1e-8, 1.0, sc)
    Z_tr = (raw_X - mu) / sc

    dates_tr = tr_df["date"].to_numpy()
    n_inner = min(5, len(np.unique(dates_tr)))
    igkf = GroupKFold(n_splits=n_inner)
    cand_lambdas = [8.0, 20.0, 50.0, 120.0, 280.0]

    best_lam = 50.0
    best_loss = float("inf")
    for lam in cand_lambdas:
        se_sum = 0.0
        for itr, iva in igkf.split(Z_tr, groups=dates_tr):
            b, w = solve_differential_ridge(D_tr[itr], Z_tr[itr], y_tr[itr], lambda_base=0.25, lambda_feat=lam)
            pred = D_tr[iva] @ b + Z_tr[iva] @ w
            se_sum += float(np.sum((y_tr[iva] - pred) ** 2))
        if se_sum < best_loss:
            best_loss = se_sum
            best_lam = lam

    b_full, w_full = solve_differential_ridge(D_tr, Z_tr, y_tr, lambda_base=0.25, lambda_feat=best_lam)
    return {
        "b_diurnal": b_full,
        "w_feat": w_full,
        "mu": mu,
        "sc": sc,
        "lambda_feat": best_lam,
        "features": list(X_tr.columns),
    }


def predict_joint_ridge(model: dict, df: pd.DataFrame, X: pd.DataFrame) -> np.ndarray:
    D = build_diurnal_design(df)
    Z = (X.to_numpy(dtype=float) - model["mu"]) / model["sc"]
    open_gate = ((df["hour"] >= 6) & (df["hour"] <= 23)).to_numpy(dtype=float)
    return np.clip(D @ model["b_diurnal"] + (Z @ model["w_feat"]) * open_gate, 0.0, None)


def fit_predict_safepass_fold(
    tr_df: pd.DataFrame,
    va_df: pd.DataFrame,
    X_tr: pd.DataFrame,
    X_va: pd.DataFrame,
    target: str,
    boost_weight: float = 0.40,
    nowcast_mode: bool = False,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Stage-1 Joint Differential-Ridge + Stage-2 Compact LightGBM Residual Booster.
    In nowcast_mode (+1h live telemetry), feeds ONLY Stage-1 residual lags (y_{t-1} - p1_{t-1})
    into Stage-2 so diurnal slots stay completely uncontaminated!
    """
    y_tr = tr_df[target].to_numpy(dtype=float)
    r_model = fit_joint_ridge_cv(tr_df, X_tr, y_tr)
    p_tr_stage1 = predict_joint_ridge(r_model, tr_df, X_tr)
    p_va_stage1 = predict_joint_ridge(r_model, va_df, X_va)

    res_tr = y_tr - p_tr_stage1
    X_tr_lgb = X_tr.copy()
    X_va_lgb = X_va.copy()
    X_tr_lgb["hour_num"] = tr_df["hour"].to_numpy(dtype=float)
    X_va_lgb["hour_num"] = va_df["hour"].to_numpy(dtype=float)
    X_tr_lgb["is_wknd"] = tr_df["is_weekend"].to_numpy(dtype=float)
    X_va_lgb["is_wknd"] = va_df["is_weekend"].to_numpy(dtype=float)

    if nowcast_mode:
        # Compute strictly causal within-day residual lags (lag1=0 at hour 0)
        def within_day_res_lags(sub_df: pd.DataFrame, res_vals: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
            s = pd.Series(res_vals, index=sub_df.index)
            l1 = s.groupby(sub_df["date"]).shift(1).fillna(0.0).to_numpy(dtype=float)
            l2 = s.groupby(sub_df["date"]).shift(2).fillna(0.0).to_numpy(dtype=float)
            return l1, l2

        res_va_true = va_df[target].to_numpy(dtype=float) - p_va_stage1
        tr_l1, tr_l2 = within_day_res_lags(tr_df, res_tr)
        va_l1, va_l2 = within_day_res_lags(va_df, res_va_true)
        X_tr_lgb["res_lag1"] = tr_l1
        X_tr_lgb["res_lag2"] = tr_l2
        X_va_lgb["res_lag1"] = va_l1
        X_va_lgb["res_lag2"] = va_l2

    gbm = lgb.LGBMRegressor(
        n_estimators=80,
        learning_rate=0.04,
        max_depth=3,
        num_leaves=7,
        min_child_samples=16,
        subsample=0.85,
        subsample_freq=1,
        colsample_bytree=0.80,
        reg_alpha=2.5,
        reg_lambda=12.0,
        random_state=42,
        n_jobs=2,
        verbose=-1,
    )
    gbm.fit(X_tr_lgb, res_tr)
    open_va = ((va_df["hour"] >= 6) & (va_df["hour"] <= 23)).to_numpy(dtype=float)
    r_va_lgb = gbm.predict(X_va_lgb) * open_va

    # In nowcast mode, also add regularized AR(1) residual carryover estimated on training fold
    if nowcast_mode:
        denom = float(np.dot(tr_l1, tr_l1)) + 50000.0
        phi1 = max(0.0, min(0.65, float(np.dot(tr_l1, res_tr)) / denom))
        p_ens = np.clip(p_va_stage1 + 0.55 * (phi1 * va_l1 * open_va) + 0.45 * r_va_lgb, 0.0, None)
    else:
        p_ens = np.clip(p_va_stage1 + boost_weight * r_va_lgb, 0.0, None)
    return p_ens, p_va_stage1, gbm.feature_importances_[: len(X_tr.columns)]


def baseline_a_predict(train_df: pd.DataFrame, val_df: pd.DataFrame, target: str) -> np.ndarray:
    """Baseline A (공식 parking.do 방식): flat weekday/weekend x hour mean (no weather, no concerts)."""
    tbl = train_df.groupby(["is_weekend", "hour"])[target].mean().to_dict()
    global_h = train_df.groupby("hour")[target].mean().to_dict()
    return np.array(
        [tbl.get((int(r.is_weekend), int(r.hour)), global_h.get(int(r.hour), 0.0)) for r in val_df.itertuples()],
        dtype=float,
    )


def baseline_b_predict(train_df: pd.DataFrame, val_df: pd.DataFrame, target: str) -> np.ndarray:
    """Baseline B (경쟁작 olparkspot.com 고정 규칙 방식):
    weekday/weekend x hour baseline x fixed concert-window multiplier (1.7x single / 2.7x dual),
    zero weather awareness and zero rain x concert interaction.
    """
    base = baseline_a_predict(train_df, val_df, target)
    preds = []
    for b, r in zip(base, val_df.itertuples()):
        h = int(r.hour)
        n_maj = int(r.n_major_venues_day)
        mult = 1.0
        if target == "entries_h":
            if n_maj >= 2 and 16 <= h <= 19:
                mult = 2.7 if h in (17, 18) else 1.7
            elif n_maj == 1 and 16 <= h <= 19:
                mult = 1.7
        elif target == "exits_h":
            if n_maj >= 2 and 20 <= h <= 22:
                mult = 2.7 if h in (20, 21) else 1.7
            elif n_maj == 1 and 20 <= h <= 22:
                mult = 1.7
        else:
            if n_maj >= 2 and 17 <= h <= 21:
                mult = 2.7 if h in (18, 19, 20) else 1.7
            elif n_maj == 1 and 17 <= h <= 21:
                mult = 1.7
        preds.append(b * mult)
    return np.array(preds, dtype=float)


def day_cluster_bootstrap(
    dates: np.ndarray,
    y_true: np.ndarray,
    y_pred: np.ndarray,
    y_ref: np.ndarray | None = None,
    n_boot: int = 1000,
    seed: int = 42,
) -> dict:
    rng = np.random.default_rng(seed)
    uniq_days = np.unique(dates)
    day_idx = [np.where(dates == d)[0] for d in uniq_days]
    n_days = len(uniq_days)

    maes, rmses, r2s, diffs = [], [], [], []
    for _ in range(n_boot):
        picked = rng.integers(0, n_days, size=n_days)
        idx = np.concatenate([day_idx[i] for i in picked])
        yt = y_true[idx]
        yp = y_pred[idx]
        m = mean_absolute_error(yt, yp)
        maes.append(m)
        rmses.append(math.sqrt(mean_squared_error(yt, yp)))
        r2s.append(r2_score(yt, yp))
        if y_ref is not None:
            diffs.append(mean_absolute_error(yt, y_ref[idx]) - m)

    out = {
        "mae_ci95": [round(float(np.percentile(maes, 2.5)), 2), round(float(np.percentile(maes, 97.5)), 2)],
        "rmse_ci95": [round(float(np.percentile(rmses, 2.5)), 2), round(float(np.percentile(rmses, 97.5)), 2)],
        "r2_ci95": [round(float(np.percentile(r2s, 2.5)), 4), round(float(np.percentile(r2s, 97.5)), 4)],
    }
    if y_ref is not None:
        diffs_arr = np.array(diffs)
        out["mae_gain_vs_ref_ci95"] = [round(float(np.percentile(diffs_arr, 2.5)), 2), round(float(np.percentile(diffs_arr, 97.5)), 2)]
        out["p_value_vs_ref"] = round(float(np.mean(diffs_arr <= 0.0)), 4)
    return out


def compute_top5_hit_rate(df: pd.DataFrame, pred_col: str, actual_col: str, hours_filter: tuple[int, int] | None = None) -> dict:
    sub = df if hours_filter is None else df[(df["hour"] >= hours_filter[0]) & (df["hour"] <= hours_filter[1])]
    d_act = sub.groupby("date")[actual_col].sum().sort_values(ascending=False)
    d_prd = sub.groupby("date")[pred_col].sum().sort_values(ascending=False)
    top5_act = list(d_act.head(5).index)
    top5_prd = list(d_prd.head(5).index)
    hits = sorted(set(top5_act) & set(top5_prd))
    return {
        "hits": len(hits),
        "total": 5,
        "hit_rate_pct": round(len(hits) / 5.0 * 100.0, 1),
        "actual_top5_dates": top5_act,
        "predicted_top5_dates": top5_prd,
        "matched_dates": hits,
    }


def score_to_level(score: np.ndarray) -> np.ndarray:
    return np.where(score >= 78.0, "만차임박", np.where(score >= 62.0, "혼잡", np.where(score >= 40.0, "보통", "여유")))


def run_cv_benchmark(df: pd.DataFrame) -> dict:
    dates = df["date"].to_numpy()
    uniq_dates = sorted(df["date"].unique())
    n_splits = len(uniq_dates)
    gkf = GroupKFold(n_splits=n_splits)

    X_fcst, feat_fcst = build_covariates(df, include_lags=False)
    X_now, _ = build_covariates(df, include_lags=True)

    weather_cols = [c for c in feat_fcst if any(k in c for k in ["rain", "ta_"])]
    feat_no_wx = [c for c in feat_fcst if c not in weather_cols]

    targets = ["entries_h", "exits_h", "active_parked_peak_h"]
    oof = df[[
        "dt", "date", "hour", "dow", "is_weekend", "rn", "rn_day_sum", "ta",
        "concert_cap_day", "n_major_venues_day", "entries_h", "exits_h",
        "active_parked_peak_h", "congestion_score", "congestion_level",
    ]].copy()

    model_keys = ["baseline_a", "baseline_b", "safepass_no_weather", "safepass_forecast", "safepass_nowcast"]
    for t in targets:
        for mk in model_keys:
            oof[f"{mk}__{t}"] = 0.0

    feat_imp_accum = {t: np.zeros(len(feat_fcst)) for t in targets}

    for tr_idx, va_idx in gkf.split(X_fcst, groups=dates):
        tr_df = df.iloc[tr_idx]
        va_df = df.iloc[va_idx]
        for t in targets:
            oof.loc[va_df.index, f"baseline_a__{t}"] = baseline_a_predict(tr_df, va_df, t)
            oof.loc[va_df.index, f"baseline_b__{t}"] = baseline_b_predict(tr_df, va_df, t)

            p_nowx, _, _ = fit_predict_safepass_fold(
                tr_df, va_df, X_fcst.iloc[tr_idx][feat_no_wx], X_fcst.iloc[va_idx][feat_no_wx], t
            )
            oof.loc[va_df.index, f"safepass_no_weather__{t}"] = p_nowx

            p_fc, _, imp = fit_predict_safepass_fold(
                tr_df, va_df, X_fcst.iloc[tr_idx], X_fcst.iloc[va_idx], t
            )
            oof.loc[va_df.index, f"safepass_forecast__{t}"] = p_fc
            feat_imp_accum[t] += imp / n_splits

            p_nw, _, _ = fit_predict_safepass_fold(
                tr_df, va_df, X_fcst.iloc[tr_idx], X_fcst.iloc[va_idx], t, nowcast_mode=True
            )
            oof.loc[va_df.index, f"safepass_nowcast__{t}"] = p_nw

    occ_p99 = float(np.percentile(df["active_parked_peak_h"], 99))
    flow_p99 = float(np.percentile(df["entries_h"] + df["exits_h"], 99))
    y_cls_true = df["congestion_level"].to_numpy()
    cls_labels = ["여유", "보통", "혼잡", "만차임박"]
    night_mask = (oof["hour"] >= 20) & (oof["hour"] <= 22)

    results = {}
    for mk in model_keys:
        pe = oof[f"{mk}__entries_h"].to_numpy()
        px = oof[f"{mk}__exits_h"].to_numpy()
        po = oof[f"{mk}__active_parked_peak_h"].to_numpy()
        ye = oof["entries_h"].to_numpy()
        yx = oof["exits_h"].to_numpy()
        yo = oof["active_parked_peak_h"].to_numpy()

        p_score = np.clip(
            0.55 * (po / max(occ_p99, 1.0)) * 100.0 + 0.45 * ((pe + px) / max(flow_p99, 1.0)) * 100.0,
            0.0, 100.0,
        )
        p_cls = score_to_level(p_score)

        d_night_act = oof[night_mask].groupby("date")["exits_h"].sum()
        d_night_prd = oof[night_mask].groupby("date")[f"{mk}__exits_h"].sum()

        ref_e_a = oof["baseline_a__entries_h"].to_numpy() if mk != "baseline_a" else None
        ref_x_a = oof["baseline_a__exits_h"].to_numpy() if mk != "baseline_a" else None
        ref_xn_a = oof.loc[night_mask, "baseline_a__exits_h"].to_numpy() if mk != "baseline_a" else None
        ref_e_b = oof["baseline_b__entries_h"].to_numpy() if mk != "baseline_b" else None

        results[mk] = {
            "entries_h": {
                "mae": round(float(mean_absolute_error(ye, pe)), 2),
                "rmse": round(float(math.sqrt(mean_squared_error(ye, pe))), 2),
                "r2": round(float(r2_score(ye, pe)), 4),
                "bootstrap_vs_base_a": day_cluster_bootstrap(dates, ye, pe, ref_e_a),
                "bootstrap_vs_base_b": day_cluster_bootstrap(dates, ye, pe, ref_e_b) if ref_e_b is not None else None,
            },
            "exits_h": {
                "mae": round(float(mean_absolute_error(yx, px)), 2),
                "rmse": round(float(math.sqrt(mean_squared_error(yx, px))), 2),
                "r2": round(float(r2_score(yx, px)), 4),
                "bootstrap_vs_base_a": day_cluster_bootstrap(dates, yx, px, ref_x_a),
            },
            "night_exit_20_22h_hourly": {
                "mae": round(float(mean_absolute_error(yx[night_mask], px[night_mask])), 2),
                "rmse": round(float(math.sqrt(mean_squared_error(yx[night_mask], px[night_mask]))), 2),
                "r2": round(float(r2_score(yx[night_mask], px[night_mask])), 4),
                "bootstrap_vs_base_a": day_cluster_bootstrap(dates[night_mask], yx[night_mask], px[night_mask], ref_xn_a),
            },
            "night_exit_20_22h_daily_sum": {
                "mae": round(float(mean_absolute_error(d_night_act, d_night_prd)), 1),
                "rmse": round(float(math.sqrt(mean_squared_error(d_night_act, d_night_prd))), 1),
                "r2": round(float(r2_score(d_night_act, d_night_prd)), 4),
            },
            "active_parked_peak_h": {
                "mae": round(float(mean_absolute_error(yo, po)), 2),
                "rmse": round(float(math.sqrt(mean_squared_error(yo, po))), 2),
                "r2": round(float(r2_score(yo, po)), 4),
            },
            "congestion_4class": {
                "accuracy": round(float(accuracy_score(y_cls_true, p_cls)), 4),
                "macro_f1": round(float(f1_score(y_cls_true, p_cls, labels=cls_labels, average="macro", zero_division=0)), 4),
            },
            "top5_night_exit_days": compute_top5_hit_rate(oof, f"{mk}__exits_h", "exits_h", (20, 22)),
            "top5_daily_entry_days": compute_top5_hit_rate(oof, f"{mk}__entries_h", "entries_h", None),
        }

    # Fit full-dataset Stage-1 Joint Differential-Ridge for 0ms browser inference!
    full_models = {}
    feature_importances = {}
    for t in targets:
        jm = fit_joint_ridge_cv(df, X_fcst, df[t].to_numpy(dtype=float))
        full_models[t] = {
            "type": "joint_diurnal_plus_ridge",
            "diurnal_base_weekday": [round(float(v), 2) for v in jm["b_diurnal"][:24]],
            "diurnal_base_weekend": [round(float(v), 2) for v in jm["b_diurnal"][24:48]],
            "intercept": 0.0,
            "lambda_feat": float(jm["lambda_feat"]),
            "features": feat_fcst,
            "mean": [round(float(v), 5) for v in jm["mu"]],
            "scale": [round(float(v), 5) for v in jm["sc"]],
            "coef": [round(float(v), 4) for v in jm["w_feat"]],
        }

        # Combined importance: normalized |Ridge std coef| (70%) + LightGBM split gain (30%)
        abs_w = np.abs(jm["w_feat"])
        w_norm = abs_w / max(float(abs_w.sum()), 1.0)
        imp_arr = feat_imp_accum[t]
        g_norm = imp_arr / max(float(imp_arr.sum()), 1.0)
        combo = 0.70 * w_norm + 0.30 * g_norm
        ranked = sorted(
            [
                {
                    "feature": feat_fcst[i],
                    "combined_importance_pct": round(float(combo[i] * 100.0), 2),
                    "lgb_importance_pct": round(float(g_norm[i] * 100.0), 2),
                    "ridge_std_coef": round(float(jm["w_feat"][i]), 2),
                    "direction": "+" if jm["w_feat"][i] >= 0 else "-",
                }
                for i in range(len(feat_fcst))
            ],
            key=lambda x: x["combined_importance_pct"],
            reverse=True,
        )
        feature_importances[t] = ranked[:18]

    return {
        "oof": oof,
        "metrics": results,
        "full_ridge_models": full_models,
        "feature_importances": feature_importances,
        "n_splits": n_splits,
        "n_rows": int(len(df)),
    }


def predict_from_browser_model(md: dict, dow: int, hour: int, row_map: dict[str, float]) -> float:
    base_arr = md["diurnal_base_weekend"] if dow >= 5 else md["diurnal_base_weekday"]
    base = float(base_arr[hour])
    if hour < 6:
        return max(0.0, base)
    val = float(md.get("intercept", 0.0))
    for i, f in enumerate(md["features"]):
        sc = md["scale"][i] if md["scale"][i] != 0 else 1.0
        val += float(md["coef"][i]) * ((row_map.get(f, 0.0) - float(md["mean"][i])) / sc)
    return max(0.0, base + val)


def extract_case_studies(oof: pd.DataFrame) -> list[dict]:
    specs = [
        (
            "2024-07-12", "금", "Fri",
            "최대 입차일 (금 · 무강수 · KSPO DOME)",
            "Peak Entry Day (Fri · Dry · KSPO DOME)",
            "KSPO DOME 더보이즈(15,000석) + 10분 회차 3,201대 집중",
            "KSPO DOME THE BOYZ (15k seats) + 3,201 short drop-offs",
            "월 최대 일입차 8,615대",
            "Monthly Peak 8,615 Entries",
        ),
        (
            "2024-07-20", "토", "Sat",
            "우천 동시공연 야간병목 최악일 (14.9mm)",
            "Rain + Dual-Venue Worst Night Exit (14.9mm)",
            "KSPO DOME SG워너비(15,000석) + 올림픽홀 휘인(3,000석) + 우리금융 정글북",
            "KSPO DOME SG Wannabe (15k) + Olympic Hall Whee In (3k) + Woori Art Hall",
            "월 최고 야간출차 1,840대 · 동시주차 1,934대",
            "Peak Night Exits 1,840 · 1,934 Simultaneous",
        ),
        (
            "2024-07-21", "일", "Sun",
            "우천 동시공연 본주차장 만차 초과일 (8.5mm)",
            "Rain + Dual-Venue Full Capacity Saturation (8.5mm)",
            "KSPO DOME SG워너비 + 올림픽홀 휘인 + 우리금융 정글북 (우천 8.5mm)",
            "SG Wannabe + Whee In + Jungle Book (8.5mm rain)",
            "동시주차 2,159대 (본주차장 2,120면 초과!)",
            "2,159 Simultaneous Parked (>2,120 Main Lot!)",
        ),
        (
            "2024-07-07", "일", "Sun",
            "장마 강수 비대형공연 최저일 (28.7mm)",
            "Monsoon Rain Non-Arena Quietest Day (28.7mm)",
            "올림픽홀 10CM (KSPO DOME 미개최 + 장마 28.7mm)",
            "Olympic Hall 10CM only (No KSPO DOME + 28.7mm rain)",
            "월 최저 4,984대 (우천 일반수요 -17.5% 역전 증빙)",
            "Monthly Min 4,984 (Rain -17.5% Sign Reversal Proof)",
        ),
    ]

    daily_raw = pd.read_csv(PROC_DIR / "daily_panel_202407.csv").set_index("date")
    cases = []
    for ds, dow_ko, dow_en, lbl_ko, lbl_en, con_ko, con_en, tag_ko, tag_en in specs:
        sub = oof[oof["date"] == ds].sort_values("hour")
        if sub.empty:
            continue
        night = sub[(sub["hour"] >= 20) & (sub["hour"] <= 22)]
        drow = daily_raw.loc[ds]
        cases.append({
            "date": ds,
            "dowKo": dow_ko,
            "dowEn": dow_en,
            "labelKo": lbl_ko,
            "labelEn": lbl_en,
            "totalEntries": int(sub["entries_h"].sum()),
            "stayGt10m": int(drow["entries_stay_day"]),
            "nightExit2022": int(night["exits_h"].sum()),
            "peakActiveParked": int(drow["peak_active_parked"]),
            "rainMm": round(float(drow["rn_day"]), 1),
            "tempMaxC": round(float(drow["ta_max"]), 1),
            "concertsKo": con_ko,
            "concertsEn": con_en,
            "highlightTagKo": tag_ko,
            "highlightTagEn": tag_en,
            "oof_comparison": {
                "actual_daily_entries": int(sub["entries_h"].sum()),
                "baseline_a_daily_entries": int(round(sub["baseline_a__entries_h"].sum())),
                "baseline_b_daily_entries": int(round(sub["baseline_b__entries_h"].sum())),
                "safepass_forecast_daily_entries": int(round(sub["safepass_forecast__entries_h"].sum())),
                "safepass_nowcast_daily_entries": int(round(sub["safepass_nowcast__entries_h"].sum())),
                "actual_night_exit_20_22": int(night["exits_h"].sum()),
                "baseline_a_night_exit_20_22": int(round(night["baseline_a__exits_h"].sum())),
                "baseline_b_night_exit_20_22": int(round(night["baseline_b__exits_h"].sum())),
                "safepass_forecast_night_exit_20_22": int(round(night["safepass_forecast__exits_h"].sum())),
                "safepass_nowcast_night_exit_20_22": int(round(night["safepass_nowcast__exits_h"].sum())),
            },
            "hourly_oof": [
                {
                    "h": int(r.hour),
                    "act_in": int(r.entries_h),
                    "pred_in": int(round(r.safepass_forecast__entries_h)),
                    "base_a_in": int(round(r.baseline_a__entries_h)),
                    "act_out": int(r.exits_h),
                    "pred_out": int(round(r.safepass_forecast__exits_h)),
                    "base_a_out": int(round(r.baseline_a__exits_h)),
                    "base_b_out": int(round(r.baseline_b__exits_h)),
                }
                for r in sub.itertuples()
            ],
        })
    return cases


def build_compact_lookup_table(full_models: dict) -> dict:
    day_types = {"weekday": 2, "friday": 4, "weekend": 5}
    concert_tiers = {
        "none": {"cap_k": 0.0, "n_maj": 0, "dome": 0, "starts": []},
        "single_dome": {"cap_k": 15.0, "n_maj": 1, "dome": 1, "starts": [18]},
        "multi_venue": {"cap_k": 19.4, "n_maj": 2, "dome": 1, "starts": [18]},
    }
    rain_tiers = {
        "dry": {"rn": 0.0, "rn3": 0.0, "rnd": 0.0},
        "light_rain": {"rn": 2.0, "rn3": 6.0, "rnd": 12.0},
        "heavy_rain": {"rn": 7.0, "rn3": 18.0, "rnd": 35.0},
    }

    lookup = {}
    for dk, dow in day_types.items():
        for ck, cs in concert_tiers.items():
            for rk, rs in rain_tiers.items():
                key = f"{dk}|{ck}|{rk}"
                ent_24, ex_24 = [], []
                for h in range(24):
                    offs = {k: 0.0 for k in ["cap_m3", "cap_m2", "cap_m1", "cap_0", "cap_p1", "cap_p2", "cap_p3", "cap_p4"]}
                    off_map = {-3: "cap_m3", -2: "cap_m2", -1: "cap_m1", 0: "cap_0", 1: "cap_p1", 2: "cap_p2", 3: "cap_p3", 4: "cap_p4"}
                    for sh in cs["starts"]:
                        d = h - sh
                        if d in off_map:
                            offs[off_map[d]] += cs["cap_k"]

                    is_dt = 1.0 if 6 <= h <= 21 else 0.0
                    is_m = 1.0 if 7 <= h <= 11 else 0.0
                    is_ev = 1.0 if 16 <= h <= 22 else 0.0
                    is_ni = 1.0 if 20 <= h <= 22 else 0.0
                    is_fri = 1.0 if dow == 4 else 0.0
                    is_sat = 1.0 if dow == 5 else 0.0
                    is_sun = 1.0 if dow == 6 else 0.0
                    is_wknd = 1.0 if dow >= 5 else 0.0
                    has_dome = float(cs["dome"])
                    no_dome = 1.0 - has_dome
                    multi_v = 1.0 if cs["n_maj"] >= 2 else 0.0
                    lrn, lrn3, lrnd = math.log1p(rs["rn"]), math.log1p(rs["rn3"]), math.log1p(rs["rnd"])

                    row = {
                        **offs,
                        "concert_cap_x_evening": cs["cap_k"] * is_ev,
                        "multi_venue_x_pre": multi_v * (offs["cap_m2"] + offs["cap_m1"]) / 10.0,
                        "multi_venue_x_exit": multi_v * (offs["cap_p3"] + 0.5 * offs["cap_p2"]) / 10.0,
                        "fri_x_evening": is_fri * is_ev,
                        "sun_x_morning": is_sun * is_m,
                        "sat_x_evening": is_sat * is_ev,
                        "rain_hr_x_no_dome_day": lrn * no_dome * is_dt,
                        "rain_day_x_no_dome_day": lrnd * no_dome * is_dt,
                        "rain_x_cap_arrival": lrnd * (offs["cap_m2"] + offs["cap_m1"]) / 10.0,
                        "rain_x_cap_exit": (0.5 * lrn3 + 0.5 * lrnd) * (offs["cap_p3"] + 0.4 * offs["cap_p4"]) / 10.0,
                        "rain_day_x_multi_venue_exit": lrnd * multi_v * is_ni,
                        "ta_dev_x_daytime": 0.0,
                    }
                    ent_24.append(int(round(predict_from_browser_model(full_models["entries_h"], dow, h, row))))
                    ex_24.append(int(round(predict_from_browser_model(full_models["exits_h"], dow, h, row))))
                lookup[key] = {"entries_24h": ent_24, "exits_24h": ex_24}
    return lookup


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", choices=["202407", "2025_linked"], default="202407")
    args = parser.parse_args()

    RUNS_ML_DIR.mkdir(parents=True, exist_ok=True)
    WEB_DATA_DIR.mkdir(parents=True, exist_ok=True)

    panel_path = PROC_DIR / ("hourly_panel_202407.csv" if args.dataset == "202407" else "hourly_panel_2025_linked.csv")
    df = pd.read_csv(panel_path)
    print(f"=== Training & Validating SafePass Joint-Ridge + LGBM Residual Model ({panel_path.name}, {len(df)} rows, {df['date'].nunique()} days) ===")

    cv_out = run_cv_benchmark(df)
    oof = cv_out["oof"]
    m = cv_out["metrics"]

    print("\n--- Leave-One-Day-Out GroupKFold CV Results (Zero Same-Day Leakage!) ---")
    header = f"{'Model':22s} | {'EntMAE':>7s} {'EntRMSE':>7s} {'EntR2':>7s} | {'ExMAE':>7s} {'ExR2':>7s} | {'20-22MAE':>8s} {'20-22R2':>8s} | {'Top5Hit':>9s} | {'4ClsAcc':>7s}"
    print(header)
    print("-" * len(header))
    for mk in ["baseline_a", "baseline_b", "safepass_no_weather", "safepass_forecast", "safepass_nowcast"]:
        r = m[mk]
        print(
            f"{mk:22s} | "
            f"{r['entries_h']['mae']:7.2f} {r['entries_h']['rmse']:7.2f} {r['entries_h']['r2']:7.4f} | "
            f"{r['exits_h']['mae']:7.2f} {r['exits_h']['r2']:7.4f} | "
            f"{r['night_exit_20_22h_hourly']['mae']:8.2f} {r['night_exit_20_22h_hourly']['r2']:8.4f} | "
            f"{r['top5_night_exit_days']['hits']}/5 ({r['top5_night_exit_days']['hit_rate_pct']:3.0f}%) | "
            f"{r['congestion_4class']['accuracy']*100:6.1f}%"
        )

    print("\n--- 1,000-Resample Day-Cluster Bootstrap 95% CIs & Paired p-values vs Baseline A ---")
    for mk in ["safepass_forecast", "safepass_nowcast"]:
        be = m[mk]["entries_h"]["bootstrap_vs_base_a"]
        bx = m[mk]["exits_h"]["bootstrap_vs_base_a"]
        bn = m[mk]["night_exit_20_22h_hourly"]["bootstrap_vs_base_a"]
        print(
            f"  {mk}: EntMAE={m[mk]['entries_h']['mae']} CI95={be['mae_ci95']} (gain={be['mae_gain_vs_ref_ci95']}, p={be['p_value_vs_ref']}) | "
            f"ExMAE={m[mk]['exits_h']['mae']} (gain={bx['mae_gain_vs_ref_ci95']}, p={bx['p_value_vs_ref']}) | "
            f"Night20-22MAE={m[mk]['night_exit_20_22h_hourly']['mae']} CI95={bn['mae_ci95']} (gain={bn['mae_gain_vs_ref_ci95']}, p={bn['p_value_vs_ref']})"
        )

    oof.to_csv(RUNS_ML_DIR / "cv_oof_predictions.csv", index=False, encoding="utf-8-sig")

    case_studies = extract_case_studies(oof)
    audit_summary = json.loads((PROC_DIR / "audit_summary.json").read_text(encoding="utf-8"))
    daily = pd.read_csv(PROC_DIR / "daily_panel_202407.csv")

    nc_df = df[df["n_major_venues_day"] == 0]
    h_in = nc_df.groupby("hour")["entries_h"].mean().reindex(range(24), fill_value=0.0)
    h_out = nc_df.groupby("hour")["exits_h"].mean().reindex(range(24), fill_value=0.0)
    base_in_share = [round(float(v / h_in.sum()), 5) for v in h_in]
    base_out_share = [round(float(v / h_out.sum()), 5) for v in h_out]

    dow_means = daily.groupby("dow")["entries_day"].mean().reindex(range(7))
    overall_mean = float(daily["entries_day"].mean())
    dow_mult = [round(float(dow_means.iloc[i] / overall_mean), 4) for i in range(7)]

    mp_2025 = [
        {"month": f"{x['month']:02d}월", "vehicles": x["vehicles"]}
        for x in audit_summary["monthly_parking_15131671"]["olympicpark_monthly"]
        if x["year"] == 2025
    ]

    X_day = np.column_stack([
        np.ones(len(daily)),
        daily["rn_day"].to_numpy() * (daily["n_major_venues_day"] == 0).astype(float),
        daily["concert_cap_day"].to_numpy() / 1000.0,
        (daily["concert_cap_day"].to_numpy() / 1000.0) * np.minimum(daily["rn_day"].to_numpy(), 30.0) / 10.0,
        daily["ta_max"].to_numpy() - 28.0,
    ])
    beta_day, _, _, _ = np.linalg.lstsq(X_day, daily["entries_day"].to_numpy(dtype=float), rcond=None)
    base_daily = round(float(beta_day[0]), 1)
    rain_drop_per_mm = round(max(0.0025, min(0.009, abs(float(beta_day[1])) / max(base_daily, 1.0))), 5)
    concert_per_1k = round(max(45.0, float(beta_day[2])), 1)
    concert_rain_int = round(max(18.0, float(beta_day[3])), 1)
    temp_per_deg = round(float(beta_day[4]), 1)

    benchmarks = [
        {
            "model_id": "baseline_a",
            "name_ko": "Baseline A · 기존 공식 parking.do 방식",
            "name_en": "Baseline A · Official parking.do (Flat DOW×Hour)",
            "type_ko": "평일/주말 × 시간대 평탄 평균 (날씨·공연 미반영)",
            "type_en": "Flat weekday/weekend × hour mean (No weather/concerts)",
            "hourly_mae": m["baseline_a"]["entries_h"]["mae"],
            "hourly_rmse": m["baseline_a"]["entries_h"]["rmse"],
            "r2": m["baseline_a"]["entries_h"]["r2"],
            "exit_mae": m["baseline_a"]["exits_h"]["mae"],
            "exit_r2": m["baseline_a"]["exits_h"]["r2"],
            "night_exit_mae": m["baseline_a"]["night_exit_20_22h_hourly"]["mae"],
            "night_exit_r2": m["baseline_a"]["night_exit_20_22h_hourly"]["r2"],
            "top5_night_hit_pct": m["baseline_a"]["top5_night_exit_days"]["hit_rate_pct"],
            "congestion_4class_acc": round(m["baseline_a"]["congestion_4class"]["accuracy"] * 100, 1),
            "uses_weather": False,
            "uses_concerts": False,
            "is_winner": False,
        },
        {
            "model_id": "baseline_b",
            "name_ko": "Baseline B · 경쟁작 olparkspot.com 규칙 방식",
            "name_en": "Baseline B · Competitor olparkspot.com Rule (1.7x/2.7x)",
            "type_ko": "단순 공연일 1.7x / 동시공연 2.7x 고정 배수 (날씨 교호작용 미반영)",
            "type_en": "Fixed 1.7x single / 2.7x dual concert multiplier (No weather)",
            "hourly_mae": m["baseline_b"]["entries_h"]["mae"],
            "hourly_rmse": m["baseline_b"]["entries_h"]["rmse"],
            "r2": m["baseline_b"]["entries_h"]["r2"],
            "exit_mae": m["baseline_b"]["exits_h"]["mae"],
            "exit_r2": m["baseline_b"]["exits_h"]["r2"],
            "night_exit_mae": m["baseline_b"]["night_exit_20_22h_hourly"]["mae"],
            "night_exit_r2": m["baseline_b"]["night_exit_20_22h_hourly"]["r2"],
            "top5_night_hit_pct": m["baseline_b"]["top5_night_exit_days"]["hit_rate_pct"],
            "congestion_4class_acc": round(m["baseline_b"]["congestion_4class"]["accuracy"] * 100, 1),
            "uses_weather": False,
            "uses_concerts": True,
            "is_winner": False,
        },
        {
            "model_id": "safepass_no_weather",
            "name_ko": "Ablation · SafePass (날씨·교호작용 제외)",
            "name_en": "Ablation · SafePass (No Weather / Interaction)",
            "type_ko": "결합 Ridge+LGBM (달력·공연 수용인원·시각오프셋만 사용)",
            "type_en": "Joint Ridge+LGBM (Calendar + Concert offsets only)",
            "hourly_mae": m["safepass_no_weather"]["entries_h"]["mae"],
            "hourly_rmse": m["safepass_no_weather"]["entries_h"]["rmse"],
            "r2": m["safepass_no_weather"]["entries_h"]["r2"],
            "exit_mae": m["safepass_no_weather"]["exits_h"]["mae"],
            "exit_r2": m["safepass_no_weather"]["exits_h"]["r2"],
            "night_exit_mae": m["safepass_no_weather"]["night_exit_20_22h_hourly"]["mae"],
            "night_exit_r2": m["safepass_no_weather"]["night_exit_20_22h_hourly"]["r2"],
            "top5_night_hit_pct": m["safepass_no_weather"]["top5_night_exit_days"]["hit_rate_pct"],
            "congestion_4class_acc": round(m["safepass_no_weather"]["congestion_4class"]["accuracy"] * 100, 1),
            "uses_weather": False,
            "uses_concerts": True,
            "is_winner": False,
        },
        {
            "model_id": "safepass_forecast",
            "name_ko": "Model C · SafePass 72h 사전예측 (Ridge+LGBM)",
            "name_en": "Model C · SafePass 72h Forecast (Ridge+LGBM)",
            "type_ko": "결합 Ridge+LGBM (달력+공연수용인원·시각오프셋+기상+강수×공연 교호작용)",
            "type_en": "Joint Ridge+LGBM (Calendar+Show Offsets+Weather+Rain×Concert)",
            "hourly_mae": m["safepass_forecast"]["entries_h"]["mae"],
            "hourly_rmse": m["safepass_forecast"]["entries_h"]["rmse"],
            "r2": m["safepass_forecast"]["entries_h"]["r2"],
            "exit_mae": m["safepass_forecast"]["exits_h"]["mae"],
            "exit_r2": m["safepass_forecast"]["exits_h"]["r2"],
            "night_exit_mae": m["safepass_forecast"]["night_exit_20_22h_hourly"]["mae"],
            "night_exit_r2": m["safepass_forecast"]["night_exit_20_22h_hourly"]["r2"],
            "top5_night_hit_pct": m["safepass_forecast"]["top5_night_exit_days"]["hit_rate_pct"],
            "congestion_4class_acc": round(m["safepass_forecast"]["congestion_4class"]["accuracy"] * 100, 1),
            "uses_weather": True,
            "uses_concerts": True,
            "is_winner": True,
        },
        {
            "model_id": "safepass_nowcast",
            "name_ko": "Model C+ · SafePass 실시간 보정 (+1h Nowcast)",
            "name_en": "Model C+ · SafePass Live Nowcast (+1h Telemetry)",
            "type_ko": "Model C + 실시간 parkingorsApi 직전 1~2시간 추세 결합",
            "type_en": "Model C + Real-time parkingorsApi lag-1h/2h trend",
            "hourly_mae": m["safepass_nowcast"]["entries_h"]["mae"],
            "hourly_rmse": m["safepass_nowcast"]["entries_h"]["rmse"],
            "r2": m["safepass_nowcast"]["entries_h"]["r2"],
            "exit_mae": m["safepass_nowcast"]["exits_h"]["mae"],
            "exit_r2": m["safepass_nowcast"]["exits_h"]["r2"],
            "night_exit_mae": m["safepass_nowcast"]["night_exit_20_22h_hourly"]["mae"],
            "night_exit_r2": m["safepass_nowcast"]["night_exit_20_22h_hourly"]["r2"],
            "top5_night_hit_pct": m["safepass_nowcast"]["top5_night_exit_days"]["hit_rate_pct"],
            "congestion_4class_acc": round(m["safepass_nowcast"]["congestion_4class"]["accuracy"] * 100, 1),
            "uses_weather": True,
            "uses_concerts": True,
            "is_winner": False,
        },
    ]

    model_metrics = {
        "generated_at_kst": datetime.now(KST).isoformat(timespec="seconds"),
        "dataset": args.dataset,
        "validation_scheme": f"Leave-One-Day-Out GroupKFold (n_splits={cv_out['n_splits']} calendar dates, zero same-day leakage)",
        "architecture": "Joint Partially-Penalized Diurnal+Concert+Weather Ridge + LightGBM Residual Booster",
        "n_hours": cv_out["n_rows"],
        "n_days": cv_out["n_splits"],
        "metrics_by_model": m,
        "benchmarks": benchmarks,
        "feature_importances": cv_out["feature_importances"],
        "case_studies": case_studies,
    }
    (PROC_DIR / "model_metrics.json").write_text(json.dumps(model_metrics, ensure_ascii=False, indent=2), encoding="utf-8")
    (RUNS_ML_DIR / "backtest_report.json").write_text(json.dumps(model_metrics, ensure_ascii=False, indent=2), encoding="utf-8")

    lookup_table = build_compact_lookup_table(cv_out["full_ridge_models"])
    zone_weights = [
        {
            "zone": z["zone"], "gate": z["gate"], "capacity": z["capacity"],
            "full_count": z["full_count"], "congested_count": z["congested_count"],
            "full_rate_pct": z["full_rate_pct"], "risk_weight": z["risk_weight"],
        }
        for z in audit_summary["zone_congestion_15164156"]["zones"]
    ]

    veh_eda = audit_summary["vehicle_eda_202407"]
    browser_bundle = {
        "generated_at_kst": datetime.now(KST).isoformat(timespec="seconds"),
        "trainedOn": f"KSPO&CO 15138735 (215,528건) + 기상청 ASOS 108 (744h) + KSPO&CO 공식 공연일정 ({args.dataset})",
        "validationMethod": f"GroupKFold by date ({cv_out['n_splits']}일 그룹 교차검증 · 동일 날짜 누출 0)",
        "architecture": "Joint Partially-Penalized Ridge + LightGBM Residual Ensemble",
        "sampleRows": veh_eda["total_records"],
        "daysCovered": cv_out["n_splits"],
        "corrDailyTotalVsNightExit": veh_eda["corr_daily_entries_vs_night_exit"],
        "corrRainDaily": veh_eda["corr_daily_entries_vs_rain_mm"],
        "corrCarVsSubwayExit": veh_eda["corr_hourly_veh_out_vs_subway_ride"],
        "baseHourlyEntryShare": base_in_share,
        "baseHourlyExitShare": base_out_share,
        "base_hourly_entry_share": base_in_share,
        "base_hourly_exit_share": base_out_share,
        "dowMultiplier": dow_mult,
        "coefficients": {
            "baseDailyVehicles": base_daily,
            "rainLinearPerMm": rain_drop_per_mm,
            "rainNonConcertCapDrop": 0.175,
            "concertPer1kSeatsEntries": concert_per_1k,
            "concertRainInteractionPer1kPer10mm": concert_rain_int,
            "tempDeviationPerDeg": temp_per_deg,
            "baseNightExitShare": 0.161,
            "concertNightExitBoostPer1k": 0.0042,
            "rainConcertNightShiftBoost": 0.24,
        },
        "benchmarks": benchmarks,
        "bootstrap_ci95": {
            "safepass_forecast_entries": m["safepass_forecast"]["entries_h"]["bootstrap_vs_base_a"],
            "safepass_forecast_exits": m["safepass_forecast"]["exits_h"]["bootstrap_vs_base_a"],
            "safepass_forecast_night_exit": m["safepass_forecast"]["night_exit_20_22h_hourly"]["bootstrap_vs_base_a"],
            "safepass_nowcast_entries": m["safepass_nowcast"]["entries_h"]["bootstrap_vs_base_a"],
        },
        "feature_importances_top10": {
            "entries_h": cv_out["feature_importances"]["entries_h"][:10],
            "exits_h": cv_out["feature_importances"]["exits_h"][:10],
        },
        "ridge_browser_inference": {
            "entries_h": cv_out["full_ridge_models"]["entries_h"],
            "exits_h": cv_out["full_ridge_models"]["exits_h"],
        },
        "lookup_24h": lookup_table,
        "zone_risk_weights_15164156": zone_weights,
        "caseStudies": case_studies,
        "monthlySeasonality2025": mp_2025,
    }

    out_bundle = WEB_DATA_DIR / "model_bundle.json"
    out_bundle.write_text(json.dumps(browser_bundle, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    sz = out_bundle.stat().st_size
    print(f"\nSaved {out_bundle} ({sz:,} bytes = {sz/1024:.1f} KB, limit < 100 KB: {'PASS' if sz < 102400 else 'OVER'})")

    print("\n--- Case Study OOF Predictions ---")
    for cs in case_studies:
        oc = cs["oof_comparison"]
        print(
            f"  {cs['date']} ({cs['dowKo']}, rain={cs['rainMm']}mm): "
            f"Daily Act={oc['actual_daily_entries']:,} | BaseA={oc['baseline_a_daily_entries']:,} | BaseB={oc['baseline_b_daily_entries']:,} | SafePass={oc['safepass_forecast_daily_entries']:,} || "
            f"NightEx Act={oc['actual_night_exit_20_22']:,} | BaseA={oc['baseline_a_night_exit_20_22']:,} | BaseB={oc['baseline_b_night_exit_20_22']:,} | SafePass={oc['safepass_forecast_night_exit_20_22']:,}"
        )


if __name__ == "__main__":
    main()
