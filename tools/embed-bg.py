#!/usr/bin/env python3
"""assets/bg.jpg 를 index.html 안의 BG_SRC 에 base64로 박아 넣는다.

  python3 tools/embed-bg.py

배경을 외부 파일로 두지 않는 이유: 카드를 그리는 시점에 네트워크 요청이
생기면, 느린 회선에서 배경 없는 카드가 나가거나 아예 실패한다.
"""
import base64, os, re, sys

if not os.path.exists("assets/bg.jpg"):
    sys.exit("assets/bg.jpg 가 없다. tools/gen-bg.py 를 먼저 돌려라.")

b64 = base64.b64encode(open("assets/bg.jpg","rb").read()).decode()
src = open("index.html", encoding="utf-8").read()
new, n = re.subn(r"const BG_SRC = 'data:image/jpeg;base64,[^']*';",
                 "const BG_SRC = 'data:image/jpeg;base64," + b64 + "';", src)
if n != 1:
    sys.exit(f"BG_SRC 를 찾지 못했거나 여러 개다 (발견 {n}개)")
open("index.html","w",encoding="utf-8").write(new)
print(f"index.html 갱신. 배경 {len(b64):,}자, 파일 전체 {len(new):,} bytes")
