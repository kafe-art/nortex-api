# Imagen de la API + frontend de NORTEX.
#   docker build -t nortex-api .
#   docker run -p 8000:8000 -v nortex_datos:/datos nortex-api      → http://localhost:8000/app/
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 \
    NORTEX_API_DATA=/datos PORT=8000

# git: nortex-data y nortex-motor se instalan desde GitHub (versiones fijadas en pyproject.toml)
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY pyproject.toml README.md ./
COPY nortex_api ./nortex_api
RUN pip install .

# Datos (SQLite + Parquet) en un volumen persistente: sin él se pierden en cada despliegue.
VOLUME ["/datos"]
EXPOSE 8000
CMD ["sh", "-c", "uvicorn nortex_api.main:app --host 0.0.0.0 --port ${PORT}"]
