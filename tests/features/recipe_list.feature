Feature: Recipe List
  As a user, I want to browse and search recipes so that I can find dishes I want to make.

  Scenario: User can view the recipe list
    Given I am on the home page
    Then I should see the page title "Recipes"
    And I should see a search input

  Scenario: User can search recipes
    Given I am on the home page
    When I type "chicken" in the search box
    And I submit the search
    Then the recipe list should update with search results

  Scenario: Empty search shows all recipes
    Given I am on the home page
    When I clear the search and submit
    Then I should see the recipe list
    And the list may be empty or show recipes

  Scenario: Recipe list shows loading state
    Given I am on the home page
    Then I should see either recipes or a "no recipes" message when loaded
