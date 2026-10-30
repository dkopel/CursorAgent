"""HTTP API for datapoint ranking, user scoring, and threaded comments."""

from __future__ import annotations

import os
from typing import Literal

from fastapi import Depends, FastAPI, HTTPException, status
from pydantic import BaseModel, Field
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from sqlite_store import AuthUser, SQLiteRankingStore


class RegisterRequest(BaseModel):
    username: str = Field(min_length=1, max_length=50)


class CreateDatapointRequest(BaseModel):
    latitude: float
    longitude: float
    title: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=500)


class VoteRequest(BaseModel):
    vote: Literal[-1, 1]


class CreateCommentRequest(BaseModel):
    content: str = Field(min_length=1, max_length=255)
    parent_comment_id: str | None = None


def _serialize_auth_user(store: SQLiteRankingStore, user: AuthUser) -> dict[str, object]:
    user_data = store.get_user(user.user_id)
    return {
        "user_id": user_data["user_id"],
        "username": user_data["username"],
        "datapoint_ids": user_data["datapoint_ids"],
        "score": user_data["score"],
        "token": user.token,
    }


def _raise_http_error(exc: Exception) -> None:
    if isinstance(exc, KeyError):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    if isinstance(exc, ValueError):
        detail = str(exc)
        duplicate_vote = "only once per datapoint" in detail or "only once per comment/reply" in detail
        raise HTTPException(
            status_code=(
                status.HTTP_409_CONFLICT
                if duplicate_vote
                else status.HTTP_400_BAD_REQUEST
            ),
            detail=detail,
        ) from exc
    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Unexpected server error.",
    ) from exc


def create_app(db_path: str | None = None) -> FastAPI:
    database_path = db_path or os.environ.get("RANKING_DB_PATH", "/workspace/data/ranking.db")
    ranking_store = SQLiteRankingStore(database_path)
    auth_scheme = HTTPBearer(auto_error=False)
    app = FastAPI(title="Datapoint Ranking API", version="1.0.0")

    def current_user(
        credentials: HTTPAuthorizationCredentials | None = Depends(auth_scheme),
    ) -> AuthUser:
        if credentials is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Missing bearer token.",
            )
        token = credentials.credentials.strip()
        if not token:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Missing bearer token.",
            )
        try:
            return ranking_store.get_user_by_token(token)
        except Exception as exc:  # pragma: no cover - defensive conversion
            if isinstance(exc, KeyError):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid bearer token.",
                ) from exc
            _raise_http_error(exc)

    @app.get("/healthz")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.post("/auth/register", status_code=status.HTTP_201_CREATED)
    def register(payload: RegisterRequest) -> dict[str, object]:
        try:
            user = ranking_store.create_user(payload.username)
            return _serialize_auth_user(ranking_store, user)
        except Exception as exc:  # pragma: no cover - defensive conversion
            _raise_http_error(exc)

    @app.get("/auth/me")
    def me(user: AuthUser = Depends(current_user)) -> dict[str, object]:
        try:
            user_data = ranking_store.get_user(user.user_id)
            return {
                "user_id": user_data["user_id"],
                "username": user_data["username"],
                "datapoint_ids": user_data["datapoint_ids"],
                "score": user_data["score"],
            }
        except Exception as exc:  # pragma: no cover - defensive conversion
            _raise_http_error(exc)

    @app.get("/users/{user_id}")
    def get_user(user_id: str) -> dict[str, object]:
        try:
            return ranking_store.get_user(user_id)
        except Exception as exc:  # pragma: no cover - defensive conversion
            _raise_http_error(exc)

    @app.post("/datapoints", status_code=status.HTTP_201_CREATED)
    def create_datapoint(
        payload: CreateDatapointRequest,
        user: AuthUser = Depends(current_user),
    ) -> dict[str, object]:
        try:
            return ranking_store.create_datapoint(
                author_id=user.user_id,
                latitude=payload.latitude,
                longitude=payload.longitude,
                title=payload.title,
                description=payload.description,
            )
        except Exception as exc:  # pragma: no cover - defensive conversion
            _raise_http_error(exc)

    @app.get("/datapoints/{datapoint_id}")
    def get_datapoint(datapoint_id: str) -> dict[str, object]:
        try:
            return ranking_store.get_datapoint(datapoint_id)
        except Exception as exc:  # pragma: no cover - defensive conversion
            _raise_http_error(exc)

    @app.post("/datapoints/{datapoint_id}/votes")
    def vote_datapoint(
        datapoint_id: str,
        payload: VoteRequest,
        user: AuthUser = Depends(current_user),
    ) -> dict[str, object]:
        try:
            return ranking_store.vote_datapoint(
                voter_id=user.user_id,
                datapoint_id=datapoint_id,
                vote=payload.vote,
            )
        except Exception as exc:  # pragma: no cover - defensive conversion
            _raise_http_error(exc)

    @app.get("/datapoints/{datapoint_id}/accuracy")
    def datapoint_accuracy(datapoint_id: str) -> dict[str, object]:
        try:
            return ranking_store.get_datapoint_accuracy(datapoint_id)
        except Exception as exc:  # pragma: no cover - defensive conversion
            _raise_http_error(exc)

    @app.post("/datapoints/{datapoint_id}/comments", status_code=status.HTTP_201_CREATED)
    def create_comment(
        datapoint_id: str,
        payload: CreateCommentRequest,
        user: AuthUser = Depends(current_user),
    ) -> dict[str, object]:
        try:
            return ranking_store.create_comment(
                author_id=user.user_id,
                datapoint_id=datapoint_id,
                content=payload.content,
                parent_comment_id=payload.parent_comment_id,
            )
        except Exception as exc:  # pragma: no cover - defensive conversion
            _raise_http_error(exc)

    @app.post("/comments/{comment_id}/votes")
    def vote_comment(
        comment_id: str,
        payload: VoteRequest,
        user: AuthUser = Depends(current_user),
    ) -> dict[str, object]:
        try:
            return ranking_store.vote_comment(
                voter_id=user.user_id,
                comment_id=comment_id,
                vote=payload.vote,
            )
        except Exception as exc:  # pragma: no cover - defensive conversion
            _raise_http_error(exc)

    @app.get("/datapoints/{datapoint_id}/comments/tree")
    def comment_tree(datapoint_id: str) -> dict[str, object]:
        try:
            return ranking_store.get_comment_tree(datapoint_id)
        except Exception as exc:  # pragma: no cover - defensive conversion
            _raise_http_error(exc)

    return app


app = create_app()
