# CursorAgent

Persistent ranking and commenting service for map datapoints with a FastAPI HTTP layer.

## What is implemented

- Datapoints can be upvoted or downvoted.
- A user can vote only once per datapoint.
- Datapoint `accuracy_score` is computed from upvote ratio and clamped to `1-100`:
  - `1 up + 1 down = 50`
  - `0 up + 1 down = 1`
  - `1 up + 0 down = 100`
- User score is based on authored datapoints:
  - A datapoint is considered "positive" when `accuracy_score >= 51`.
  - `user_score = (positive_datapoints / total_authored_datapoints) * 100`, clamped to `1-100`.
  - `1 good + 1 bad = 50`
  - `2 good + 1 bad = 66.66...`
- Comments are supported on datapoints with a 255 character limit.
- Comments can have replies (threaded comments).
- Comments and replies can be upvoted/downvoted with one vote per user per comment/reply.
- `get_comment_tree(datapoint_id)` returns nested comments/replies with vote totals.
- API actions are auth-aware: user identity comes from a bearer token, not client-supplied user IDs.
- State is persisted in SQLite (`RANKING_DB_PATH`, default `/workspace/data/ranking.db`).
- Chat responses can be humanized via `POST /chat/humanize` to sound more informal and less AI-like.

## Files

- Core service: `src/ranking_system.py`
- API app: `src/api.py`
- SQLite store: `src/sqlite_store.py`
- Chat tone engine: `src/chat_style.py`
- Tests: `tests/test_ranking_system.py`
- API tests: `tests/test_api.py`
- Chat style tests: `tests/test_chat_style.py`
- Dependencies: `requirements.txt`

## Install dependencies

```bash
python3 -m pip install -r requirements.txt
```

## Run API server

```bash
RANKING_DB_PATH=/workspace/data/ranking.db python3 -m uvicorn src.api:app --reload --port 8000
```

## Key API endpoints

- `POST /auth/register` (returns `token`)
- `GET /auth/me` (requires `Authorization: Bearer <token>`)
- `GET /users/{user_id}`
- `POST /datapoints` (auth required)
- `GET /datapoints/{datapoint_id}`
- `POST /datapoints/{datapoint_id}/votes` (auth required)
- `GET /datapoints/{datapoint_id}/accuracy`
- `POST /datapoints/{datapoint_id}/comments` (auth required)
- `POST /comments/{comment_id}/votes` (auth required)
- `GET /datapoints/{datapoint_id}/comments/tree`
- `POST /chat/humanize` (auth required, informal-tone rewrite)

## Run tests

```bash
python3 -m unittest discover -s tests -p "test_*.py" -v
```