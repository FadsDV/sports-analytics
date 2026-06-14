#!/usr/bin/env python3
"""
Sofascore fetcher using curl_cffi — impersonates Chrome TLS fingerprint.
Called from collect-soccer.mjs as: python3 scripts/sofa-fetch.py <url>
Prints JSON to stdout, nothing on success error path (just exits non-zero).

Install: pip install curl-cffi
"""
import sys
import json

try:
    from curl_cffi import requests
except ImportError:
    print(json.dumps({"__error": "curl_cffi not installed — run: pip install curl-cffi"}))
    sys.exit(1)

if len(sys.argv) < 2:
    print(json.dumps({"__error": "usage: sofa-fetch.py <url>"}))
    sys.exit(1)

url = sys.argv[1]

headers = {
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.sofascore.com/",
    "Origin": "https://www.sofascore.com",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
    "x-requested-with": "XMLHttpRequest",
}

try:
    r = requests.get(url, impersonate="chrome136", headers=headers, timeout=15)
    if r.status_code != 200:
        print(json.dumps({"__status": r.status_code}))
        sys.exit(1)
    print(r.text)
except Exception as e:
    print(json.dumps({"__error": str(e)}))
    sys.exit(1)
