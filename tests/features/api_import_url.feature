@api
Feature: API URL import (myrecipe.kitchen)
  Queue a recipe URL import, wait for the Cloud Run worker, and save the recipe.

  Scenario: Import and save a myrecipe.kitchen recipe
    When I POST "/api/imports/start" with JSON:
      """
      { "urls": ["https://myrecipe.kitchen/valberg/recipes/view/8"] }
      """
    Then the response status should be 200
    And I store the first import job id
    And the stored import job kind should be "url"
    When I wait for the stored import job to complete
    Then the import result should have a title
    When I POST save-recipe for the stored import job
    Then the response status should be 201
    And the response JSON field "title" should be a non-empty string
    And I store the created recipe id from the response
