FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 HF_HOME=/models
RUN useradd --create-home --uid 10001 laya
WORKDIR /service
COPY requirements.txt .
RUN pip install --no-cache-dir torch==2.10.0 --index-url https://download.pytorch.org/whl/cpu && pip install --no-cache-dir -r requirements.txt
COPY vendor/laya /vendor/laya
RUN pip install --no-deps /vendor/laya
COPY service.py .
RUN mkdir /models && chown laya:laya /models
USER laya
EXPOSE 8080
CMD ["uvicorn", "service:app", "--host", "0.0.0.0", "--port", "8080", "--no-access-log", "--proxy-headers", "--forwarded-allow-ips", "*", "--limit-concurrency", "48", "--timeout-keep-alive", "5"]
