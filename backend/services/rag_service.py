"""
RAG policy retrieval service using sentence-transformers and cosine similarity.
"""

from typing import List
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity
from backend.core.resources import resources
from backend.schemas.analysis import PolicyResult


def retrieve_policies(query: str, top_k: int = 5) -> List[PolicyResult]:
    """Retrieve top-k relevant hospital policies using sentence-transformers cosine similarity."""
    if (
        resources.embedding_model is None
        or resources.rag_embeddings is None
        or resources.policy_df is None
    ):
        return []

    query_embedding = resources.embedding_model.encode([query], convert_to_numpy=True)
    similarity_scores = cosine_similarity(query_embedding, resources.rag_embeddings)[0]
    top_indices = np.argsort(similarity_scores)[::-1][:top_k]

    results = []
    for idx in top_indices:
        row = resources.policy_df.iloc[idx]
        title = row.get(
            "document_title", row.get("Document", row.get("title", "Hospital Policy"))
        )
        category = row.get("category", row.get("Category", "OPERATIONAL"))
        content = str(row[resources.rag_text_column])
        sim = float(similarity_scores[idx])
        results.append(
            PolicyResult(
                document=str(title),
                category=str(category),
                content=content,
                similarity=round(sim, 4),
            )
        )
    return results
