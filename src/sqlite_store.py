"""SQLite persistence layer for ranking, voting, and threaded comments."""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from pathlib import Path
from uuid import uuid4


def _clamp_score(raw_score: float) -> float:
    if raw_score < 1.0:
        return 1.0
    if raw_score > 100.0:
        return 100.0
    return raw_score


@dataclass(slots=True)
class AuthUser:
    user_id: str
    username: str
    token: str


class SQLiteRankingStore:
    COMMENT_CHAR_LIMIT = 255
    POSITIVE_DATAPOINT_THRESHOLD = 51.0

    def __init__(self, db_path: str) -> None:
        self.db_path = db_path
        db_dir = Path(db_path).parent
        db_dir.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.db_path)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON;")
        return connection

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    username TEXT NOT NULL UNIQUE,
                    token TEXT NOT NULL UNIQUE
                );

                CREATE TABLE IF NOT EXISTS datapoints (
                    id TEXT PRIMARY KEY,
                    author_id TEXT NOT NULL,
                    latitude REAL NOT NULL,
                    longitude REAL NOT NULL,
                    title TEXT NOT NULL,
                    description TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS datapoint_votes (
                    datapoint_id TEXT NOT NULL,
                    voter_id TEXT NOT NULL,
                    vote INTEGER NOT NULL CHECK (vote IN (-1, 1)),
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (datapoint_id, voter_id),
                    FOREIGN KEY (datapoint_id) REFERENCES datapoints(id) ON DELETE CASCADE,
                    FOREIGN KEY (voter_id) REFERENCES users(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS comments (
                    id TEXT PRIMARY KEY,
                    datapoint_id TEXT NOT NULL,
                    author_id TEXT NOT NULL,
                    parent_comment_id TEXT,
                    content TEXT NOT NULL CHECK (LENGTH(content) <= 255),
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (datapoint_id) REFERENCES datapoints(id) ON DELETE CASCADE,
                    FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE,
                    FOREIGN KEY (parent_comment_id) REFERENCES comments(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS comment_votes (
                    comment_id TEXT NOT NULL,
                    voter_id TEXT NOT NULL,
                    vote INTEGER NOT NULL CHECK (vote IN (-1, 1)),
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (comment_id, voter_id),
                    FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE,
                    FOREIGN KEY (voter_id) REFERENCES users(id) ON DELETE CASCADE
                );
                """
            )

    def create_user(self, username: str) -> AuthUser:
        cleaned = username.strip()
        if not cleaned:
            raise ValueError("Username is required.")

        user = AuthUser(
            user_id=f"user-{uuid4()}",
            username=cleaned,
            token=f"token-{uuid4()}",
        )
        try:
            with self._connect() as conn:
                conn.execute(
                    "INSERT INTO users (id, username, token) VALUES (?, ?, ?)",
                    (user.user_id, user.username, user.token),
                )
        except sqlite3.IntegrityError as exc:
            raise ValueError("Username is already taken.") from exc
        return user

    def get_user_by_token(self, token: str) -> AuthUser:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT id, username, token FROM users WHERE token = ?",
                (token,),
            ).fetchone()
        if row is None:
            raise KeyError("Invalid authentication token.")
        return AuthUser(user_id=row["id"], username=row["username"], token=row["token"])

    def get_user(self, user_id: str) -> dict[str, object]:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT id, username FROM users WHERE id = ?",
                (user_id,),
            ).fetchone()
            if row is None:
                raise KeyError(f"User '{user_id}' does not exist.")
            datapoint_rows = conn.execute(
                "SELECT id FROM datapoints WHERE author_id = ? ORDER BY created_at ASC, id ASC",
                (user_id,),
            ).fetchall()

        datapoint_ids = [entry["id"] for entry in datapoint_rows]
        return {
            "user_id": row["id"],
            "username": row["username"],
            "datapoint_ids": datapoint_ids,
            "score": self.get_user_score(user_id),
        }

    def create_datapoint(
        self,
        author_id: str,
        latitude: float,
        longitude: float,
        title: str,
        description: str = "",
    ) -> dict[str, object]:
        cleaned_title = title.strip()
        if not cleaned_title:
            raise ValueError("Datapoint title is required.")
        cleaned_description = description.strip()

        datapoint_id = f"datapoint-{uuid4()}"
        with self._connect() as conn:
            user_row = conn.execute(
                "SELECT id FROM users WHERE id = ?",
                (author_id,),
            ).fetchone()
            if user_row is None:
                raise KeyError(f"User '{author_id}' does not exist.")
            conn.execute(
                """
                INSERT INTO datapoints (id, author_id, latitude, longitude, title, description)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    datapoint_id,
                    author_id,
                    latitude,
                    longitude,
                    cleaned_title,
                    cleaned_description,
                ),
            )
        return self.get_datapoint(datapoint_id)

    def get_datapoint(self, datapoint_id: str) -> dict[str, object]:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT id, author_id, latitude, longitude, title, description
                FROM datapoints
                WHERE id = ?
                """,
                (datapoint_id,),
            ).fetchone()
            if row is None:
                raise KeyError(f"Datapoint '{datapoint_id}' does not exist.")
        upvotes, downvotes = self._datapoint_vote_counts(datapoint_id)
        top_level_comment_ids = self._top_level_comment_ids(datapoint_id)
        return {
            "datapoint_id": row["id"],
            "author_id": row["author_id"],
            "latitude": row["latitude"],
            "longitude": row["longitude"],
            "title": row["title"],
            "description": row["description"],
            "upvotes": upvotes,
            "downvotes": downvotes,
            "accuracy_score": self._accuracy_from_counts(upvotes, downvotes),
            "top_level_comment_ids": top_level_comment_ids,
        }

    def vote_datapoint(self, voter_id: str, datapoint_id: str, vote: int) -> dict[str, object]:
        if vote not in (-1, 1):
            raise ValueError("Votes must be +1 (upvote) or -1 (downvote).")
        with self._connect() as conn:
            if conn.execute("SELECT id FROM users WHERE id = ?", (voter_id,)).fetchone() is None:
                raise KeyError(f"User '{voter_id}' does not exist.")
            if conn.execute("SELECT id FROM datapoints WHERE id = ?", (datapoint_id,)).fetchone() is None:
                raise KeyError(f"Datapoint '{datapoint_id}' does not exist.")
            try:
                conn.execute(
                    """
                    INSERT INTO datapoint_votes (datapoint_id, voter_id, vote)
                    VALUES (?, ?, ?)
                    """,
                    (datapoint_id, voter_id, vote),
                )
            except sqlite3.IntegrityError as exc:
                raise ValueError("Each user can vote only once per datapoint.") from exc
        upvotes, downvotes = self._datapoint_vote_counts(datapoint_id)
        return {
            "datapoint_id": datapoint_id,
            "upvotes": upvotes,
            "downvotes": downvotes,
            "accuracy_score": self._accuracy_from_counts(upvotes, downvotes),
        }

    def get_datapoint_accuracy(self, datapoint_id: str) -> dict[str, object]:
        self._require_datapoint(datapoint_id)
        upvotes, downvotes = self._datapoint_vote_counts(datapoint_id)
        return {
            "datapoint_id": datapoint_id,
            "accuracy_score": self._accuracy_from_counts(upvotes, downvotes),
        }

    def create_comment(
        self,
        author_id: str,
        datapoint_id: str,
        content: str,
        parent_comment_id: str | None = None,
    ) -> dict[str, object]:
        cleaned_content = content.strip()
        if not cleaned_content:
            raise ValueError("Comment content is required.")
        if len(cleaned_content) > self.COMMENT_CHAR_LIMIT:
            raise ValueError(
                f"Comment content cannot exceed {self.COMMENT_CHAR_LIMIT} characters."
            )

        comment_id = f"comment-{uuid4()}"
        with self._connect() as conn:
            if conn.execute("SELECT id FROM users WHERE id = ?", (author_id,)).fetchone() is None:
                raise KeyError(f"User '{author_id}' does not exist.")
            if conn.execute("SELECT id FROM datapoints WHERE id = ?", (datapoint_id,)).fetchone() is None:
                raise KeyError(f"Datapoint '{datapoint_id}' does not exist.")
            if parent_comment_id is not None:
                parent_row = conn.execute(
                    "SELECT datapoint_id FROM comments WHERE id = ?",
                    (parent_comment_id,),
                ).fetchone()
                if parent_row is None:
                    raise KeyError(f"Comment '{parent_comment_id}' does not exist.")
                if parent_row["datapoint_id"] != datapoint_id:
                    raise ValueError("Replies must belong to the same datapoint as the parent.")

            conn.execute(
                """
                INSERT INTO comments (id, datapoint_id, author_id, parent_comment_id, content)
                VALUES (?, ?, ?, ?, ?)
                """,
                (comment_id, datapoint_id, author_id, parent_comment_id, cleaned_content),
            )
        return self.get_comment(comment_id)

    def get_comment(self, comment_id: str) -> dict[str, object]:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT id, datapoint_id, author_id, parent_comment_id, content
                FROM comments
                WHERE id = ?
                """,
                (comment_id,),
            ).fetchone()
        if row is None:
            raise KeyError(f"Comment '{comment_id}' does not exist.")
        upvotes, downvotes = self._comment_vote_counts(comment_id)
        reply_ids = self._reply_ids(comment_id)
        return {
            "comment_id": row["id"],
            "datapoint_id": row["datapoint_id"],
            "author_id": row["author_id"],
            "content": row["content"],
            "parent_comment_id": row["parent_comment_id"],
            "reply_ids": reply_ids,
            "upvotes": upvotes,
            "downvotes": downvotes,
            "net_score": upvotes - downvotes,
        }

    def vote_comment(self, voter_id: str, comment_id: str, vote: int) -> dict[str, object]:
        if vote not in (-1, 1):
            raise ValueError("Votes must be +1 (upvote) or -1 (downvote).")
        with self._connect() as conn:
            if conn.execute("SELECT id FROM users WHERE id = ?", (voter_id,)).fetchone() is None:
                raise KeyError(f"User '{voter_id}' does not exist.")
            if conn.execute("SELECT id FROM comments WHERE id = ?", (comment_id,)).fetchone() is None:
                raise KeyError(f"Comment '{comment_id}' does not exist.")
            try:
                conn.execute(
                    """
                    INSERT INTO comment_votes (comment_id, voter_id, vote)
                    VALUES (?, ?, ?)
                    """,
                    (comment_id, voter_id, vote),
                )
            except sqlite3.IntegrityError as exc:
                raise ValueError("Each user can vote only once per comment/reply.") from exc

        upvotes, downvotes = self._comment_vote_counts(comment_id)
        return {
            "comment_id": comment_id,
            "upvotes": upvotes,
            "downvotes": downvotes,
            "net_score": upvotes - downvotes,
        }

    def get_comment_tree(self, datapoint_id: str) -> dict[str, object]:
        self._require_datapoint(datapoint_id)
        roots = self._top_level_comment_ids(datapoint_id)
        return {
            "datapoint_id": datapoint_id,
            "comments": [self._comment_tree_node(comment_id) for comment_id in roots],
        }

    def get_user_score(self, user_id: str) -> float:
        self._require_user(user_id)
        with self._connect() as conn:
            datapoint_rows = conn.execute(
                "SELECT id FROM datapoints WHERE author_id = ?",
                (user_id,),
            ).fetchall()
        total = len(datapoint_rows)
        if total == 0:
            return 50.0
        positive = 0
        for row in datapoint_rows:
            upvotes, downvotes = self._datapoint_vote_counts(row["id"])
            if self._accuracy_from_counts(upvotes, downvotes) >= self.POSITIVE_DATAPOINT_THRESHOLD:
                positive += 1
        return _clamp_score((positive / total) * 100.0)

    def _require_user(self, user_id: str) -> None:
        with self._connect() as conn:
            row = conn.execute("SELECT id FROM users WHERE id = ?", (user_id,)).fetchone()
        if row is None:
            raise KeyError(f"User '{user_id}' does not exist.")

    def _require_datapoint(self, datapoint_id: str) -> None:
        with self._connect() as conn:
            row = conn.execute("SELECT id FROM datapoints WHERE id = ?", (datapoint_id,)).fetchone()
        if row is None:
            raise KeyError(f"Datapoint '{datapoint_id}' does not exist.")

    def _datapoint_vote_counts(self, datapoint_id: str) -> tuple[int, int]:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT
                    SUM(CASE WHEN vote = 1 THEN 1 ELSE 0 END) AS upvotes,
                    SUM(CASE WHEN vote = -1 THEN 1 ELSE 0 END) AS downvotes
                FROM datapoint_votes
                WHERE datapoint_id = ?
                """,
                (datapoint_id,),
            ).fetchone()
        return int(row["upvotes"] or 0), int(row["downvotes"] or 0)

    def _comment_vote_counts(self, comment_id: str) -> tuple[int, int]:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT
                    SUM(CASE WHEN vote = 1 THEN 1 ELSE 0 END) AS upvotes,
                    SUM(CASE WHEN vote = -1 THEN 1 ELSE 0 END) AS downvotes
                FROM comment_votes
                WHERE comment_id = ?
                """,
                (comment_id,),
            ).fetchone()
        return int(row["upvotes"] or 0), int(row["downvotes"] or 0)

    def _top_level_comment_ids(self, datapoint_id: str) -> list[str]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT id
                FROM comments
                WHERE datapoint_id = ? AND parent_comment_id IS NULL
                ORDER BY created_at ASC, id ASC
                """,
                (datapoint_id,),
            ).fetchall()
        return [row["id"] for row in rows]

    def _reply_ids(self, parent_comment_id: str) -> list[str]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT id
                FROM comments
                WHERE parent_comment_id = ?
                ORDER BY created_at ASC, id ASC
                """,
                (parent_comment_id,),
            ).fetchall()
        return [row["id"] for row in rows]

    def _comment_tree_node(self, comment_id: str) -> dict[str, object]:
        comment = self.get_comment(comment_id)
        return {
            "comment_id": comment["comment_id"],
            "datapoint_id": comment["datapoint_id"],
            "author_id": comment["author_id"],
            "parent_comment_id": comment["parent_comment_id"],
            "content": comment["content"],
            "upvotes": comment["upvotes"],
            "downvotes": comment["downvotes"],
            "net_score": comment["net_score"],
            "replies": [self._comment_tree_node(reply_id) for reply_id in comment["reply_ids"]],
        }

    @staticmethod
    def _accuracy_from_counts(upvotes: int, downvotes: int) -> float:
        total_votes = upvotes + downvotes
        if total_votes == 0:
            return 50.0
        raw = (upvotes / total_votes) * 100.0
        return _clamp_score(raw)
