"""
RAG Engine — Retrieval-Augmented Generation for Air Quality Health Advisory
===========================================================================
Functions:
  build_index()                          — load PDFs, chunk, embed, store in FAISS
  retrieve_chunks(query, k=3)            — semantic search over the FAISS index
  generate_answer(query, aqi_context, chunks) — build prompt + call Gemini
"""

import os
import json
import pickle
import logging

log = logging.getLogger(__name__)

# ── Optional RAG dependencies ─────────────────────────────────────────────────
try:
    import fitz                                          # PyMuPDF
    import faiss
    import numpy as np
    from sentence_transformers import SentenceTransformer
    RAG_AVAILABLE = True
    log.info("RAG dependencies loaded successfully.")
except ImportError as _e:
    RAG_AVAILABLE = False
    log.warning("RAG dependencies not available (%s). Chatbot will return fallback responses.", _e)

try:
    from google import genai as genai_sdk
    GEMINI_AVAILABLE = True
except ImportError:
    try:
        import google.generativeai as genai_sdk
        GEMINI_AVAILABLE = True
    except ImportError:
        genai_sdk = None
        GEMINI_AVAILABLE = False
        log.warning("Neither google-genai nor google-generativeai is installed.")

# ── Paths ─────────────────────────────────────────────────────────────────────
BASE_DIR   = os.path.dirname(__file__)
KB_DIR     = os.path.join(BASE_DIR, "RAG_knowladgeBase")

# Disk cache paths — index is saved here after first build so restarts are instant
CACHE_DIR        = os.path.join(BASE_DIR, ".rag_cache")
CACHE_INDEX_PATH = os.path.join(CACHE_DIR, "faiss.index")
CACHE_META_PATH  = os.path.join(CACHE_DIR, "metadata.pkl")

PDF_FILES = [
    "452combined.pdf",
    "9789240034228-eng.pdf",
    "air1.pdf",
    "Air_Pollution_Handbook.pdf",
    "Handbook of Air Pollution Prevention and Control.pdf",
]

# ── Chunking parameters ───────────────────────────────────────────────────────
# Larger chunks = far fewer embeddings = much faster build time.
# 1500 chars ≈ ~250 words, still fits well in a RAG prompt.
CHUNK_SIZE    = 1500   # characters per chunk  (was 500 → ~5x fewer chunks)
CHUNK_OVERLAP = 150    # character overlap

# ── Embedding model ───────────────────────────────────────────────────────────
EMBED_MODEL_NAME = "all-MiniLM-L6-v2"

# ── Module-level state ────────────────────────────────────────────────────────
_faiss_index: "faiss.IndexFlatL2 | None" = None
_chunk_metadata: list[dict] = []
_embed_model: "SentenceTransformer | None" = None
_gemini_model = None


# ─────────────────────────────────────────────────────────────────────────────
# Internal helpers
# ─────────────────────────────────────────────────────────────────────────────

def _get_embed_model():
    global _embed_model
    if _embed_model is None:
        log.info("Loading embedding model '%s' …", EMBED_MODEL_NAME)
        _embed_model = SentenceTransformer(EMBED_MODEL_NAME)
        log.info("Embedding model loaded.")
    return _embed_model


def _chunk_text(text: str, source: str, page: int) -> list[dict]:
    chunks = []
    start = 0
    while start < len(text):
        end = start + CHUNK_SIZE
        chunk_text = text[start:end].strip()
        if len(chunk_text) > 80:   # skip tiny fragments
            chunks.append({"text": chunk_text, "source": source, "page": page})
        start += CHUNK_SIZE - CHUNK_OVERLAP
    return chunks


def _cache_exists() -> bool:
    return os.path.exists(CACHE_INDEX_PATH) and os.path.exists(CACHE_META_PATH)


def _save_cache(index, metadata: list[dict]) -> None:
    os.makedirs(CACHE_DIR, exist_ok=True)
    faiss.write_index(index, CACHE_INDEX_PATH)
    with open(CACHE_META_PATH, "wb") as f:
        pickle.dump(metadata, f)
    log.info("FAISS index cached to disk at %s", CACHE_DIR)


