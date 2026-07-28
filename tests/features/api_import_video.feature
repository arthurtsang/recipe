@api
Feature: API video import (Instagram)
  Queue an Instagram reel import and verify the job is classified as video.

  Scenario: Queue Instagram reel import
    When I POST "/api/imports/start" with JSON:
      """
      {
        "urls": [
          "https://www.instagram.com/reel/Da5VXCyFaGd/?utm_source=ig_web_copy_link"
        ]
      }
      """
    Then the response status should be 200
    And I store the first import job id
    And the stored import job kind should be "video"
    When I wait for the stored import job to complete with timeout 600000 ms
    Then the import result should have a title
