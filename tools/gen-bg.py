#!/usr/bin/env python3
"""공유 카드 배경 텍스처를 Gemini로 다시 뽑는다.

  python3 tools/gen-bg.py

assets/bg.jpg 를 덮어쓴다. 그 다음 tools/embed-bg.py 로 index.html 안에
박아 넣어야 실제 카드에 반영된다. 배경을 파일 안에 넣는 이유는 외부 요청을
없애기 위해서다. 어디에 올려도 카드가 똑같이 나온다.

컨테이너 밖에서 돌릴 때는 GEMINI_API_KEY 가 필요하다.
"""
import base64, json, os, sys, urllib.request
from io import BytesIO

MODEL = os.environ.get("MODEL", "gemini-3-pro-image")
HOST  = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent"

PROMPT = (
  "A vertical abstract background texture. Deep near-black field, color #07090B fading to #0C1118. "
  "Across it, extremely faint engraved concentric circles and thin radial lines, like a very old "
  "astronomical chart pressed into dark paper — visible only as a whisper, never bright. "
  "A single soft amber glow, small and centered, hugging the very bottom edge of the frame only, "
  "fading out completely before it reaches the middle. Strong even vignette on all four edges. "
  "Fine film grain throughout. Overall extremely dark, muted, quiet, restrained, contemplative. "
  "The entire upper two-thirds and the exact center must remain almost pure black and completely empty. "
  "ABSOLUTELY NO TEXT, no letters, no numerals, no words, no logos, no symbols, no icons, "
  "no human figures, no faces, no objects, no creatures. Pure abstract texture only."
)

def main():
    url = HOST
    key = os.environ.get("GEMINI_API_KEY")
    if key:
        url += "?key=" + key
    body = {"contents":[{"parts":[{"text":PROMPT}]}],
            "generationConfig":{"responseModalities":["IMAGE"],
                                "imageConfig":{"aspectRatio":"4:5"}}}
    req = urllib.request.Request(url, data=json.dumps(body).encode(),
                                 headers={"Content-Type":"application/json"})
    res = json.load(urllib.request.urlopen(req, timeout=180))
    raw = None
    for part in res["candidates"][0]["content"]["parts"]:
        if "inlineData" in part:
            raw = base64.b64decode(part["inlineData"]["data"]); break
    if raw is None:
        sys.exit("이미지가 오지 않았다: " + json.dumps(res)[:400])

    from PIL import Image
    im = Image.open(BytesIO(raw)).convert("RGB").resize((1080,1350), Image.LANCZOS)
    # 115KB 밑으로 떨어질 때까지 품질을 낮춘다. 이 파일은 HTML 안에 들어간다.
    for q in (74, 66, 58, 50, 44):
        im.save("assets/bg.jpg", "JPEG", quality=q, optimize=True, progressive=True)
        n = os.path.getsize("assets/bg.jpg")
        print(f"  품질 {q} → {n:,} bytes")
        if n < 115_000:
            break
    print("assets/bg.jpg 저장 완료. 이제 tools/embed-bg.py 를 돌려라.")

if __name__ == "__main__":
    main()
