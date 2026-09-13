FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app/py_demo

COPY py_demo/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY py_demo/ .
COPY demo_docs/ /app/demo_docs/

EXPOSE 8501

CMD ["python", "-m", "streamlit", "run", "app.py", "--server.address=0.0.0.0", "--server.port=8501"]
