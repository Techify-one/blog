"""
Extrair transcrição de vídeo do YouTube
Biblioteca: youtube-transcript-api 1.2.4
Instalação: pip install youtube-transcript-api
"""
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import (
    TranscriptsDisabled,
    NoTranscriptFound,
    VideoUnavailable,
)

# Candidatos: vídeos curtos (<~1min) com legendas esperadas
CANDIDATES = [
    ("jNQXAC9IVRw", "Me at the zoo (19s)"),
    ("aqz-KE-bpKQ", "Big Buck Bunny trailer"),
    ("YbJOTdZBX1g", "YouTube short sample"),
]

ytt = YouTubeTranscriptApi()

for video_id, label in CANDIDATES:
    print(f"\n{'='*60}")
    print(f"Tentando: {label} (ID={video_id})")
    print('='*60)
    try:
        # tenta múltiplos idiomas em ordem de prioridade
        fetched = ytt.fetch(video_id, languages=['en', 'pt', 'pt-BR', 'es'])
        print(f"OK  language={fetched.language_code}  is_generated={fetched.is_generated}")
        print(f"OK  total snippets={len(fetched)}")
        print("\n--- Snippets ---")
        for s in fetched:
            print(f"[{s.start:6.2f}s +{s.duration:4.2f}s] {s.text}")
        print("\n--- Texto concatenado ---")
        full = " ".join(s.text for s in fetched)
        print(full)

        # Opcional: dados brutos em dict (útil para serializar em JSON)
        # raw = fetched.to_raw_data()
        # [{'text': '...', 'start': 0.0, 'duration': 1.54}, ...]

        break  # parou no primeiro sucesso
    except TranscriptsDisabled:
        print("FAIL: transcrições desabilitadas nesse vídeo")
    except NoTranscriptFound:
        print("FAIL: nenhuma transcrição nos idiomas solicitados")
    except VideoUnavailable:
        print("FAIL: vídeo indisponível")
    except Exception as e:
        print(f"FAIL: {type(e).__name__}: {e}")
