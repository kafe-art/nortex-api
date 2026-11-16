# Imagen de la API + frontend de NORTEX (con datos semilla de `ejemplo_sl` incluidos para plan Free).
#   docker build -t nortex-api .
#   docker run -p 8000:8000 nortex-api      → http://localhost:8000/app/
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 \
    NORTEX_API_DATA=/datos PORT=8000

# git: nortex-data y nortex-motor se instalan desde GitHub (versiones fijadas en pyproject.toml)
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY pyproject.toml README.md ./
COPY nortex_api ./nortex_api
COPY datos_semilla /datos_semilla
RUN pip install . && mkdir -p /datos && cp -r /datos_semilla/. /datos/

EXPOSE 8000
CMD ["sh", "-c", "[ -f /datos/nortex.db ] || cp -r /datos_semilla/. /datos/; uvicorn nortex_api.main:app --host 0.0.0.0 --port ${PORT}"]