def _load_cache() -> tuple:
    log.info("Loading FAISS index from disk cache …")
    index = faiss.read_index(CACHE_INDEX_PATH)
    with open(CACHE_META_PATH, "rb") as f:
        metadata = pickle.load(f)
    log.info("Cache loaded: %d vectors.", index.ntotal)
    return index, metadata


# ─────────────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────────────

def build_index() -> tuple:
    """
    Build (or load from disk cache) the FAISS index.

    On first run: loads PDFs → chunks → embeds → saves to .rag_cache/
    On subsequent runs: loads the saved index from disk instantly.
    """
    global _faiss_index, _chunk_metadata

    if not RAG_AVAILABLE:
        log.error("Cannot build index: RAG dependencies are not installed.")
        return None, []

    # ── Fast path: load from disk cache ──────────────────────────────────────
    if _cache_exists():
        try:
            _faiss_index, _chunk_metadata = _load_cache()
            return _faiss_index, _chunk_metadata
        except Exception as exc:
            log.warning("Failed to load cache (%s) — rebuilding from PDFs.", exc)

    # ── Slow path: build from PDFs ────────────────────────────────────────────
    all_chunks: list[dict] = []

    for pdf_name in PDF_FILES:
        pdf_path = os.path.join(KB_DIR, pdf_name)
        if not os.path.exists(pdf_path):
            log.warning("PDF not found, skipping: %s", pdf_path)
            continue
        try:
            doc = fitz.open(pdf_path)
            log.info("Processing '%s' (%d pages) …", pdf_name, len(doc))
            for page_num in range(len(doc)):
                page = doc.load_page(page_num)
                text = page.get_text()
                if text.strip():
                    all_chunks.extend(_chunk_text(text, source=pdf_name, page=page_num + 1))
            doc.close()
        except Exception as exc:
            log.warning("Failed to process '%s': %s", pdf_name, exc)

    if not all_chunks:
        log.error("No chunks extracted — index will be empty.")
        _faiss_index = None
        _chunk_metadata = []
        return None, []

    log.info("Total chunks extracted: %d  (chunk_size=%d)", len(all_chunks), CHUNK_SIZE)

    # ── Embed ─────────────────────────────────────────────────────────────────
    model = _get_embed_model()
    texts = [c["text"] for c in all_chunks]
    log.info("Embedding %d chunks (this takes ~1–3 min on CPU) …", len(texts))
    embeddings = model.encode(
        texts,
        show_progress_bar=True,   # shows progress in terminal
        batch_size=128,            # larger batch = faster on CPU
        convert_to_numpy=True,
    )
    embeddings = np.array(embeddings, dtype="float32")

    # ── Build FAISS index ─────────────────────────────────────────────────────
    dim = embeddings.shape[1]
    index = faiss.IndexFlatL2(dim)
    index.add(embeddings)
    log.info("FAISS index built: %d vectors, dim=%d.", index.ntotal, dim)

    # ── Save to disk so next restart is instant ───────────────────────────────
    try:
        _save_cache(index, all_chunks)
    except Exception as exc:
        log.warning("Could not save cache: %s", exc)

    _faiss_index    = index
    _chunk_metadata = all_chunks
    return _faiss_index, _chunk_metadata


def retrieve_chunks(query: str, k: int = 3) -> list[dict]:
    """Return top-k most relevant chunks for the query."""
    if not RAG_AVAILABLE:
        return []
    if _faiss_index is None or not _chunk_metadata:
        log.warning("FAISS index not built yet.")
        return []
    try:
        model = _get_embed_model()
        query_vec = model.encode([query], show_progress_bar=False)
        query_vec = np.array(query_vec, dtype="float32")
        k_actual = min(k, _faiss_index.ntotal)
        distances, indices = _faiss_index.search(query_vec, k_actual)
        results = []
        for dist, idx in zip(distances[0], indices[0]):
            if 0 <= idx < len(_chunk_metadata):
                meta = _chunk_metadata[idx]
                results.append({
                    "text":   meta["text"],
                    "source": meta["source"],
                    "page":   meta["page"],
                    "score":  float(dist),
                })
        return results
    except Exception as exc:
        log.error("retrieve_chunks error: %s", exc)
        return []


