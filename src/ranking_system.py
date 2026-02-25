"""Core ranking and commenting domain logic for map datapoints."""

from __future__ import annotations

from dataclasses import dataclass, field
from itertools import count


def _clamp_score(raw_score: float) -> float:
    """Clamp all scores into the 1-100 range."""
    if raw_score < 1.0:
        return 1.0
    if raw_score > 100.0:
        return 100.0
    return raw_score


def _normalize_vote(vote: int | bool) -> int:
    """Normalize bool/int vote values to +1 or -1."""
    if isinstance(vote, bool):
        return 1 if vote else -1
    if vote not in (-1, 1):
        raise ValueError("Votes must be +1 (upvote) or -1 (downvote).")
    return vote


@dataclass(slots=True)
class User:
    user_id: str
    username: str
    datapoint_ids: set[str] = field(default_factory=set)


@dataclass(slots=True)
class Datapoint:
    datapoint_id: str
    author_id: str
    latitude: float
    longitude: float
    title: str
    description: str = ""
    votes_by_user: dict[str, int] = field(default_factory=dict)
    top_level_comment_ids: list[str] = field(default_factory=list)

    def cast_vote(self, voter_id: str, vote: int | bool) -> None:
        if voter_id in self.votes_by_user:
            raise ValueError(
                "Each user can vote only once per datapoint."
            )
        self.votes_by_user[voter_id] = _normalize_vote(vote)

    @property
    def upvotes(self) -> int:
        return sum(1 for vote in self.votes_by_user.values() if vote == 1)

    @property
    def downvotes(self) -> int:
        return sum(1 for vote in self.votes_by_user.values() if vote == -1)

    @property
    def accuracy_score(self) -> float:
        total_votes = self.upvotes + self.downvotes
        if total_votes == 0:
            return 50.0
        raw_score = (self.upvotes / total_votes) * 100.0
        return _clamp_score(raw_score)


@dataclass(slots=True)
class Comment:
    comment_id: str
    datapoint_id: str
    author_id: str
    content: str
    parent_comment_id: str | None = None
    reply_ids: list[str] = field(default_factory=list)
    votes_by_user: dict[str, int] = field(default_factory=dict)

    def cast_vote(self, voter_id: str, vote: int | bool) -> None:
        if voter_id in self.votes_by_user:
            raise ValueError("Each user can vote only once per comment/reply.")
        self.votes_by_user[voter_id] = _normalize_vote(vote)

    @property
    def upvotes(self) -> int:
        return sum(1 for vote in self.votes_by_user.values() if vote == 1)

    @property
    def downvotes(self) -> int:
        return sum(1 for vote in self.votes_by_user.values() if vote == -1)

    @property
    def net_score(self) -> int:
        return self.upvotes - self.downvotes


