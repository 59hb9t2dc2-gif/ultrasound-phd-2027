#!/usr/bin/env python3
"""Rebuild data.js from the checked JSON database without resetting curated data."""
import json
from datetime import datetime
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/'data'
def load(name, default):
    p=DATA/name
    return json.loads(p.read_text(encoding='utf-8')) if p.exists() else default
files={'schools':'schools.json','advisors':'advisors.json','admissions':'admissions.json','sources':'sources.json','sourceStatus':'source_status.json','timeline':'application_timeline.json','profile':'profile.json','materials':'materials.json'}
bundle={'meta':{'updated_at':datetime.now().astimezone().isoformat(timespec='seconds'),'data_version':'2.2.0','target_year':2027,'notice':'学博口径纠错版：明确纳入100207影像医学与核医学超声方向学博，并增加招生专业代码筛选。'}}
for key,name in files.items():
    bundle[key]=load(name, {} if key in ('profile','sourceStatus') else [])
(ROOT/'data.js').write_text('window.APP_DATA = '+json.dumps(bundle,ensure_ascii=False,indent=2)+';\n',encoding='utf-8')
print(f"Rebuilt bundle: {len(bundle['advisors'])} advisors, {len(bundle['schools'])} schools")
