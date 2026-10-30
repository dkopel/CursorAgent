import unittest
from pathlib import Path
import sys
import tempfile

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from api import create_app


class RankingApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = str(Path(self.temp_dir.name) / "ranking.db")
        self.client = TestClient(create_app(db_path=self.db_path))

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def _register(self, username: str) -> dict[str, object]:
        response = self.client.post("/auth/register", json={"username": username})
        self.assertEqual(response.status_code, 201)
        return response.json()

    @staticmethod
    def _auth_headers(token: str) -> dict[str, str]:
        return {"Authorization": f"Bearer {token}"}

    def test_auth_required_for_protected_routes(self) -> None:
        response = self.client.post(
            "/datapoints",
            json={
                "latitude": 1.0,
                "longitude": 2.0,
                "title": "Needs auth",
            },
        )
        self.assertEqual(response.status_code, 401)

        chat_response = self.client.post(
            "/chat/humanize",
            json={"draft": "Certainly, I will do that."},
        )
        self.assertEqual(chat_response.status_code, 401)

    def test_full_datapoint_scoring_flow(self) -> None:
        author = self._register("alice")
        voter_1 = self._register("voter-1")
        voter_2 = self._register("voter-2")
        author_id = author["user_id"]

        datapoint_resp = self.client.post(
            "/datapoints",
            json={
                "latitude": 40.7128,
                "longitude": -74.0060,
                "title": "NYC datapoint",
                "description": "A test datapoint",
            },
            headers=self._auth_headers(author["token"]),
        )
        self.assertEqual(datapoint_resp.status_code, 201)
        datapoint_id = datapoint_resp.json()["datapoint_id"]

        upvote_resp = self.client.post(
            f"/datapoints/{datapoint_id}/votes",
            json={"vote": 1},
            headers=self._auth_headers(voter_1["token"]),
        )
        self.assertEqual(upvote_resp.status_code, 200)
        self.assertEqual(upvote_resp.json()["accuracy_score"], 100.0)

        downvote_resp = self.client.post(
            f"/datapoints/{datapoint_id}/votes",
            json={"vote": -1},
            headers=self._auth_headers(voter_2["token"]),
        )
        self.assertEqual(downvote_resp.status_code, 200)
        self.assertEqual(downvote_resp.json()["accuracy_score"], 50.0)

        duplicate_vote_resp = self.client.post(
            f"/datapoints/{datapoint_id}/votes",
            json={"vote": 1},
            headers=self._auth_headers(voter_2["token"]),
        )
        self.assertEqual(duplicate_vote_resp.status_code, 409)

        user_resp = self.client.get(f"/users/{author_id}")
        self.assertEqual(user_resp.status_code, 200)
        self.assertEqual(user_resp.json()["score"], 1.0)

    def test_comment_reply_tree_and_vote_constraints(self) -> None:
        author = self._register("author")
        commenter = self._register("commenter")
        replier = self._register("replier")
        voter = self._register("voter")
        author_id = author["user_id"]

        datapoint_id = self.client.post(
            "/datapoints",
            json={
                "latitude": 47.6062,
                "longitude": -122.3321,
                "title": "Seattle datapoint",
            },
            headers=self._auth_headers(author["token"]),
        ).json()["datapoint_id"]

        too_long_comment = self.client.post(
            f"/datapoints/{datapoint_id}/comments",
            json={"content": "a" * 256},
            headers=self._auth_headers(commenter["token"]),
        )
        self.assertEqual(too_long_comment.status_code, 422)

        comment_resp = self.client.post(
            f"/datapoints/{datapoint_id}/comments",
            json={"content": "Top-level comment"},
            headers=self._auth_headers(commenter["token"]),
        )
        self.assertEqual(comment_resp.status_code, 201)
        top_comment_id = comment_resp.json()["comment_id"]

        reply_resp = self.client.post(
            f"/datapoints/{datapoint_id}/comments",
            json={
                "content": "Reply content",
                "parent_comment_id": top_comment_id,
            },
            headers=self._auth_headers(replier["token"]),
        )
        self.assertEqual(reply_resp.status_code, 201)
        reply_id = reply_resp.json()["comment_id"]

        vote_reply_resp = self.client.post(
            f"/comments/{reply_id}/votes",
            json={"vote": 1},
            headers=self._auth_headers(voter["token"]),
        )
        self.assertEqual(vote_reply_resp.status_code, 200)
        self.assertEqual(vote_reply_resp.json()["net_score"], 1)

        duplicate_reply_vote = self.client.post(
            f"/comments/{reply_id}/votes",
            json={"vote": -1},
            headers=self._auth_headers(voter["token"]),
        )
        self.assertEqual(duplicate_reply_vote.status_code, 409)

        tree_resp = self.client.get(f"/datapoints/{datapoint_id}/comments/tree")
        self.assertEqual(tree_resp.status_code, 200)
        comments = tree_resp.json()["comments"]
        self.assertEqual(len(comments), 1)
        self.assertEqual(comments[0]["comment_id"], top_comment_id)
        self.assertEqual(comments[0]["replies"][0]["comment_id"], reply_id)

    def test_persistence_across_app_instances(self) -> None:
        author = self._register("persist-author")
        datapoint_resp = self.client.post(
            "/datapoints",
            json={"latitude": 10.0, "longitude": 10.0, "title": "Persistent point"},
            headers=self._auth_headers(author["token"]),
        )
        self.assertEqual(datapoint_resp.status_code, 201)
        datapoint_id = datapoint_resp.json()["datapoint_id"]

        # Re-create app on the same SQLite file and verify prior data still exists.
        second_client = TestClient(create_app(db_path=self.db_path))
        fetched = second_client.get(f"/datapoints/{datapoint_id}")
        self.assertEqual(fetched.status_code, 200)
        self.assertEqual(fetched.json()["title"], "Persistent point")

    def test_me_endpoint(self) -> None:
        user = self._register("profile-user")
        me_resp = self.client.get(
            "/auth/me",
            headers=self._auth_headers(user["token"]),
        )
        self.assertEqual(me_resp.status_code, 200)
        self.assertEqual(me_resp.json()["user_id"], user["user_id"])
        self.assertEqual(me_resp.json()["username"], "profile-user")

    def test_chat_humanize_endpoint(self) -> None:
        user = self._register("chat-user")
        response = self.client.post(
            "/chat/humanize",
            json={
                "draft": "As an AI language model, certainly, I will not leave this unfinished.",
                "include_follow_up": True,
            },
            headers=self._auth_headers(user["token"]),
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["style"], "informal")
        self.assertNotIn("As an AI language model", payload["message"])
        self.assertIn("I'll", payload["message"])
        self.assertIn("want me to keep going?", payload["message"])


if __name__ == "__main__":
    unittest.main()
