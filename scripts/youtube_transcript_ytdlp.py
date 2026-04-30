"""
Extrair transcrição de vídeo do YouTube usando yt-dlp.

Funciona em ambientes onde youtube-transcript-api falha com RequestBlocked
(IPs de cloud providers). yt-dlp usa endpoints diferentes e tem estratégias
de fallback mais robustas.

Instalação: pip install yt-dlp
"""
import json
import tempfile
from pathlib import Path

from yt_dlp import YoutubeDL

CANDIDATES = [
    ("jNQXAC9IVRw", "Me at the zoo (19s)"),
    ("aqz-KE-bpKQ", "Big Buck Bunny trailer"),
]

LANGS = ["en", "pt", "pt-BR", "es"]


def fetch_transcript(video_id: str, langs=LANGS):
    """Retorna (lang, snippets) ou levanta RuntimeError."""
    with tempfile.TemporaryDirectory() as tmp:
        outtmpl = str(Path(tmp) / "%(id)s.%(ext)s")
        opts = {
            "skip_download": True,
            "writesubtitles": True,
            "writeautomaticsub": True,
            "subtitleslangs": langs,
            "subtitlesformat": "json3",
            "outtmpl": outtmpl,
            "quiet": True,
            "no_warnings": True,
            "nocheckcertificate": True,  # sandbox MITM friendly; remova em prod
        }
        with YoutubeDL(opts) as ydl:
            ydl.extract_info(
                f"https://www.youtube.com/watch?v={video_id}",
                download=True,
            )

        for lang in langs:
            path = Path(tmp) / f"{video_id}.{lang}.json3"
            if path.exists():
                data = json.loads(path.read_text(encoding="utf-8"))
                snippets = []
                for ev in data.get("events", []):
                    segs = ev.get("segs") or []
                    text = "".join(s.get("utf8", "") for s in segs).strip()
                    if not text:
                        continue
                    snippets.append({
                        "start": (ev.get("tStartMs", 0)) / 1000,
                        "duration": (ev.get("dDurationMs", 0)) / 1000,
                        "text": text,
                    })
                return lang, snippets

        raise RuntimeError(f"Nenhuma legenda em {langs}")


if __name__ == "__main__":
    for video_id, label in CANDIDATES:
        print(f"\n{'='*60}")
        print(f"Tentando: {label} (ID={video_id})")
        print("=" * 60)
        try:
            lang, snippets = fetch_transcript(video_id)
            print(f"OK  language={lang}  total snippets={len(snippets)}")
            print("\n--- Snippets ---")
            for s in snippets:
                print(f"[{s['start']:6.2f}s +{s['duration']:4.2f}s] {s['text']}")
            print("\n--- Texto concatenado ---")
            print(" ".join(s["text"] for s in snippets))
            break
        except Exception as e:
            print(f"FAIL: {type(e).__name__}: {e}")
