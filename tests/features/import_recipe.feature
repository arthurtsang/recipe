@browser @legacy
Feature: Import Recipe
  As a logged-in user, I want to import recipes from URLs so that I can save recipes from the web.

  Scenario: User can open import dialog
    Given I am logged in
    When I click the "Import" button
    Then I should see the Import Recipe dialog
    And I should see the recipe URL input

  Scenario: User can import a single recipe from URL
    Given I am logged in
    And I have opened the import dialog
    When I enter the URL "https://example.com/recipe"
    And I click the import button in the dialog
    Then I should see the import job processing or completed
    And I should see "Mock Imported Recipe" when import completes
    And I can save the imported recipe

  Scenario: User can switch to bulk import mode
    Given I am logged in
    And I have opened the import dialog
    When I click the "Bulk Import" button
    Then I should see a multi-line URL input
    And I should see the bulk import button
