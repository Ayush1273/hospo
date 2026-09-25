"""
RAG policy retrieval service using Gemini Embedding 2 and cosine similarity.
Ultra-lightweight with zero local PyTorch/model memory footprint.
"""

from typing import List
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity
from backend.core.config import GEMINI_EMBEDDING_MODEL
from backend.core.resources import resources
from backend.schemas.analysis import PolicyResult


def retrieve_policies(query: str, top_k: int = 5) -> List[PolicyResult]:
    """Retrieve top-k relevant hospital policies using Gemini Embedding 2 cosine similarity."""
    if (
        resources.rag_embeddings is None
        or resources.policy_df is None
        or len(resources.policy_df) == 0
    ):
        return []

    top_indices = []
    similarity_scores = None

    if resources.gemini_client is not None:
        try:
            res = resources.gemini_client.models.embed_content(
                model=GEMINI_EMBEDDING_MODEL,
                contents=query,
            )
            query_embedding = np.array([res.embeddings[0].values], dtype=np.float32)
            similarity_scores = cosine_similarity(query_embedding, resources.rag_embeddings)[0]
            top_indices = list(np.argsort(similarity_scores)[::-1][:top_k])
        except Exception as e:
            print(f"[HOSP-AI] Gemini embedding query error: {e}. Using fallback retrieval.")

    # Fallback if Gemini client is not configured or fails
    if not top_indices:
        query_words = set(query.lower().split())
        scores = []
        for _, row in resources.policy_df.iterrows():
            text = str(row[resources.rag_text_column]).lower()
            match_count = sum(1 for w in query_words if w in text)
            scores.append(match_count)
        top_indices = list(np.argsort(scores)[::-1][:top_k])
        similarity_scores = [0.75] * len(resources.policy_df)

    results = []
    for idx in top_indices:
        row = resources.policy_df.iloc[idx]
        title = row.get(
            "document_title", row.get("Document", row.get("title", "Hospital Policy"))
        )
        category = row.get("category", row.get("Category", "OPERATIONAL"))
        content = str(row[resources.rag_text_column])
        sim = float(similarity_scores[idx]) if similarity_scores is not None else 0.8
        results.append(
            PolicyResult(
                document=str(title),
                category=str(category),
                content=content,
                similarity=round(sim, 4),
            )
        )
    return results
