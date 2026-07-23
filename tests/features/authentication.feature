Feature: Authentication
  As a user, I want to log in and out so that I can access my recipes and personal features.

  Scenario: User can see login button when not authenticated
    Given I am on the home page as a guest
    Then I should see the "Login" button
    And I should not see the "Add Recipe" button

  @requires-storage-state
  Scenario: Logged-in user can access personal actions
    Given I am logged in
    Then I should see the "Add Recipe" button

  @requires-storage-state
  Scenario: Logged in user can log out
    Given I am logged in
    When I open the user menu
    And I click the "Logout" menu item
    Then I should not be logged in
    And I should see the "Login" button
