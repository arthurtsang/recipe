Feature: Authentication
  As a user, I want to log in and out so that I can access my recipes and personal features.

  Scenario: User can see login button when not authenticated
    Given I am on the home page
    Then I should see the "Login" button
    And I should not see the "Add Recipe" button

  Scenario: User can log in with mock Google OAuth
    Given I am on the home page
    When I click the "Login" button
    And I complete the mock OAuth flow
    Then I should be logged in
    And I should see the "Add Recipe" button

  Scenario: Logged in user can log out
    Given I am logged in
    When I open the user menu
    And I click the "Logout" menu item
    Then I should not be logged in
    And I should see the "Login" button
