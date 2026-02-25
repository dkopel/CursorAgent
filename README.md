# CursorAgent

In-memory ranking and commenting service for map datapoints.

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
- Tests: `tests/test_ranking_system.py`

## Run tests

```bash
python -m unittest discover -s tests -p "test_*.py"
```