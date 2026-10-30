import unittest
from pathlib import Path
import sys

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from api import create_app
from ranking_system import RankingService


class RankingApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.service = RankingService()
        self.client = TestClient(create_app(service=self.service))

    def test_full_datapoint_scoring_flow(self) -> None:
        author = self.client.post("/users", json={"username": "alice"})
        self.assertEqual(author.status_code, 201)
        author_id = author.json()["user_id"]

        voter_1 = self.client.post("/users", json={"username": "voter-1"})
        voter_2 = self.client.post("/users", json={"username": "voter-2"})
        voter_1_id = voter_1.json()["user_id"]
        voter_2_id = voter_2.json()["user_id"]

        datapoint_resp = self.client.post(
            "/datapoints",
            json={
                "author_id": author_id,
                "latitude": 40.7128,
                "longitude": -74.0060,
                "title": "NYC datapoint",
                "description": "A test datapoint",
            },
        )
        self.assertEqual(datapoint_resp.status_code, 201)
        datapoint_id = datapoint_resp.json()["datapoint_id"]

        upvote_resp = self.client.post(
            f"/datapoints/{datapoint_id}/votes",
            json={"voter_id": voter_1_id, "vote": 1},
        )
        self.assertEqual(upvote_resp.status_code, 200)
        self.assertEqual(upvote_resp.json()["accuracy_score"], 100.0)

        downvote_resp = self.client.post(
            f"/datapoints/{datapoint_id}/votes",
            json={"voter_id": voter_2_id, "vote": -1},
        )
        self.assertEqual(downvote_resp.status_code, 200)
        self.assertEqual(downvote_resp.json()["accuracy_score"], 50.0)

        duplicate_vote_resp = self.client.post(
            f"/datapoints/{datapoint_id}/votes",
            json={"voter_id": voter_2_id, "vote": 1},
        )
        self.assertEqual(duplicate_vote_resp.status_code, 409)

        user_resp = self.client.get(f"/users/{author_id}")
        self.assertEqual(user_resp.status_code, 200)
        self.assertEqual(user_resp.json()["score"], 1.0)

    def test_comment_reply_tree_and_vote_constraints(self) -> None:
        author_id = self.client.post("/users", json={"username": "author"}).json()["user_id"]
        commenter_id = self.client.post("/users", json={"username": "commenter"}).json()["user_id"]
        replier_id = self.client.post("/users", json={"username": "replier"}).json()["user_id"]
        voter_id = self.client.post("/users", json={"username": "voter"}).json()["user_id"]

        datapoint_id = self.client.post(
            "/datapoints",
            json={
                "author_id": author_id,
                "latitude": 47.6062,
                "longitude": -122.3321,
                "title": "Seattle datapoint",
            },
        ).json()["datapoint_id"]

        too_long_comment = self.client.post(
            f"/datapoints/{datapoint_id}/comments",
            json={"author_id": commenter_id, "content": "a" * 256},
        )
        self.assertEqual(too_long_comment.status_code, 422)

        comment_resp = self.client.post(
            f"/datapoints/{datapoint_id}/comments",
            json={"author_id": commenter_id, "content": "Top-level comment"},
        )
        self.assertEqual(comment_resp.status_code, 201)
        top_comment_id = comment_resp.json()["comment_id"]

        reply_resp = self.client.post(
            f"/datapoints/{datapoint_id}/comments",
            json={
                "author_id": replier_id,
                "content": "Reply content",
                "parent_comment_id": top_comment_id,
            },
        )
        self.assertEqual(reply_resp.status_code, 201)
        reply_id = reply_resp.json()["comment_id"]

        vote_reply_resp = self.client.post(
            f"/comments/{reply_id}/votes",
            json={"voter_id": voter_id, "vote": 1},
        )
        self.assertEqual(vote_reply_resp.status_code, 200)
        self.assertEqual(vote_reply_resp.json()["net_score"], 1)

        duplicate_reply_vote = self.client.post(
            f"/comments/{reply_id}/votes",
            json={"voter_id": voter_id, "vote": -1},
        )
        self.assertEqual(duplicate_reply_vote.status_code, 409)

        tree_resp = self.client.get(f"/datapoints/{datapoint_id}/comments/tree")
        self.assertEqual(tree_resp.status_code, 200)
        comments = tree_resp.json()["comments"]
        self.assertEqual(len(comments), 1)
        self.assertEqual(comments[0]["comment_id"], top_comment_id)
        self.assertEqual(comments[0]["replies"][0]["comment_id"], reply_id)


if __name__ == "__main__":
    unittest.main()
