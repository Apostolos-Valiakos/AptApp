"""Policy documents: parse, chunk, embed, store and search, always per shop."""

import re
import uuid
from functools import lru_cache
from pathlib import Path

from . import config

# Short chunks keep each passage on one topic; on Greek policy text 500 found
# the right passage noticeably more often than 900.
CHUNK_CHARS = 500
CHUNK_OVERLAP = 100
COLLECTION = "policies"


@lru_cache(maxsize=1)
def _embedder():
    from fastembed import TextEmbedding

    return TextEmbedding(model_name=config.EMBEDDING_MODEL)


@lru_cache(maxsize=1)
def _collection():
    import chromadb

    config.CHROMA_DIR.mkdir(parents=True, exist_ok=True)
    client = chromadb.PersistentClient(path=str(config.CHROMA_DIR))
    return client.get_or_create_collection(COLLECTION, metadata={"hnsw:space": "cosine"})


def _embed(texts: list[str]) -> list[list[float]]:
    # Small batches keep peak memory well under the container's limit.
    return [vector.tolist() for vector in _embedder().embed(texts, batch_size=4)]


def warm_up() -> None:
    _embed(["warm up"])
    _collection()


def extract_text(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        from pypdf import PdfReader

        return "\n\n".join(page.extract_text() or "" for page in PdfReader(str(path)).pages)
    if suffix == ".docx":
        from docx import Document

        return "\n".join(p.text for p in Document(str(path)).paragraphs)
    if suffix in {".md", ".txt"}:
        return path.read_text(encoding="utf-8", errors="replace")
    raise ValueError(f"Unsupported file type: {suffix}")


def chunk_text(text: str) -> list[str]:
    """Packs paragraphs into chunks of about CHUNK_CHARS, with a small overlap."""
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    pieces: list[str] = []
    for paragraph in paragraphs:
        while len(paragraph) > CHUNK_CHARS:
            cut = paragraph.rfind(" ", 0, CHUNK_CHARS)
            cut = cut if cut > CHUNK_CHARS // 2 else CHUNK_CHARS
            pieces.append(paragraph[:cut].strip())
            paragraph = paragraph[cut:].strip()
        if paragraph:
            pieces.append(paragraph)

    chunks: list[str] = []
    current = ""
    for piece in pieces:
        if current and len(current) + len(piece) + 2 > CHUNK_CHARS:
            chunks.append(current)
            current = current[-CHUNK_OVERLAP:] + "\n\n" + piece
        else:
            current = f"{current}\n\n{piece}" if current else piece
    if current:
        chunks.append(current)
    return chunks


def _safe_filename(name: str) -> str:
    name = Path(name).name
    return re.sub(r"[^\w.\- ]", "_", name, flags=re.UNICODE)[:120] or "document"


def _shop_dir(shop_id: str) -> Path:
    # shop_id comes from the Node API, never from the browser, but it becomes a
    # path component, so it is still restricted to UUID characters.
    if not re.fullmatch(r"[0-9a-fA-F-]{36}", shop_id):
        raise ValueError("Invalid shop id")
    return config.DOCS_DIR / shop_id


def ingest_bytes(shop_id: str, filename: str, data: bytes) -> dict:
    filename = _safe_filename(filename)
    if Path(filename).suffix.lower() not in config.ALLOWED_EXTENSIONS:
        raise ValueError("Unsupported file type")
    doc_id = uuid.uuid4().hex
    folder = _shop_dir(shop_id)
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{doc_id}__{filename}"
    path.write_bytes(data)
    try:
        chunks = chunk_text(extract_text(path))
        if not chunks:
            raise ValueError("No readable text found in the document")
        _collection().add(
            ids=[f"{doc_id}:{i}" for i in range(len(chunks))],
            embeddings=_embed(chunks),
            documents=chunks,
            metadatas=[
                {"shop_id": shop_id, "doc_id": doc_id, "filename": filename} for _ in chunks
            ],
        )
    except Exception:
        path.unlink(missing_ok=True)
        _collection().delete(where={"doc_id": doc_id})
        raise
    return {"id": doc_id, "filename": filename, "chunks": len(chunks), "size": len(data)}


def list_documents(shop_id: str) -> list[dict]:
    folder = _shop_dir(shop_id)
    if not folder.exists():
        return []
    documents = []
    for path in sorted(folder.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True):
        doc_id, _, filename = path.name.partition("__")
        stat = path.stat()
        documents.append(
            {"id": doc_id, "filename": filename, "size": stat.st_size, "uploaded_at": stat.st_mtime}
        )
    return documents


def delete_document(shop_id: str, doc_id: str) -> bool:
    if not re.fullmatch(r"[0-9a-f]{32}", doc_id):
        return False
    matches = list(_shop_dir(shop_id).glob(f"{doc_id}__*"))
    if not matches:
        return False
    _collection().delete(where={"$and": [{"shop_id": shop_id}, {"doc_id": doc_id}]})
    for path in matches:
        path.unlink(missing_ok=True)
    return True


def search(shop_id: str, query: str, k: int = 5) -> list[dict]:
    result = _collection().query(
        query_embeddings=_embed([query]), n_results=k, where={"shop_id": shop_id}
    )
    documents = (result.get("documents") or [[]])[0]
    metadatas = (result.get("metadatas") or [[]])[0]
    return [
        {"text": text, "source": meta.get("filename", "")}
        for text, meta in zip(documents, metadatas)
    ]
