@api
Feature: API reimport (new version)
  Re-importing the same source URL should add a version to the existing recipe.

  Scenario: Reimport creates a new recipe version
    When I POST "/api/imports/start" with JSON:
      """
      { "urls": ["https://myrecipe.kitchen/valberg/recipes/view/8"] }
      """
    Then the response status should be 200
    And I store the first import job id
    When I wait for the stored import job to complete
    When I POST save-recipe for the stored import job
    Then the response status should be 201
    And I store the created recipe id from the response
    And the recipe should have 1 version
    When I POST "/api/imports/start" with JSON:
      """
      { "urls": ["https://myrecipe.kitchen/valberg/recipes/view/8"] }
      """
    Then the response status should be 200
    And I store the first import job id as "reimportJobId"
    When I wait for the stored import job to complete using context "reimportJobId"
    When I POST save-recipe for import job from context "reimportJobId"
    Then the response status should be 201
    And the response JSON field "id" should equal the stored recipe id
    And the recipe should have at least 2 versions
