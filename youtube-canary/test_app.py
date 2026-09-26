import unittest
from unittest import mock

import app


class CanaryHelpersTest(unittest.TestCase):
    def test_allows_known_youtube_hosts(self):
        self.assertTrue(app.is_allowed_youtube_url("https://www.youtube.com/watch?v=dQw4w9WgXcQ"))
        self.assertTrue(app.is_allowed_youtube_url("https://youtu.be/dQw4w9WgXcQ"))
        self.assertFalse(app.is_allowed_youtube_url("https://youtube.com.evil.example/watch?v=x"))
        self.assertFalse(app.is_allowed_youtube_url("file:///etc/passwd"))

    def test_classifies_bot_challenge(self):
        self.assertEqual(
            app.classify_extractor_failure("ERROR: Sign in to confirm you're not a bot"),
            "bot_challenge",
        )
        self.assertEqual(app.classify_extractor_failure("generic error"), "extract_error")

    def test_prefers_progressive_low_resolution_format(self):
        info = {
            "formats": [
                {"format_id": "v", "url": "https://x/v", "protocol": "https", "vcodec": "avc1", "acodec": "none", "height": 360},
                {"format_id": "p720", "url": "https://x/p720", "protocol": "https", "vcodec": "avc1", "acodec": "mp4a", "height": 720},
                {"format_id": "p360", "url": "https://x/p360", "protocol": "https", "vcodec": "avc1", "acodec": "mp4a", "height": 360},
            ]
        }
        self.assertEqual(app.select_probe_format(info)["format_id"], "p360")

    @mock.patch("app.subprocess.run")
    def test_builds_mweb_bgutil_command(self, run):
        run.return_value = mock.Mock(returncode=1, stdout="", stderr="generic error")
        result, status = app.extract_info("https://youtu.be/example")
        self.assertEqual(status, 502)
        command = run.call_args.args[0]
        self.assertIn("youtube:player_client=mweb", command)
        self.assertIn("youtubepot-bgutilhttp:base_url=http://127.0.0.1:4416", command)
        self.assertIn("--js-runtimes", command)
        self.assertIn("--impersonate", command)
        self.assertEqual(result["status"], "extract_error")


if __name__ == "__main__":
    unittest.main()
