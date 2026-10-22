FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app/backend

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
ARG INSTALL_OCR=0
COPY backend/requirements-ocr.txt ./requirements-ocr.txt
RUN if [ "$INSTALL_OCR" = "1" ]; then pip install --no-cache-dir -r requirements-ocr.txt; fi
RUN if [ "$INSTALL_OCR" = "1" ]; then apt-get update \
    && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*; fi

COPY backend/app ./app
COPY frontend /app/frontend
COPY data/demo/public/HD_001.pdf /app/demo-data/HD_001.pdf
COPY data/demo/public/HD_001.json /app/demo-data/HD_001.json

RUN mkdir -p /app/backend/data/uploads \
    && useradd --create-home --uid 10001 appuser \
    && mkdir -p /home/appuser/.paddlex \
    && chown -R appuser:appuser /app /home/appuser/.paddlex

USER appuser
EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
