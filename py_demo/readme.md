# Python demo

Streamlit UI, LangChain orchestration, embedded Chroma, and local Ollama models.
The shared policies live in `../demo_docs/`. This app does not require Node or
the TypeScript Chroma container.

## Setup

Use Python 3.10+ and a running Ollama with `llama3.2` and `nomic-embed-text`
downloaded. From the repository root:

```bash
cd py_demo
python -m venv venv
```

Windows PowerShell (no activation required):

```powershell
.\venv\Scripts\python.exe -m pip install -r requirements.txt
.\venv\Scripts\python.exe -m streamlit run app.py
```

macOS / Linux:

```bash
venv/bin/python -m pip install -r requirements.txt
venv/bin/python -m streamlit run app.py
```

Open **http://localhost:8501**. Stop with **Ctrl+C**. Restart after editing policy
files to rebuild the cached vector store. Dependencies are pinned to the versions
installed in the original working Python environment.

You can also launch from the repository root on Windows:

```powershell
.\py_demo\venv\Scripts\python.exe -m streamlit run py_demo/app.py
```

See the [root README](../readme.md) for shared setup and demo questions.
