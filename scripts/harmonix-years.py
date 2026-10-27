"""
Looks up first-release years for Harmonix Set tracks on MusicBrainz: by track ID, else by
title and artist. Resumable: rerun to continue, and failed lookups are retried.

  python3 scripts/harmonix-years.py <harmonixset>/dataset/metadata.csv harmonix-years.json

MusicBrainz allows one request a second, so all 912 songs take 1-3 hours. The earliest
release date sometimes belongs to a reissue; corpus-stats.ts drops years after 2019.
"""
import csv, json, os, sys, time, urllib.request, urllib.parse
meta, out = sys.argv[1], sys.argv[2]
done = {k: v for k, v in (json.load(open(out)).items() if os.path.exists(out) else []) if v is not None}
UA = "compose-balance-corpus-stats/0.1 (research script)"

def search(query):
    url = "https://musicbrainz.org/ws/2/recording?fmt=json&limit=25&query=" + urllib.parse.quote(query)
    for attempt in range(6):
        try:
            data = json.load(urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=20))
            time.sleep(1.1)
            return data.get("recordings", [])
        except Exception:
            time.sleep(4 * (attempt + 1))
    raise RuntimeError("busy")

def earliest(recs, min_score=0):
    years = [int(r["first-release-date"][:4]) for r in recs
             if r.get("score", 100) >= min_score and r.get("first-release-date", "")[:4].isdigit()]
    return min(years) if years else None

def esc(s):
    return '"' + s.replace('"', '') + '"'

rows = list(csv.DictReader(open(meta)))
failed = 0
for i, r in enumerate(rows):
    f = r["File"]
    if f in done: continue
    try:
        year = earliest(search(f"tid:{r['MusicBrainz Id']}"))
        if year is None:
            year = earliest(search(f"recording:{esc(r['Title'])} AND artist:{esc(r['Artist'])}"), min_score=90)
    except RuntimeError:
        failed += 1
        continue
    done[f] = year
    if i % 25 == 0:
        json.dump(done, open(out, "w")); print(i, f, year, flush=True)
json.dump(done, open(out, "w")); print("done", len(done), "failed", failed, "none", sum(v is None for v in done.values()))
