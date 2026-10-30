# CursorAgent

In-memory ranking and commenting service for map datapoints with a FastAPI HTTP layer.

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

## Files

- Core service: `src/ranking_system.py`
- API app: `src/api.py`
- Tests: `tests/test_ranking_system.py`
- API tests: `tests/test_api.py`
- Dependencies: `requirements.txt`

## Install dependencies

```bash
python3 -m pip install -r requirements.txt
```

## Run API server

```bash
python3 -m uvicorn src.api:app --reload --port 8000
```

## Key API endpoints

- `POST /users`
- `GET /users/{user_id}`
- `POST /datapoints`
- `GET /datapoints/{datapoint_id}`
- `POST /datapoints/{datapoint_id}/votes`
- `GET /datapoints/{datapoint_id}/accuracy`
- `POST /datapoints/{datapoint_id}/comments`
- `POST /comments/{comment_id}/votes`
- `GET /datapoints/{datapoint_id}/comments/tree`

## Run tests

```bash
python3 -m unittest discover -s tests -p "test_*.py" -v
```