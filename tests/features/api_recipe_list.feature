@api
Feature: API recipe list and search
  Public recipe endpoints on preview (Bearer token not required for read).

  Scenario: List public recipes
    When I GET "/api/recipes"
    Then the response status should be 200
    And the response body should be a JSON array

  Scenario: Search recipes by keyword
    When I POST "/api/recipes/search" with JSON:
      """
      { "keywords": ["soup"], "page": 1, "limit": 5 }
      """
    Then the response status should be 200
    And the response body should be a JSON array
