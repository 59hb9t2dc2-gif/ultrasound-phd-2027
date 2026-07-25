#!/usr/bin/env python3
"""Scheduled watcher for official Chinese doctoral-admission pages.

It extracts links whose titles match doctoral admission keywords, merges them into
admissions.json, records source health, and rebuilds data.js for offline use.
The script never invents quotas or policy details; it only stores titles, URLs,
and dates visible on official pages.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urljoin, urlparse, urldefrag
from zoneinfo import ZoneInfo

import requests
from bs4 import BeautifulSoup
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
TZ = ZoneInfo("Asia/Shanghai")
KEYWORDS = (
    "博士", "招生简章", "招生章程", "招生目录", "专业目录", "申请-考核", "申请考核",
    "招生导师", "导师资格", "招生计划", "补充招生", "补充批次", "报考通知", "综合考核"
)
EXCLUDE = ("硕士", "本科", "留学生" , "港澳台")
DATE_PATTERNS = [
    re.compile(r"(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})日?"),
    re.compile(r"(20\d{2})[-/.](\d{1,2})"),
]
YEAR_RE = re.compile(r"20(2[5-9]|3\d)")


@dataclass
class CrawlResult:
    notices: list[dict[str, Any]]
    status: str
    message: str
    http_status: int | None = None


def load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def save_json(path: Path, value: Any) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")


def session() -> requests.Session:
    s = requests.Session()
    retries = Retry(total=2, connect=2, read=2, backoff_factor=0.8, status_forcelist=(429, 500, 502, 503, 504))
    s.mount("https://", HTTPAdapter(max_retries=retries))
    s.mount("http://", HTTPAdapter(max_retries=retries))
    s.headers.update({
        "User-Agent": "UltrasoundPhDAdmissionsWatcher/1.0 (+academic personal use; respectful daily crawl)",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.5",
    })
    return s


def normalize_url(base: str, href: str) -> str:
    url = urljoin(base, href.strip())
    url, _ = urldefrag(url)
    return url


def permitted(url: str, source: dict[str, Any]) -> bool:
    host = (urlparse(url).hostname or "").lower()
    official = source.get("official_domain", "").lower()
    return bool(host and (host == official or host.endswith("." + official)))


def classify(title: str) -> str:
    mapping = [
        (("专业目录", "招生目录"), "招生目录"),
        (("导师", "任职资格"), "导师/资格"),
        (("补充", "第二批", "第三批"), "补充招生"),
        (("简章", "章程"), "招生简章"),
        (("考核", "复试"), "考核通知"),
        (("计划", "名额"), "招生计划"),
    ]
    for needles, label in mapping:
        if any(n in title for n in needles):
            return label
    return "招生动态"


def parse_date(text: str) -> str:
    normalized = re.sub(r"\s+", " ", text)
    for pattern in DATE_PATTERNS:
        match = pattern.search(normalized)
        if not match:
            continue
        parts = match.groups()
        try:
            year = int(parts[0]); month = int(parts[1]); day = int(parts[2]) if len(parts) > 2 else 1
            return f"{year:04d}-{month:02d}-{day:02d}"
        except (TypeError, ValueError):
            continue
    return ""


def infer_year(title: str, publish_date: str) -> int:
    m = YEAR_RE.search(title)
    if m:
        return int(m.group(0))
    if publish_date:
        return int(publish_date[:4])
    return datetime.now(TZ).year


def crawl_source(s: requests.Session, source: dict[str, Any], timeout: int = 12) -> CrawlResult:
    url = source["url"]
    try:
        resp = s.get(url, timeout=timeout)
    except requests.RequestException as exc:
        return CrawlResult([], "error", f"请求失败: {exc.__class__.__name__}")

    if resp.status_code in (401, 403, 418, 429):
        return CrawlResult([], "limited", f"访问受限 HTTP {resp.status_code}", resp.status_code)
    if resp.status_code >= 400:
        return CrawlResult([], "error", f"HTTP {resp.status_code}", resp.status_code)

    resp.encoding = resp.apparent_encoding or resp.encoding
    soup = BeautifulSoup(resp.text, "html.parser")
    notices: list[dict[str, Any]] = []
    seen: set[str] = set()
    min_year = datetime.now(TZ).year - 1

    for a in soup.find_all("a", href=True):
        title = " ".join(a.get_text(" ", strip=True).split())
        if len(title) < 5 or not any(k in title for k in KEYWORDS):
            continue
        if "博士" not in title and not any(k in title for k in ("招生目录", "专业目录", "招生导师", "导师资格")):
            continue
        if any(x in title for x in EXCLUDE) and "博士" not in title:
            continue
        full_url = normalize_url(url, a["href"])
        if not permitted(full_url, source):
            continue
        if full_url in seen:
            continue
        seen.add(full_url)
        context = " ".join((a.parent.get_text(" ", strip=True) if a.parent else title).split())
        date = parse_date(context) or parse_date(title)
        year = infer_year(title, date)
        if year < min_year:
            continue
        digest = hashlib.sha1(full_url.encode("utf-8")).hexdigest()[:14]
        notices.append({
            "id": f"auto_{digest}",
            "school_id": source["school_id"],
            "school": source["school"],
            "title": title,
            "type": classify(title),
            "year": year,
            "publish_date": date,
            "url": full_url,
            "source_level": "A",
            "source_id": source["id"],
        })

    msg = f"发现 {len(notices)} 条候选招生动态"
    return CrawlResult(notices, "ok", msg, resp.status_code)


def merge_notices(existing: list[dict[str, Any]], found: list[dict[str, Any]], now_iso: str) -> tuple[list[dict[str, Any]], int]:
    by_url = {item.get("url"): item for item in existing if item.get("url")}
    added = 0
    for item in found:
        url = item["url"]
        if url in by_url:
            old = by_url[url]
            for key in ("title", "type", "year", "publish_date", "source_id"):
                if item.get(key):
                    old[key] = item[key]
            old["fetched_at"] = now_iso
            continue
        item["fetched_at"] = now_iso
        item["first_seen_at"] = now_iso
        item["is_new"] = True
        existing.append(item)
        by_url[url] = item
        added += 1

    def sort_key(x: dict[str, Any]) -> tuple[str, str]:
        return (x.get("publish_date") or "0000-00-00", x.get("title") or "")
    existing.sort(key=sort_key, reverse=True)
    return existing, added


def rebuild_data_js(now_iso: str) -> None:
    files = {
        "schools": "schools.json", "advisors": "advisors.json", "admissions": "admissions.json",
        "sources": "sources.json", "sourceStatus": "source_status.json", "timeline": "application_timeline.json",
        "profile": "profile.json", "materials": "materials.json",
    }
    bundle = {"meta": {"updated_at": now_iso, "data_version": "2.0.1", "target_year": 2027,
                       "notice": "全国公开可核验扩展版；2027政策以学校官方新发布内容为准，自动抓取只记录官方页面可见标题、日期和链接。"}}
    for key, filename in files.items():
        bundle[key] = load_json(DATA / filename, [] if key not in ("profile", "sourceStatus") else {})
    (ROOT / "data.js").write_text("window.APP_DATA = " + json.dumps(bundle, ensure_ascii=False, indent=2) + ";\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Do not write data files")
    parser.add_argument("--limit", type=int, default=0, help="Only crawl first N enabled sources")
    parser.add_argument("--delay", type=float, default=0.8, help="Delay between sources")
    parser.add_argument("--timeout", type=int, default=12, help="Request timeout per source")
    args = parser.parse_args()

    now = datetime.now(TZ)
    now_iso = now.isoformat(timespec="seconds")
    sources = [s for s in load_json(DATA / "sources.json", []) if s.get("enabled", True)]
    if args.limit:
        sources = sources[: args.limit]
    admissions = load_json(DATA / "admissions.json", [])
    statuses: list[dict[str, Any]] = []
    total_added = 0
    s = session()

    for idx, source in enumerate(sources, start=1):
        result = crawl_source(s, source, timeout=args.timeout)
        admissions, added = merge_notices(admissions, result.notices, now_iso)
        total_added += added
        statuses.append({
            "source_id": source["id"], "school": source["school"], "url": source["url"],
            "status": result.status, "checked_at": now_iso, "message": result.message,
            "http_status": result.http_status, "candidate_count": len(result.notices), "new_count": added,
        })
        print(f"[{idx}/{len(sources)}] {source['school']}: {result.status}, +{added}, {result.message}")
        if idx < len(sources):
            time.sleep(max(args.delay, 0))

    summary = {
        "total": len(statuses),
        "ok": sum(x["status"] == "ok" for x in statuses),
        "limited": sum(x["status"] == "limited" for x in statuses),
        "error": sum(x["status"] == "error" for x in statuses),
        "new_notices": total_added,
    }
    source_status = {"last_checked": now_iso, "mode": "scheduled_crawl", "summary": summary, "sources": statuses}

    if not args.dry_run:
        save_json(DATA / "admissions.json", admissions)
        save_json(DATA / "source_status.json", source_status)
        rebuild_data_js(now_iso)
    print(json.dumps(summary, ensure_ascii=False))
    return 0 if summary["error"] < max(3, len(statuses) // 2) else 1


if __name__ == "__main__":
    sys.exit(main())
