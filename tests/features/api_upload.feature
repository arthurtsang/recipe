@api
Feature: API recipe image upload
  Upload an image to Wasabi (preview uses dev/recipes prefix).

  Scenario: Upload a recipe cover image
    When I upload a test image to "/api/recipes/upload"
    Then the response status should be 200
    And the response JSON field "url" should contain "wasabisys.com"
