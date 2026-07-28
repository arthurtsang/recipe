@api
Feature: API recipe CRUD and versions
  Create, read, update (in-place and new version), and delete via Bearer token.

  Scenario: Create, update, version, and delete a recipe
    When I POST "/api/recipes" with JSON:
      """
      {
        "title": "BDD Test Recipe",
        "description": "Created by Cucumber API test",
        "ingredients": "1 cup flour",
        "instructions": "Mix and bake",
        "cookTime": "30",
        "difficulty": "Easy"
      }
      """
    Then the response status should be 201
    And I store the created recipe id
    When I GET the stored recipe
    Then the response status should be 200
    And the response JSON field "title" should be "BDD Test Recipe"
    When I PUT the stored recipe with JSON:
      """
      {
        "title": "BDD Test Recipe Updated",
        "description": "Updated in place",
        "ingredients": "2 cups flour",
        "instructions": "Mix longer and bake",
        "createNewVersion": false
      }
      """
    Then the response status should be 200
    And the response JSON field "title" should be "BDD Test Recipe Updated"
    When I PUT the stored recipe with JSON:
      """
      {
        "title": "BDD Test Recipe v2",
        "description": "New version",
        "ingredients": "3 cups flour",
        "instructions": "New version instructions",
        "createNewVersion": true,
        "versionName": "BDD v2"
      }
      """
    Then the response status should be 200
    And the response JSON field "title" should be "BDD Test Recipe v2"
    And the recipe should have at least 2 versions
    When I DELETE the stored recipe
    Then the response status should be 204
