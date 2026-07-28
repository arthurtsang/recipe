@browser @legacy
Feature: Navigation
  As a user, I want to navigate the app so that I can access different features.

  Scenario: User can navigate to home from logo
    Given I am on a recipe detail page
    When I click the app logo or title
    Then I should be on the home page

  Scenario: User can access Import History from menu
    Given I am logged in
    When I open the user menu
    And I click the "Import History" menu item
    Then I should see the Import History dialog

  Scenario: User can access Manage API Token from menu
    Given I am logged in
    When I open the user menu
    And I click the "Manage API Token" menu item
    Then I should see the API token management dialog
