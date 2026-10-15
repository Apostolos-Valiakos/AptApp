FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    FASTEMBED_CACHE_PATH=/opt/fastembed \
    AI_DATA_DIR=/data

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

# Download the embedding model at build time, so the container never needs to
# fetch it at runtime (and a cold start doesn't stall the first upload/search).
COPY app/config.py app/config.py
RUN python -c "from fastembed import TextEmbedding; from app import config; TextEmbedding(model_name=config.EMBEDDING_MODEL)"

COPY app app
COPY ingest.py .

RUN useradd -r -u 1001 aiuser && mkdir -p /data && chown -R aiuser /data /opt/fastembed
USER aiuser

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