class RankingService:
    """In-memory service for datapoints, votes, and threaded comments."""

    COMMENT_CHAR_LIMIT = 255
    POSITIVE_DATAPOINT_THRESHOLD = 51.0

    def __init__(self) -> None:
        self.users: dict[str, User] = {}
        self.datapoints: dict[str, Datapoint] = {}
        self.comments: dict[str, Comment] = {}

        self._user_id_counter = count(start=1)
        self._datapoint_id_counter = count(start=1)
        self._comment_id_counter = count(start=1)

    def create_user(self, username: str) -> User:
        cleaned_username = username.strip()
        if not cleaned_username:
            raise ValueError("Username is required.")

        user = User(
            user_id=f"user-{next(self._user_id_counter)}",
            username=cleaned_username,
        )
        self.users[user.user_id] = user
        return user

    def create_datapoint(
        self,
        author_id: str,
        latitude: float,
        longitude: float,
        title: str,
        description: str = "",
    ) -> Datapoint:
        self._require_user(author_id)
        cleaned_title = title.strip()
        if not cleaned_title:
            raise ValueError("Datapoint title is required.")

        datapoint = Datapoint(
            datapoint_id=f"datapoint-{next(self._datapoint_id_counter)}",
            author_id=author_id,
            latitude=latitude,
            longitude=longitude,
            title=cleaned_title,
            description=description.strip(),
        )
        self.datapoints[datapoint.datapoint_id] = datapoint
        self.users[author_id].datapoint_ids.add(datapoint.datapoint_id)
        return datapoint

    def vote_datapoint(self, voter_id: str, datapoint_id: str, vote: int | bool) -> float:
        self._require_user(voter_id)
        datapoint = self._require_datapoint(datapoint_id)
        datapoint.cast_vote(voter_id=voter_id, vote=vote)
        return datapoint.accuracy_score

    def create_comment(
        self,
        author_id: str,
        datapoint_id: str,
        content: str,
        parent_comment_id: str | None = None,
    ) -> Comment:
        self._require_user(author_id)
        datapoint = self._require_datapoint(datapoint_id)
        cleaned_content = content.strip()

        if not cleaned_content:
            raise ValueError("Comment content is required.")
        if len(cleaned_content) > self.COMMENT_CHAR_LIMIT:
            raise ValueError(
                f"Comment content cannot exceed {self.COMMENT_CHAR_LIMIT} characters."
            )

        parent_comment = None
        if parent_comment_id is not None:
            parent_comment = self._require_comment(parent_comment_id)
            if parent_comment.datapoint_id != datapoint_id:
                raise ValueError("Replies must belong to the same datapoint as the parent.")

        comment = Comment(
            comment_id=f"comment-{next(self._comment_id_counter)}",
            datapoint_id=datapoint_id,
            author_id=author_id,
            content=cleaned_content,
            parent_comment_id=parent_comment_id,
        )
        self.comments[comment.comment_id] = comment

        if parent_comment is None:
            datapoint.top_level_comment_ids.append(comment.comment_id)
        else:
            parent_comment.reply_ids.append(comment.comment_id)

        return comment

    def vote_comment(self, voter_id: str, comment_id: str, vote: int | bool) -> int:
        self._require_user(voter_id)
        comment = self._require_comment(comment_id)
        comment.cast_vote(voter_id=voter_id, vote=vote)
        return comment.net_score

    def get_comment_tree(self, datapoint_id: str) -> list[dict[str, object]]:
        datapoint = self._require_datapoint(datapoint_id)
        return [
            self._comment_to_tree_node(comment_id)
            for comment_id in datapoint.top_level_comment_ids
        ]

    def get_datapoint_accuracy_score(self, datapoint_id: str) -> float:
        datapoint = self._require_datapoint(datapoint_id)
        return datapoint.accuracy_score

    def get_user_score(self, user_id: str) -> float:
        user = self._require_user(user_id)
        total_datapoints = len(user.datapoint_ids)
        if total_datapoints == 0:
            return 50.0

        positive_datapoints = sum(
            1
            for datapoint_id in user.datapoint_ids
            if self.datapoints[datapoint_id].accuracy_score
            >= self.POSITIVE_DATAPOINT_THRESHOLD
        )
        raw_score = (positive_datapoints / total_datapoints) * 100.0
        return _clamp_score(raw_score)

    def _require_user(self, user_id: str) -> User:
        user = self.users.get(user_id)
        if user is None:
            raise KeyError(f"User '{user_id}' does not exist.")
        return user

    def _require_datapoint(self, datapoint_id: str) -> Datapoint:
        datapoint = self.datapoints.get(datapoint_id)
        if datapoint is None:
            raise KeyError(f"Datapoint '{datapoint_id}' does not exist.")
        return datapoint

    def _require_comment(self, comment_id: str) -> Comment:
        comment = self.comments.get(comment_id)
        if comment is None:
            raise KeyError(f"Comment '{comment_id}' does not exist.")
        return comment

    def _comment_to_tree_node(self, comment_id: str) -> dict[str, object]:
        comment = self._require_comment(comment_id)
        return {
            "comment_id": comment.comment_id,
            "datapoint_id": comment.datapoint_id,
            "author_id": comment.author_id,
            "parent_comment_id": comment.parent_comment_id,
            "content": comment.content,
            "upvotes": comment.upvotes,
            "downvotes": comment.downvotes,
            "net_score": comment.net_score,
            "replies": [
                self._comment_to_tree_node(reply_id)
                for reply_id in comment.reply_ids
            ],
        }