def generate_answer(query: str, aqi_context: dict, chunks: list[dict]) -> dict:
    """Call Gemini with AQI context + retrieved chunks and return the answer."""

    # ── Format AQI context ────────────────────────────────────────────────────
    city               = aqi_context.get("city", "Unknown")
    aqi                = aqi_context.get("aqi", "N/A")
    aqi_category       = aqi_context.get("aqi_category", "N/A")
    dominant_pollutant = aqi_context.get("dominant_pollutant", "N/A")

    live_aqi_context = (
        f"City: {city} | AQI: {aqi} ({aqi_category}) | "
        f"Dominant Pollutant: {dominant_pollutant}"
    )
    extra_fields = ["pm2_5", "pm10", "nitrogen_dioxide", "sulphur_dioxide",
                    "carbon_monoxide", "ozone", "ammonia"]
    extras = []
    for field in extra_fields:
        val = aqi_context.get(field) or (aqi_context.get("current") or {}).get(field)
        if val is not None:
            extras.append(f"{field}={val}")
    if extras:
        live_aqi_context += " | " + ", ".join(extras)

    # ── Format retrieved chunks ───────────────────────────────────────────────
    if chunks:
        chunk_texts = "\n\n".join(
            f"[Source: {c['source']}, Page {c['page']}]\n{c['text']}"
            for c in chunks
        )
    else:
        chunk_texts = "No relevant knowledge-base content found."

    sources = list(dict.fromkeys(c["source"] for c in chunks))

    # ── Build prompt ──────────────────────────────────────────────────────────
    prompt = (
        "You are a friendly, casual, and conversational air quality health advisor. "
        "IMPORTANT RULES:\n"
        "1. Do NOT use any markdown formatting like asterisks (** or *) in your response. Keep it plain and clean.\n"
        "2. If the user message is just a greeting like 'hi', 'hello', or 'hey', greet them back warmly first before bringing up air quality.\n"
        "3. Keep the conversation natural and casual.\n\n"
        f"Current air quality: {live_aqi_context}\n"
        f"Relevant research:\n{chunk_texts}\n\n"
        f"User message: {query}\n"
        "Answer conversationally based on the rules."
    )

    # ── API key check ─────────────────────────────────────────────────────────
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        log.warning("GEMINI_API_KEY is not set.")
        return {
            "answer": (
                f"⚠️ GEMINI_API_KEY is not configured in backend/.env\n\n"
                f"Current AQI for {city}: {aqi} ({aqi_category}). "
                "Please set your Gemini API key to enable AI responses."
            ),
            "sources": sources,
        }

    if not GEMINI_AVAILABLE:
        return {
            "answer": "Gemini SDK not installed. Run: pip install google-genai",
            "sources": sources,
        }

    # ── Call Gemini ───────────────────────────────────────────────────────────
    global _gemini_model
    try:
        if _gemini_model is None:
            log.info("Initializing Gemini client …")
            if hasattr(genai_sdk, "Client"):
                os.environ["GEMINI_API_KEY"] = api_key
                _gemini_model = genai_sdk.Client()
                _gemini_model._sdk = "new"
            else:
                genai_sdk.configure(api_key=api_key)
                _gemini_model = genai_sdk.GenerativeModel("gemini-1.5-flash")
                _gemini_model._sdk = "old"
            log.info("Gemini client ready (sdk=%s).", _gemini_model._sdk)

        log.info("Calling Gemini API …")
        if _gemini_model._sdk == "new":
            response = _gemini_model.models.generate_content(
                model="gemini-3-flash-preview", contents=prompt
            )
        else:
            response = _gemini_model.generate_content(prompt)

        answer_text = response.text.strip()
        log.info("Gemini response: %d chars.", len(answer_text))
        return {"answer": answer_text, "sources": sources}

    except Exception as exc:
        log.error("Gemini API error: %s", exc)
        _gemini_model = None   # reset so it re-initializes next time
        return {
            "answer": (
                f"Gemini API error: {exc}\n\n"
                f"Current AQI for {city}: {aqi} ({aqi_category})."
            ),
            "sources": sources,
        }
