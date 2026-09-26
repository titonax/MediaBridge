import unittest
from unittest import mock

import app


class CanaryHelpersTest(unittest.TestCase):
    def test_maps_supported_provider_hosts(self):
        cases = {
            "https://www.youtube.com/watch?v=dQw4w9WgXcQ": "youtube",
            "https://youtu.be/dQw4w9WgXcQ": "youtube",
            "https://www.facebook.com/reel/123": "facebook",
            "https://www.instagram.com/reel/abc/": "instagram",
            "https://www.tiktok.com/@x/video/123": "tiktok",
            "https://vimeo.com/123": "vimeo",
            "https://www.reddit.com/r/test/comments/abc/post/": "reddit",
            "https://soundcloud.com/a/b": "soundcloud",
            "https://www.bilibili.com/video/BV1xx": "bilibili",
            "https://www.dailymotion.com/video/x123": "dailymotion",
            "https://artist.tumblr.com/post/123": "tumblr",
            "https://vk.com/video1_2": "vk",
            "https://clips.twitch.tv/example": "twitch",
            "https://www.pinterest.com/pin/123/": "pinterest",
            "https://v.douyin.com/example/": "douyin",
            "https://www.mixcloud.com/a/b/": "mixcloud",
            "https://www.nicovideo.jp/watch/sm9": "niconico",
        }
        for url, provider in cases.items():
            with self.subTest(url=url):
                self.assertEqual(app.provider_for_url(url), provider)

    def test_rejects_host_confusion_and_non_http_urls(self):
        self.assertIsNone(app.provider_for_url("https://youtube.com.evil.example/watch?v=x"))
        self.assertIsNone(app.provider_for_url("https://facebook.com.evil.example/reel/1"))
        self.assertIsNone(app.provider_for_url("file:///etc/passwd"))

    def test_classifies_common_extractor_failures(self):
        self.assertEqual(
            app.classify_extractor_failure("ERROR: Sign in to confirm you're not a bot"),
            "bot_challenge",
        )
        self.assertEqual(
            app.classify_extractor_failure("This video is not available in your country"),
            "geo_restricted",
        )
        self.assertEqual(
            app.classify_extractor_failure("ERROR: This video is age-restricted; log in to view"),
            "auth_required",
        )
        self.assertEqual(
            app.classify_extractor_failure("ERROR: Unsupported URL"),
            "unsupported_url",
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

    def test_uses_direct_media_url_when_formats_are_absent(self):
        info = {
            "url": "https://cdn.example/image.jpg",
            "ext": "jpg",
            "http_headers": {"User-Agent": "test"},
        }
        self.assertEqual(app.select_probe_format(info)["url"], info["url"])

    def test_youtube_command_keeps_mweb_and_bgutil(self):
        command = app.build_ytdlp_command("https://youtu.be/example", "youtube")
        self.assertIn("youtube:player_client=mweb", command)
        self.assertIn("youtubepot-bgutilhttp:base_url=http://127.0.0.1:4416", command)

    def test_non_youtube_command_does_not_add_youtube_args(self):
        command = app.build_ytdlp_command("https://vimeo.com/123", "vimeo")
        self.assertNotIn("youtube:player_client=mweb", command)
        self.assertNotIn("youtubepot-bgutilhttp:base_url=http://127.0.0.1:4416", command)
        self.assertIn("--js-runtimes", command)
        self.assertIn("--impersonate", command)

    @mock.patch("app.subprocess.run")
    def test_extract_error_includes_provider(self, run):
        run.return_value = mock.Mock(returncode=1, stdout="", stderr="generic error")
        result, status = app.extract_info("https://vimeo.com/123", "vimeo")
        self.assertEqual(status, 502)
        self.assertEqual(result["status"], "extract_error")
        self.assertEqual(result["provider"], "vimeo")


if __name__ == "__main__":
    unittest.main()
