"""Daily job: derive the alert feed from the static risk + hotspot files. Static JSON out, no server.
Rules (also written into the output under 'rules'):
  - risk alert per study area whose risk file passes the manifest validation, when at least one cell is
    at high (p >= HIGH) or medium (p >= MEDIUM) satellite-detection probability; the alert carries the
    peak probability and the cell counts, and a risk file that is not for today's UTC day is labelled
    'stale', never shown as today's.
  - detection alert per study area with >= 1 nominal/high-confidence NASA VIIRS hotspot from the last
    WINDOW_H hours inside the area bbox (from the static hotspot files written by hotspots.py).
Alerts are experimental model estimates or satellite thermal anomalies, never official warnings and
never confirmed fires. Nothing is invented: counts and peaks come from the files as they are.
Output: public/data/alerts.json
"""
import datetime as dt, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import region as RG, manifest as MF

HIGH, MEDIUM = 0.65, 0.35
WINDOW_H = 24
HOTSPOT_FILES = ('hotspots-southern-africa.json', 'hotspots-northern-central-africa.json')


def _load(path):
    try: return json.load(open(path))
    except Exception: return None


def _risk_alerts(cfg, today, now):
    alerts = []
    for rid in cfg:
        r = RG.get_region(rid)
        if not MF.validate(rid).get('ok'):
            continue  # the site shows no estimate for this region, so no alert from it either
        risk = _load(r['output_path']) or {}
        cells, date = risk.get('cells') or [], risk.get('date')
        probs = [float(c['probability']) for c in cells if isinstance(c.get('probability'), (int, float))]
        if not date or not probs:
            continue
        hi = [p for p in probs if p >= HIGH]
        med = [p for p in probs if MEDIUM <= p < HIGH]
        if not hi and not med:
            continue
        peak = max(probs)
        stale = date != today
        flagged = hi or med
        share = round(100 * len(flagged) / len(probs), 1)
        msg = (f"{len(flagged)} of {len(probs)} cells at {'high' if hi else 'medium'} satellite-detection risk "
               f"(about {share}% of the study area), peak {round(peak * 100)}%. Experimental model estimate for UTC day {date}"
               + (" - not today's risk file" if stale else "")
               + ". A detection probability, not a confirmed fire.")
        alerts.append({'id': f'risk-{rid}-{date}', 'type': 'risk', 'severity': 'high' if hi else 'elevated',
                       'title': 'HIGH SATELLITE-DETECTION RISK' if hi else 'ELEVATED SATELLITE-DETECTION RISK',
                       'message': msg, 'region_id': rid, 'region': risk.get('region') or r['label'],
                       'country': risk.get('country'), 'country_code': risk.get('country_code'),
                       'probability': round(peak, 3), 'date': date,
                       'issued_at': risk.get('generated_utc') or now.isoformat(timespec='seconds'), 'stale': stale})
    return alerts


def _fresh_hotspots(now):
    out, seen = [], set()
    for f in HOTSPOT_FILES:
        d = _load(os.path.join(RG.ROOT, 'public', 'data', f))
        if not (isinstance(d, dict) and d.get('status') == 'ok'):
            continue
        for h in d.get('hotspots') or []:
            try: t = dt.datetime.fromisoformat(f"{h['acqDate']}T{h.get('acqTime', '00:00')}:00+00:00")
            except Exception: continue
            if not (-3 * 3600 <= (now - t).total_seconds() <= WINDOW_H * 3600):
                continue
            k = (h.get('lat'), h.get('lon'), h.get('acqDate'), h.get('acqTime'), h.get('source'))
            if k in seen:
                continue
            seen.add(k); out.append(h)
    return out


def _detection_alerts(cfg, now):
    fresh = _fresh_hotspots(now)
    alerts = []
    for rid, c in cfg.items():
        W, S, E, N = c['bbox_WSEN']
        inside = [h for h in fresh if isinstance(h.get('lon'), (int, float)) and isinstance(h.get('lat'), (int, float))
                  and W <= h['lon'] < E and S <= h['lat'] < N]
        if not inside:
            continue
        frps = [h['frp'] for h in inside if isinstance(h.get('frp'), (int, float))]
        n = len(inside)
        msg = (f"{n} NASA VIIRS hotspot{'s' if n != 1 else ''} in the last {WINDOW_H} h inside the study area"
               + (f", strongest {round(max(frps))} MW FRP" if frps else "")
               + ". Thermal anomalies - can be wildfire, agricultural burning, gas flares or hot ground; not a confirmed fire.")
        alerts.append({'id': f'det-{rid}-{now.date().isoformat()}', 'type': 'detection', 'severity': 'info',
                       'title': 'SATELLITE DETECTIONS', 'message': msg, 'region_id': rid,
                       'region': c.get('name') or c['label'], 'country': c.get('country'), 'country_code': c.get('country_code'),
                       'probability': None, 'date': now.date().isoformat(),
                       'issued_at': now.isoformat(timespec='seconds'), 'stale': False})
    return alerts


def build(now=None):
    now = now or dt.datetime.now(dt.timezone.utc)
    cfg = RG.load_config()
    alerts = _risk_alerts(cfg, now.date().isoformat(), now) + _detection_alerts(cfg, now)
    doc = {'status': 'ok', 'generated_utc': now.isoformat(timespec='seconds'),
           'coverage_note': 'Alerts cover the tested study areas only (rectangles, not admin boundaries). Updated daily by the backend job. Not an official warning system.',
           'rules': {'risk_high': f'at least one cell with probability >= {HIGH} in the area risk file',
                     'risk_elevated': f'at least one cell with probability >= {MEDIUM}',
                     'detection': f'at least one nominal/high VIIRS hotspot in the last {WINDOW_H} h inside the area'},
           'alerts': alerts}
    out = os.path.join(RG.ROOT, 'public', 'data', 'alerts.json')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    json.dump(doc, open(out, 'w'), separators=(',', ':'))
    print('wrote', out, len(alerts), 'alerts')


if __name__ == '__main__':
    build()
