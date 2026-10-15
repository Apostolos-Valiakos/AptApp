import os
from pathlib import Path



def _load_key_from_project_env():
    """Local runs: pick up ANTHROPIC_API_KEY from the project's .env.

    In Docker the key arrives as a real environment variable, and no .env
    file exists inside the image.
    """
    if os.environ.get("ANTHROPIC_API_KEY"):
        return
    env_file = Path(__file__).resolve().parents[2] / ".env"
    if not env_file.is_file():
        return
    for line in env_file.read_text(encoding="utf-8").splitlines():
        name, _, value = line.partition("=")
        if name.strip() == "ANTHROPIC_API_KEY" and value.strip():
            os.environ["ANTHROPIC_API_KEY"] = value.strip().strip("'\"")
            return


_load_key_from_project_env()

MAIN_API_URL = os.environ.get("MAIN_API_URL", "http://localhost:3000").rstrip("/")
AI_MODEL = os.environ.get("AI_MODEL", "claude-sonnet-5-5")
AI_EFFORT = os.environ.get("AI_EFFORT", "medium")
EMBEDDING_MODEL = os.environ.get(
    "EMBEDDING_MODEL", "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
)

DATA_DIR = Path(os.environ.get("AI_DATA_DIR", "./data"))
DOCS_DIR = DATA_DIR / "docs"
CHROMA_DIR = DATA_DIR / "chroma"

MAX_UPLOAD_BYTES = 10 * 1024 * 1024
ALLOWED_EXTENSIONS = {".pdf", ".docx", ".md", ".txt"}

MAX_HISTORY_MESSAGES = 20
MAX_MESSAGE_CHARS = 4000
MAX_AGENT_TURNS = 8
