import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from ranking_system import RankingService


class RankingServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.service = RankingService()
        self.author = self.service.create_user("author")
        self.voter_a = self.service.create_user("voter-a")
        self.voter_b = self.service.create_user("voter-b")
        self.voter_c = self.service.create_user("voter-c")

    def test_datapoint_vote_only_once_per_user(self) -> None:
        datapoint = self.service.create_datapoint(
            author_id=self.author.user_id,
            latitude=37.7749,
            longitude=-122.4194,
            title="Suspicious activity",
        )

        score_after_upvote = self.service.vote_datapoint(
            voter_id=self.voter_a.user_id,
            datapoint_id=datapoint.datapoint_id,
            vote=1,
        )
        self.assertEqual(score_after_upvote, 100.0)

        with self.assertRaisesRegex(ValueError, "only once per datapoint"):
            self.service.vote_datapoint(
                voter_id=self.voter_a.user_id,
                datapoint_id=datapoint.datapoint_id,
                vote=-1,
            )

        score_after_downvote = self.service.vote_datapoint(
            voter_id=self.voter_b.user_id,
            datapoint_id=datapoint.datapoint_id,
            vote=-1,
        )
        self.assertEqual(score_after_downvote, 50.0)

    def test_datapoint_accuracy_score_minimum_is_one(self) -> None:
        datapoint = self.service.create_datapoint(
            author_id=self.author.user_id,
            latitude=34.0522,
            longitude=-118.2437,
            title="Map marker",
        )
        score = self.service.vote_datapoint(
            voter_id=self.voter_a.user_id,
            datapoint_id=datapoint.datapoint_id,
            vote=-1,
        )
        self.assertEqual(score, 1.0)

    def test_user_score_uses_positive_datapoint_percentage(self) -> None:
        good_datapoint = self.service.create_datapoint(
            author_id=self.author.user_id,
            latitude=1.0,
            longitude=1.0,
            title="Good datapoint",
        )
        bad_datapoint = self.service.create_datapoint(
            author_id=self.author.user_id,
            latitude=2.0,
            longitude=2.0,
            title="Bad datapoint",
        )

        self.service.vote_datapoint(self.voter_a.user_id, good_datapoint.datapoint_id, 1)
        self.service.vote_datapoint(self.voter_a.user_id, bad_datapoint.datapoint_id, -1)

        # One positive (>=51) and one negative datapoint => 50%
        self.assertEqual(self.service.get_user_score(self.author.user_id), 50.0)

        another_good_datapoint = self.service.create_datapoint(
            author_id=self.author.user_id,
            latitude=3.0,
            longitude=3.0,
            title="Another good datapoint",
        )
        self.service.vote_datapoint(self.voter_a.user_id, another_good_datapoint.datapoint_id, 1)

        # Two positive and one negative datapoint => 66.666...
        self.assertAlmostEqual(
            self.service.get_user_score(self.author.user_id),
            66.6666666667,
            places=6,
        )

    def test_comment_character_limit_and_threading(self) -> None:
        datapoint = self.service.create_datapoint(
            author_id=self.author.user_id,
            latitude=10.0,
            longitude=10.0,
            title="Comment target",
        )

        top_level_comment = self.service.create_comment(
            author_id=self.voter_a.user_id,
            datapoint_id=datapoint.datapoint_id,
            content="x" * 255,
        )
        self.assertEqual(top_level_comment.content, "x" * 255)
        self.assertIn(top_level_comment.comment_id, datapoint.top_level_comment_ids)

        with self.assertRaisesRegex(ValueError, "cannot exceed 255 characters"):
            self.service.create_comment(
                author_id=self.voter_b.user_id,
                datapoint_id=datapoint.datapoint_id,
                content="y" * 256,
            )

        reply = self.service.create_comment(
            author_id=self.voter_b.user_id,
            datapoint_id=datapoint.datapoint_id,
            content="Reply content",
            parent_comment_id=top_level_comment.comment_id,
        )
        self.assertEqual(reply.parent_comment_id, top_level_comment.comment_id)
        self.assertIn(reply.comment_id, top_level_comment.reply_ids)

        reply_score = self.service.vote_comment(
            voter_id=self.voter_c.user_id,
            comment_id=reply.comment_id,
            vote=1,
        )
        self.assertEqual(reply_score, 1)

        comment_tree = self.service.get_comment_tree(datapoint.datapoint_id)
        self.assertEqual(len(comment_tree), 1)
        self.assertEqual(comment_tree[0]["comment_id"], top_level_comment.comment_id)
        self.assertEqual(comment_tree[0]["replies"][0]["comment_id"], reply.comment_id)

    def test_comment_vote_only_once_per_user(self) -> None:
        datapoint = self.service.create_datapoint(
            author_id=self.author.user_id,
            latitude=11.0,
            longitude=11.0,
            title="Vote target",
        )
        comment = self.service.create_comment(
            author_id=self.voter_a.user_id,
            datapoint_id=datapoint.datapoint_id,
            content="Top-level comment",
        )

        net_score = self.service.vote_comment(
            voter_id=self.voter_b.user_id,
            comment_id=comment.comment_id,
            vote=1,
        )
        self.assertEqual(net_score, 1)

        with self.assertRaisesRegex(ValueError, "only once per comment/reply"):
            self.service.vote_comment(
                voter_id=self.voter_b.user_id,
                comment_id=comment.comment_id,
                vote=-1,
            )


if __name__ == "__main__":
    unittest.main()
