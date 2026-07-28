@api
Feature: API recipe ratings
  Rate a recipe via Bearer token.

  Scenario: Rate a newly created recipe
    When I POST "/api/recipes" with JSON:
      """
      {
        "title": "BDD Rating Test Recipe",
        "ingredients": "test",
        "instructions": "test"
      }
      """
    Then the response status should be 201
    And I store the created recipe id
    When I POST ratings on the stored recipe with JSON:
      """
      { "value": 4 }
      """
    Then the response status should be 200
    When I GET ratings on the stored recipe
    Then the response status should be 200
    And the response JSON field "average" should be 4
