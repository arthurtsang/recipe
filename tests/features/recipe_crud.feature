Feature: Recipe Create, Read, Update, Delete
  As a logged-in user, I want to create, view, edit, and delete recipes.

  Scenario: User can create a new recipe
    Given I am logged in
    When I navigate to "Add Recipe"
    And I fill in the recipe form with title "Test Chocolate Cake"
    And I submit the recipe form
    Then I should be on a recipe detail page
    And I should see "Test Chocolate Cake"

  Scenario: User can view recipe details
    Given I am logged in
    And there exists a recipe "Grandma's Soup"
    When I click on the recipe "Grandma's Soup"
    Then I should see the recipe title "Grandma's Soup"
    And I should see recipe ingredients or instructions

  Scenario: User can edit their recipe
    Given I am logged in
    And I have created a recipe "Editable Recipe"
    When I open the recipe "Editable Recipe"
    And I click the edit button
    And I change the title to "Updated Recipe Title"
    And I save the changes
    Then I should see "Updated Recipe Title"

  Scenario: User can delete their recipe
    Given I am logged in
    And I have created a recipe "To Be Deleted"
    When I open the recipe "To Be Deleted"
    And I delete the recipe
    Then I should not see "To Be Deleted" in the recipe list
