"""Long-running Piper process for /api/tts: one JSON request per stdin line, one JSON reply per stdout line."""

import json
import sys
import wave

from piper import PiperVoice, SynthesisConfig

models = {"de": sys.argv[1], "en": sys.argv[2]}
voices = {}
# Slightly quicker than Piper's default pace, closer to how the guide read before
config = SynthesisConfig(length_scale=0.92)


def voice(lang):
    if lang not in voices:
        voices[lang] = PiperVoice.load(models[lang])
    return voices[lang]


for lang in models:
    voice(lang)
print(json.dumps({"ready": True}), flush=True)

for line in sys.stdin:
    job = None
    try:
        job = json.loads(line)
        with wave.open(job["out"], "wb") as wav:
            voice(job["lang"]).synthesize_wav(job["text"], wav, syn_config=config)
        reply = {"id": job["id"], "ok": True}
    except Exception as err:
        reply = {"id": job.get("id") if isinstance(job, dict) else None, "ok": False, "error": str(err)}
    print(json.dumps(reply), flush=True)
