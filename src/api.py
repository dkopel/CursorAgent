"""HTTP API for datapoint ranking, user scoring, and threaded comments."""

from __future__ import annotations

from typing import Literal

from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel, Field

from ranking_system import Comment, Datapoint, RankingService, User


class CreateUserRequest(BaseModel):
    username: str = Field(min_length=1, max_length=50)


class CreateDatapointRequest(BaseModel):
    author_id: str = Field(min_length=1)
    latitude: float
    longitude: float
    title: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=500)


class VoteRequest(BaseModel):
    voter_id: str = Field(min_length=1)
    vote: Literal[-1, 1]


class CreateCommentRequest(BaseModel):
    author_id: str = Field(min_length=1)
    content: str = Field(min_length=1, max_length=255)
    parent_comment_id: str | None = None


def _serialize_user(service: RankingService, user: User) -> dict[str, object]:
    return {
        "user_id": user.user_id,
        "username": user.username,
        "datapoint_ids": sorted(user.datapoint_ids),
        "score": service.get_user_score(user.user_id),
    }


def _serialize_datapoint(datapoint: Datapoint) -> dict[str, object]:
    return {
        "datapoint_id": datapoint.datapoint_id,
        "author_id": datapoint.author_id,
        "latitude": datapoint.latitude,
        "longitude": datapoint.longitude,
        "title": datapoint.title,
        "description": datapoint.description,
        "upvotes": datapoint.upvotes,
        "downvotes": datapoint.downvotes,
        "accuracy_score": datapoint.accuracy_score,
        "top_level_comment_ids": datapoint.top_level_comment_ids,
    }


def _serialize_comment(comment: Comment) -> dict[str, object]:
    return {
        "comment_id": comment.comment_id,
        "datapoint_id": comment.datapoint_id,
        "author_id": comment.author_id,
        "content": comment.content,
        "parent_comment_id": comment.parent_comment_id,
        "reply_ids": comment.reply_ids,
        "upvotes": comment.upvotes,
        "downvotes": comment.downvotes,
        "net_score": comment.net_score,
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


def create_app(service: RankingService | None = None) -> FastAPI:
    ranking_service = service or RankingService()
    app = FastAPI(title="Datapoint Ranking API", version="1.0.0")

    @app.get("/healthz")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.post("/users", status_code=status.HTTP_201_CREATED)
    def create_user(payload: CreateUserRequest) -> dict[str, object]:
        try:
            user = ranking_service.create_user(payload.username)
            return _serialize_user(ranking_service, user)
        except Exception as exc:  # pragma: no cover - defensive conversion
            _raise_http_error(exc)

    @app.get("/users/{user_id}")
    def get_user(user_id: str) -> dict[str, object]:
        try:
            user = ranking_service.users[user_id]
            return _serialize_user(ranking_service, user)
        except Exception as exc:  # pragma: no cover - defensive conversion
            _raise_http_error(exc)

    @app.post("/datapoints", status_code=status.HTTP_201_CREATED)
    def create_datapoint(payload: CreateDatapointRequest) -> dict[str, object]:
        try:
            datapoint = ranking_service.create_datapoint(
                author_id=payload.author_id,
                latitude=payload.latitude,
                longitude=payload.longitude,
                title=payload.title,
                description=payload.description,
            )
            return _serialize_datapoint(datapoint)
        except Exception as exc:  # pragma: no cover - defensive conversion
            _raise_http_error(exc)

    @app.get("/datapoints/{datapoint_id}")
    def get_datapoint(datapoint_id: str) -> dict[str, object]:
        try:
            datapoint = ranking_service.datapoints[datapoint_id]
            return _serialize_datapoint(datapoint)
        except Exception as exc:  # pragma: no cover - defensive conversion
            _raise_http_error(exc)

    @app.post("/datapoints/{datapoint_id}/votes")
    def vote_datapoint(datapoint_id: str, payload: VoteRequest) -> dict[str, object]:
        try:
            accuracy_score = ranking_service.vote_datapoint(
                voter_id=payload.voter_id,
                datapoint_id=datapoint_id,
                vote=payload.vote,
            )
            datapoint = ranking_service.datapoints[datapoint_id]
            return {
                "datapoint_id": datapoint_id,
                "upvotes": datapoint.upvotes,
                "downvotes": datapoint.downvotes,
                "accuracy_score": accuracy_score,
            }
        except Exception as exc:  # pragma: no cover - defensive conversion
            _raise_http_error(exc)

    @app.get("/datapoints/{datapoint_id}/accuracy")
    def datapoint_accuracy(datapoint_id: str) -> dict[str, object]:
        try:
            return {
                "datapoint_id": datapoint_id,
                "accuracy_score": ranking_service.get_datapoint_accuracy_score(datapoint_id),
            }
        except Exception as exc:  # pragma: no cover - defensive conversion
            _raise_http_error(exc)

    @app.post("/datapoints/{datapoint_id}/comments", status_code=status.HTTP_201_CREATED)
    def create_comment(datapoint_id: str, payload: CreateCommentRequest) -> dict[str, object]:
        try:
            comment = ranking_service.create_comment(
                author_id=payload.author_id,
                datapoint_id=datapoint_id,
                content=payload.content,
                parent_comment_id=payload.parent_comment_id,
            )
            return _serialize_comment(comment)
        except Exception as exc:  # pragma: no cover - defensive conversion
            _raise_http_error(exc)

    @app.post("/comments/{comment_id}/votes")
    def vote_comment(comment_id: str, payload: VoteRequest) -> dict[str, object]:
        try:
            net_score = ranking_service.vote_comment(
                voter_id=payload.voter_id,
                comment_id=comment_id,
                vote=payload.vote,
            )
            comment = ranking_service.comments[comment_id]
            return {
                "comment_id": comment_id,
                "upvotes": comment.upvotes,
                "downvotes": comment.downvotes,
                "net_score": net_score,
            }
        except Exception as exc:  # pragma: no cover - defensive conversion
            _raise_http_error(exc)

    @app.get("/datapoints/{datapoint_id}/comments/tree")
    def comment_tree(datapoint_id: str) -> dict[str, object]:
        try:
            return {
                "datapoint_id": datapoint_id,
                "comments": ranking_service.get_comment_tree(datapoint_id),
            }
        except Exception as exc:  # pragma: no cover - defensive conversion
            _raise_http_error(exc)

    return app


app = create_app()
